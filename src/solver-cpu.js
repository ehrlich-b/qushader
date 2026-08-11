/**
 * CPU reference solver: Visscher leapfrog TDSE on typed arrays.
 *
 * This module mirrors the GPU path (src/solver.js + shaders/evolve-real.glsl
 * and shaders/evolve-imag.glsl) exactly:
 *
 *   - Re(psi) and Im(psi) live in separate Float64Array grids (N x N, row-major,
 *     texel (i, j) -> index i + j*N, position = (i*dx, j*dx) in atomic units).
 *   - Im(psi) is staggered half a timestep ahead of Re(psi), exactly like the
 *     two solver textures.
 *   - One step() applies the two Visscher half-steps in the same order as the
 *     GPU ping-pong:
 *       Step A: R(t+dt)  = R(t)       - dt * H[I(t+dt/2)]  - dt * gamma * R(t)
 *       Step B: I(t+3dt/2) = I(t+dt/2) + dt * H[R(t+dt)]   - dt * gamma * I(t+dt/2)
 *     with H[psi] = -0.5 * lap(psi) + V * psi.
 *   - The laplacian is the same 5-point stencil with CLAMP_TO_EDGE sampling
 *     (boundary texels are replicated, exactly like texelFetch on a clamped
 *     texture).
 *   - The same quadratic absorbing mask gamma = 0.5*t^2 (t = 1 - d/w, d = min
 *     distance to the grid edge in texels, w = floor(N*0.1)) is applied in the
 *     same places as the GPU shaders.
 *
 * Precision note: the GPU stores values in RGBA32F (float32). The CPU reference
 * intentionally uses Float64Array so that the norm/energy conservation
 * assertions in the test suite measure the discretization scheme itself, not
 * accumulated float32 rounding. The discretization, staggering, and boundary
 * handling are identical to the GPU.
 *
 * The module is plain ES, no DOM, no WebGL.
 */

const TWO_PI = 2.0 * Math.PI;

/**
 * Absorbing boundary mask exactly as in the GPU shaders' `absorbMask`:
 * uses texel coordinates with gl_FragCoord semantics (row 0 -> d=0, row N-1 -> d=1).
 * Returns 0.5 * t^2 for d < w, else 0.
 */
function absorbMaskValue(i, j, N, w) {
  const ex = Math.min(i, N - i);
  const ey = Math.min(j, N - j);
  const d = Math.min(ex, ey);
  if (d >= w) return 0.0;
  const t = 1.0 - d / w;
  return 0.5 * t * t;
}

/**
 * 5-point laplacian stencil sum (without the 1/dx^2 factor, matching the
 * shaders' `(Ip + Im + Jp + Jm - 4.0*c)`) with CLAMP_TO_EDGE boundary handling.
 * Writes into `dst` so the input grid can be reused unchanged.
 */
function computeStencil(src, dst, N) {
  const Nm1 = N - 1;
  for (let j = 0; j < N; j++) {
    const jn = j < Nm1 ? j + 1 : Nm1;
    const jp = j > 0 ? j - 1 : 0;
    const row = j * N;
    const rowN = jn * N;
    const rowP = jp * N;
    for (let i = 0; i < N; i++) {
      const inb = i < Nm1 ? i + 1 : Nm1;
      const ipb = i > 0 ? i - 1 : 0;
      const k = row + i;
      dst[k] = src[row + inb] + src[row + ipb] + src[rowN + i] + src[rowP + i] - 4.0 * src[k];
    }
  }
}

