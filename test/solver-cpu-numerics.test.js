/**
 * Numeric-exactness tests for the CPU reference solver's never-exercised
 * numeric pieces: the 2D Coulomb potential generator, the absorbing-boundary
 * mask array, and the x-centered expectation-value accessor.
 *
 * These tests were written against the gap left by test/solver.test.js, which
 * covers solver dynamics (norm, group velocity, HO stationarity, CFL blowup)
 * but never inspects coulombPotential, the .mask values, or expectXCentered.
 *
 * Run with: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CpuSolver, coulombPotential, gaussianPacket } from '../src/solver-cpu.js';

// ---------------------------------------------------------------------------
// 1. coulombPotential hand-derived values (N=10, dx=1, cx=cy=5, Z=1, eps=0.5)
// ---------------------------------------------------------------------------
test('coulombPotential: hand-derived values at texels (5,5) and (6,5)', () => {
  const N = 10;
  const dx = 1;
  const cx = 5;
  const cy = 5;
  const Z = 1;
  const eps = 0.5;

  const V = coulombPotential(N, dx, cx, cy, Z, eps);

  // V(r) = Z * 0.5 * log(r2 / rRef2),  r2 = (x-cx)^2 + (y-cy)^2 + eps^2,
  // rRef = N*dx*0.5 = 10*1*0.5 = 5, so rRef2 = 25.
  //
  // Center texel (i=5, j=5): x = 5, y = 5, dxr = dy = 0.
  //   r2 = 0 + 0 + 0.25 = 0.25
  //   V  = 0.5 * log(0.25/25) = 0.5 * log(0.01)
  //      = 0.5 * (-4.605170185988091) = -2.3025850929940455
  const kCenter = 5 + 5 * N;
  const expectedCenter = 0.5 * Math.log(0.25 / 25); // -2.3025850929940455
  assert.ok(
    Math.abs(V[kCenter] - expectedCenter) < 1e-12,
    `center texel V = ${V[kCenter]} should be ${expectedCenter}`,
  );

  // Texel (i=6, j=5): x = 6, y = 5, dxr = 1, dy = 0.
  //   r2 = 1 + 0 + 0.25 = 1.25
  //   V  = 0.5 * log(1.25/25) = 0.5 * log(0.05)
  //      = 0.5 * (-2.995732273553991) = -1.4978661367769954
  const k65 = 6 + 5 * N;
  const expected65 = 0.5 * Math.log(1.25 / 25); // -1.4978661367769954
  assert.ok(
    Math.abs(V[k65] - expected65) < 1e-12,
    `texel (6,5) V = ${V[k65]} should be ${expected65}`,
  );
});

// ---------------------------------------------------------------------------
// 2. Z linearity: V for Z=-1 is the exact negation of V for Z=1
// ---------------------------------------------------------------------------
test('coulombPotential: V is exactly linear in Z (Z=-1 negates Z=1)', () => {
  const N = 10;
  const dx = 1;
  const cx = 5;
  const cy = 5;
  const eps = 0.5;

  const Vpos = coulombPotential(N, dx, cx, cy, 1, eps);
  const Vneg = coulombPotential(N, dx, cx, cy, -1, eps);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = i + j * N;
      // V = Z * 0.5 * log(r2/rRef2) is linear in Z, so the Z=-1 grid must be
      // the bit-exact negation of the Z=1 grid (float sign flip is exact).
      assert.equal(Vneg[k], -Vpos[k], `V[-1] texel (${i},${j}) not exactly -V[1]`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. eps=0 singularity is real (-Infinity at the exact center), not clamped
// ---------------------------------------------------------------------------
test('coulombPotential: eps=0 at exact center gives -Infinity (not NaN/finite)', () => {
  const N = 10;
  const dx = 1;
  const cx = 5;
  const cy = 5;

  // eps=0 at the center texel (5,5): dxr = dy = 0, r2 = 0, r2/rRef2 = 0,
  // log(0) = -Infinity, V = 0.5 * (-Infinity) = -Infinity. The implementation
  // must NOT clamp this to a finite number (or produce NaN via 0/0).
  const V = coulombPotential(N, dx, cx, cy, 1, 0);
  const kCenter = 5 + 5 * N;
  assert.equal(V[kCenter], Number.NEGATIVE_INFINITY);
});

// ---------------------------------------------------------------------------
// 4. eps=0, r == rRef gives V == 0 exactly
// ---------------------------------------------------------------------------
test('coulombPotential: eps=0 at exactly r == rRef gives V == 0', () => {
  // N=20, dx=0.5, cx=0, cy=0 -> rRef = N*dx*0.5 = 20*0.5*0.5 = 5, rRef2 = 25.
  // Texel (i=10, j=0): x = 10*dx = 5, y = 0, distance 5 from center, so
  // r2 = 25 + 0 + 0 = 25, r2/rRef2 = 1, log(1) = 0, V = 0.5*0 = 0 (exactly).
  const N = 20;
  const dx = 0.5;
  const V = coulombPotential(N, dx, 0, 0, 1, 0);
  const k = 10 + 0 * N;
  assert.equal(V[k], 0);
});

// ---------------------------------------------------------------------------
// 5. Absorbing mask values off a real CpuSolver instance (N=100, w=10)
// ---------------------------------------------------------------------------
test('absorbing mask: hand-derived texel values, incl. corner == edge midpoint', () => {
  const solver = new CpuSolver(100, 1, 0.001);
  const w = solver.absorbWidth; // floor(100*0.1) = 10
  assert.equal(w, 10);
  const mask = solver.mask;
  const idx = (i, j) => i + j * 100;

  // Mask switch: mask = 0.5 * (1 - d/w)^2 for d < w, else 0, with
  // d = min(min(i,N-i), min(j,N-j)).

  // (i=0, j=50): ex = min(0,100)=0, ey = min(50,50)=50, d = min(0,50) = 0.
  //   d < w, t = 1 - 0/10 = 1, mask = 0.5 * 1 = 0.5 (exact).
  assert.equal(mask[idx(0, 50)], 0.5);

  // (i=5, j=50): ex = 5, ey = 50, d = min(5,50) = 5.
  //   t = 1 - 5/10 = 0.5, mask = 0.5 * 0.5^2 = 0.5 * 0.25 = 0.125 (exact).
  assert.equal(mask[idx(5, 50)], 0.125);

  // (i=10, j=50): ex = min(10,90) = 10, d = 10 = w, so d >= w -> mask = 0 (exact).
  assert.equal(mask[idx(10, 50)], 0);

  // (i=50, j=50): interior, d = 50 >= w -> mask = 0 (exact).
  assert.equal(mask[idx(50, 50)], 0);

  // Corner (i=0, j=0): ex = 0, ey = 0, d = min(0,0) = 0, same t=1 -> 0.5.
  //   The mask uses min(ex,ey), NOT a corner-amplified distance, so a corner
  //   texel dampens exactly like an edge midpoint, not quadratically more.
  assert.equal(mask[idx(0, 0)], 0.5);

  // (i=3, j=3): ex = 3, ey = 3, d = 3, t = 1 - 3/10 = 0.7,
  //   mask = 0.5 * 0.7^2 = 0.5 * 0.49 = 0.245 in real arithmetic. Because t
  //   = 1 - 3/10 rounds in float64, the stored double is the closest
  //   representable value 0.24499999999999997 (2.8e-17 below 0.245), so assert
  //   within 1e-12 rather than bit-exact.
  const expected33 = 0.5 * 0.7 * 0.7;
  assert.ok(
    Math.abs(mask[idx(3, 3)] - 0.245) < 1e-12,
    `mask(3,3) = ${mask[idx(3, 3)]} should be 0.245 (closest double ${expected33})`,
  );
});

// ---------------------------------------------------------------------------
// 6. expectXCentered() === expectX() + 0.5*dx for any nonzero-norm state
// ---------------------------------------------------------------------------
test('expectXCentered === expectX + 0.5*dx (algebraic identity, asymmetric packet)', () => {
  const N = 64;
  const dx = 100 / 64;

  // Deliberately asymmetric packet (off-grid-center position, nonzero and
  // unequal momenta) so the identity is exercised away from any symmetry.
  const p = gaussianPacket(N, dx, { x0: 37.123, y0: 22.7, kx: 0.4, ky: -0.1, sigma: 5 });

  // A static, un-evolved packet suffices: this identity is about the CURRENT
  // density rho = |psi|^2, not about dynamics.
  const solver = new CpuSolver(N, dx, 1e-3);
  solver.real.set(p.real);
  solver.imag.set(p.imag);

  // Algebraic reason this holds for ANY state with nonzero total norm:
  // both expectX and expectXCentered average the SAME rho weights over the
  // SAME grid and multiply by dx; the only difference is that expectXCentered
  // adds the constant +0.5 to every weight. A constant weight shift factors
  // out of a weighted average exactly:
  //   sum (i+0.5)*rho / sum rho = (sum i*rho / sum rho) + 0.5*(sum rho / sum rho)
  //                              = (sum i*rho / sum rho) + 0.5
  // so expectXCentered = expectX + 0.5*dx, for ANY nonzero-norm density.
  const ex = solver.expectX();
  const exc = solver.expectXCentered();
  assert.ok(
    Math.abs(exc - (ex + 0.5 * dx)) < 1e-9,
    `expectXCentered = ${exc} should equal expectX + 0.5*dx = ${ex + 0.5 * dx}`,
  );
});