export class CpuSolver {
  /**
   * @param {number} N grid size (N x N cells)
   * @param {number} dx grid spacing in atomic units (a.u.)
   * @param {number} dt timestep in atomic units (must satisfy dt < dx^2/2 for
   *   stability, the same CFL condition the GPU solver relies on)
   */
  constructor(N, dx, dt) {
    this.N = N;
    this.dx = dx;
    this.dt = dt;
    this.absorbWidth = Math.floor(N * 0.1); // 10% border, same as Solver

    this.real = new Float64Array(N * N);
    this.imag = new Float64Array(N * N);

    // Scratch buffer for laplacian stencil sums (reused across half-steps)
    this._stencil = new Float64Array(N * N);

    // Precomputed absorbing mask (static per grid size)
    this.mask = new Float64Array(N * N);
    const w = this.absorbWidth;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.mask[i + j * N] = absorbMaskValue(i, j, N, w);
      }
    }

    // Stability/reporting state
    this.blownUp = false;
    this.maxAbs = 0.0;
    // Above this peak amplitude a step is considered blown up (returns false).
    this.blowupLimit = 1e8;
  }

  /**
   * One full Visscher leapfrog step (both half-steps, same order as the GPU).
   *
   * @param {Float64Array} potential N*N potential grid V(x,y) in atomic units.
   * @returns {boolean} true if the step stayed finite and below the blowup
   *   threshold; false if the evolution is unstable (CFL violated) and reports
   *   the blowup by setting this.blownUp = true.
   */
  step(potential) {
    const N = this.N;
    const NN = N * N;
    const dx = this.dx;
    const dt = this.dt;
    const invDx2 = 1.0 / (dx * dx);

    const real = this.real;
    const imag = this.imag;
    const maskArr = this.mask;
    const lap = this._stencil;
    const V = potential;

    // Step A: evolve Real using the staggered Im and the old Real for damping.
    computeStencil(imag, lap, N);
    for (let k = 0; k < NN; k++) {
      const R = real[k];
      const I = imag[k];
      const HI = -0.5 * lap[k] * invDx2 + V[k] * I;
      real[k] = R - dt * HI - dt * maskArr[k] * R;
    }

    // Step B: evolve Imag using the freshly-updated Real.
    computeStencil(real, lap, N);
    let maxAbs = 0.0;
    for (let k = 0; k < NN; k++) {
      const R = real[k];
      const I = imag[k];
      const HR = -0.5 * lap[k] * invDx2 + V[k] * R;
      const Inew = I + dt * HR - dt * maskArr[k] * I;
      imag[k] = Inew;
      const aR = R < 0.0 ? -R : R;
      const aI = Inew < 0.0 ? -Inew : Inew;
      const a = aR > aI ? aR : aI;
      if (a > maxAbs) maxAbs = a;
    }

    this.maxAbs = maxAbs;
    if (!Number.isFinite(maxAbs) || maxAbs > this.blowupLimit) {
      this.blownUp = true;
      return false;
    }
    return true;
  }

  /**
   * Prime the staggered imaginary half-step (strict-correctness initialization,
   * as recommended in DESIGN.md: "For strict correctness, evolve Im by dt/2
   * after initialization").
   *
   * The leapfrog stores Im at t + dt/2 while the initializer writes Im at t=0,
   * an O(dt) inconsistency that causes a slow secular norm drift. Fix it by
   * advancing Im by one half-step:
   *
   *   Im(dt/2) = Im(0) + (dt/2) * H * Re(0)      (for the e^{+iHt} convention)
   *
   * derived from psi(dt/2) = e^{+iH dt/2} psi(0) ≈ (1 + i dt/2 H) psi(0), so
   * Im psi(dt/2) = Im psi(0) + (dt/2) H Re psi(0). At this point the real grid
   * already holds Re psi(0), so the step is exactly one half of a Step B.
   */
  primeImagHalfStep(potential) {
    const N = this.N;
    const NN = N * N;
    const invDx2 = 1.0 / (this.dx * this.dx);
    const half = 0.5 * this.dt;
    const real = this.real;
    const imag = this.imag;
    const lap = this._stencil;
    const V = potential;

    computeStencil(real, lap, N);
    for (let k = 0; k < NN; k++) {
      imag[k] += half * ((-0.5 * lap[k]) * invDx2 + V[k] * real[k]);
    }
  }

  /** Total probability Sum(|psi|^2) * dx^2. */
  norm() {
    const N = this.N;
    const NN = N * N;
    const dx = this.dx;
    const real = this.real;
    const imag = this.imag;
    let s = 0.0;
    for (let k = 0; k < NN; k++) {
      const R = real[k];
      const I = imag[k];
      s += R * R + I * I;
    }
    return s * dx * dx;
  }

  /**
   * Expectation value of the x coordinate (a.u.), computed from the on-grid
   * density R^2 + I^2 just like the GPU renderer/observables.
   * x of texel i is i*dx.
   */
  expectX() {
    const N = this.N;
    const dx = this.dx;
    const real = this.real;
    const imag = this.imag;
    let num = 0.0;
    let den = 0.0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = i + j * N;
        const rho = real[k] * real[k] + imag[k] * imag[k];
        num += i * rho;
        den += rho;
      }
    }
    const area = dx * dx;
    const norm = den * area;
    // num*area/norm = (sum_i i*rho)/(sum rho) = texel centroid; x = texel*dx
    return norm > 0 ? ((num * area) / norm) * dx : 0.0;
  }

  /** Expectation value of the x coordinate, reading position as (i + 0.5)*dx. */
  expectXCentered() {
    const N = this.N;
    const dx = this.dx;
    const real = this.real;
    const imag = this.imag;
    let num = 0.0;
    let den = 0.0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = i + j * N;
        const rho = real[k] * real[k] + imag[k] * imag[k];
        num += (i + 0.5) * rho;
        den += rho;
      }
    }
    const area = dx * dx;
    const norm = den * area;
    return norm > 0 ? ((num * area) / norm) * dx : 0.0;
  }

  /** Energy expectation <H> in a.u. using the same discrete H as reduce.glsl. */
  energy(potential) {
    const N = this.N;
    const NN = N * N;
    const dx = this.dx;
    const invDx2 = 1.0 / (dx * dx);
    const real = this.real;
    const imag = this.imag;
    const lap = this._stencil;
    const V = potential;

    computeStencil(real, lap, N);
    let eR = 0.0;
    for (let k = 0; k < NN; k++) {
      eR += real[k] * lap[k];
    }

    computeStencil(imag, lap, N);
    let eI = 0.0;
    let norm = 0.0;
    for (let k = 0; k < NN; k++) {
      eI += imag[k] * lap[k];
      norm += real[k] * real[k] + imag[k] * imag[k];
    }

    let eV = 0.0;
    for (let k = 0; k < NN; k++) {
      eV += V[k] * (real[k] * real[k] + imag[k] * imag[k]);
    }

    const total = (-0.5 * (eR + eI) * invDx2 + eV) * dx * dx;
    return norm > 0 ? total / (norm * dx * dx) : 0.0;
  }
}

/**
 * Build a Gaussian wavepacket grid exactly like the GPU initializer
 * (src/shaders/initialize.glsl):
 *
 *   psi(x,y) = Nc * exp(-|r - r0|^2 / (4*sigma^2)) * exp(i * k0 . r)
 *   Nc = 1 / (sigma * sqrt(2*pi))            (2D normalized: Nc^2 * 2*pi*sigma^2 = 1)
 *   Re = Nc * env * cos(k0 . r),  Im = Nc * env * sin(k0 . r) with r = (i*dx, j*dx)
 *   (the phase uses the absolute position, exactly like the shader)
 *
 * @returns {{real: Float64Array, imag: Float64Array}}
 */
export function gaussianPacket(N, dx, { x0, y0, kx, ky, sigma }) {
  const real = new Float64Array(N * N);
  const imag = new Float64Array(N * N);
  const Nc = 1.0 / (sigma * Math.sqrt(TWO_PI));
  const scale4 = 1.0 / (4.0 * sigma * sigma);
  for (let j = 0; j < N; j++) {
    const y = j * dx;
    const dy = y - y0;
    for (let i = 0; i < N; i++) {
      const x = i * dx;
      const dxr = x - x0;
      const r2 = dxr * dxr + dy * dy;
      const env = Nc * Math.exp(-r2 * scale4);
      const phase = kx * x + ky * y;
      const k = i + j * N;
      real[k] = env * Math.cos(phase);
      imag[k] = env * Math.sin(phase);
    }
  }
  return { real, imag };
}

/** Zero potential grid (free particle). */
export function zeroPotential(N) {
  return new Float64Array(N * N);
}

/**
 * Harmonic oscillator potential matching potential.glsl type 2 (HARMONIC):
 *   V(r) = 0.5 * kappa * |r - center|^2
 * with r and center in atomic units.
 */
export function harmonicPotential(N, dx, cx, cy, kappa) {
  const V = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    const y = j * dx;
    const dy = y - cy;
    for (let i = 0; i < N; i++) {
      const x = i * dx;
      const dxr = x - cx;
      V[i + j * N] = 0.5 * kappa * (dxr * dxr + dy * dy);
    }
  }
  return V;
}

/**
 * 2D Coulomb potential matching potential.glsl type 0, mode 0:
 *   V(r) = Z * 0.5 * log((r^2 + eps^2) / r_ref^2),  r_ref = N*dx*0.5
 * with eps the softening. Defaults mirror the GPU (eps = dx*0.5).
 */
export function coulombPotential(N, dx, cx, cy, Z = 1.0, eps = null) {
  if (eps === null) eps = dx * 0.5;
  const V = new Float64Array(N * N);
  const rRef = N * dx * 0.5;
  const eps2 = eps * eps;
  const rRef2 = rRef * rRef;
  for (let j = 0; j < N; j++) {
    const y = j * dx;
    const dy = y - cy;
    for (let i = 0; i < N; i++) {
      const x = i * dx;
      const dxr = x - cx;
      const r2 = dxr * dxr + dy * dy + eps2;
      V[i + j * N] = Z * 0.5 * Math.log(r2 / rRef2);
    }
  }
  return V;
}
