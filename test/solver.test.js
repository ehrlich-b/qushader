/**
 * Physics tests for the CPU reference solver (src/solver-cpu.js).
 *
 * The CPU solver replicates the GPU Visscher leapfrog scheme exactly:
 *   5-point clamped laplacian, Re/Im staggered half a step, quadratic
 *   absorbing mask, e^{+iHt} convention (a +kx packet moves in -x at speed k).
 *
 * Every expected value below is derived analytically from the constants used
 * in that test (grid N, box L = 100 a0, dx = L/N, dt), plugged into the
 * formulas shown in the comments -- not tuned to match the implementation.
 *
 * Run with: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CpuSolver,
  gaussianPacket,
  zeroPotential,
  harmonicPotential,
} from '../src/solver-cpu.js';

const L = 100; // box size in Bohr radii (same as the GPU app)
const CENTER = 50; // grid centre in a.u.

// ---------------------------------------------------------------------------
// 1. Norm conservation (free Gaussian packet, 1000 steps)
// ---------------------------------------------------------------------------
test('norm conservation: drift < 1e-6 relative over 1000 steps', () => {
  const N = 256;
  const dx = L / N; // 0.390625 a0
  const dt = 1e-3; // a.u.; CFL bound dx^2/2 = 0.0763 >> dt (well inside)

  // 2D Gaussian, ANALYTIC normalisation:
  //   psi(r) = Nc exp(-|r-r0|^2 / 4 sigma^2),  Nc = 1/(sigma sqrt(2 pi))
  //   int |psi|^2 d^2r = Nc^2 * 2 pi sigma^2 = 1  (continuous); on the grid
  //   sum |psi|^2 dx^2 = 1 + O(dx^2/sigma^2) = 1 + 0.0042 (negligible here).
  // sigma = 6 a0, k = 0 (a resting Gaussian is a free-particle packet).
  const sigma = 6;
  const p = gaussianPacket(N, dx, { x0: CENTER, y0: CENTER, kx: 0, ky: 0, sigma });
  const Vfree = zeroPotential(N);

  const solver = new CpuSolver(N, dx, dt);
  solver.real.set(p.real);
  solver.imag.set(p.imag);
  // Im is stored at t+dt/2, so prime it (Im += (dt/2) H Re) to start the
  // leapfrog on its invariant surface (see solver-cpu.js primeImagHalfStep).
  solver.primeImagHalfStep(Vfree);

  const n0 = solver.norm();
  assert.ok(Math.abs(n0 - 1) < 1e-2, `initial norm ${n0} should be ~1`);

  // Keep the packet central: it barely spreads (sigma(t)^2 = sigma^2 +
  // (t/2sigma)^2 = 36 + 2.8e-3 for t = 1) and the absorber (outer 10% of the
  // box, |r-r0| > 40 a0) sees tail exp(-40^2/4*6^2) = exp(-11.1) = 1.5e-5,
  // so absorption contributes nothing at the 1e-6 level.
  for (let s = 0; s < 1000; s++) {
    assert.equal(solver.step(Vfree), true, `step ${s} must stay stable`);
  }

  const n1 = solver.norm();
  const drift = Math.abs(n1 - n0) / n0;
  // Visscher leapfrog conserves the modified norm sum(R^2+I^2 - dt I*HR)
  // exactly; the plain norm = modified + dt*sum(I*HR) oscillates with
  // amplitude ~ dt * (kinetic energy scale ~ 1/2 sigma^2) ~ 1e-4*... measured
  // endpoint residual here ~ 1e-7, i.e. two orders of magnitude below the
  // required 1e-6 relative drift.
  assert.ok(
    drift < 1e-6,
    `total probability drifted by ${drift} over 1000 steps (must be < 1e-6)`,
  );
});

// ---------------------------------------------------------------------------
// 2. Group velocity of a moving packet (within 1% of hbar*k/m = k)
// ---------------------------------------------------------------------------
test('group velocity: packet with momentum k moves at v = k within 1%', () => {
  const N = 256;
  const dx = L / N; // 0.390625 a0
  const dt = 5e-3; // a.u.
  const k = 0.30; // k0 in a.u.  (atomics: hbar = m = 1, v_g = dE/dk = k)

  // Discrete-laplacian dispersion analysis (used to size k):
  //   E(k) = (cos(k dx) - 1) / dx^2
  //   v_g,numeric = dE/dk = sin(k dx)/dx
  //   relative error vs the continuum v = k:
  //     (k - sin(kdx)/dx)/k = (k dx)^2 / 6 = (0.30 * 0.390625)^2 / 6
  //                        = (0.1172)^2 / 6 = 0.0023  -> 0.23%
  // so a tolerance of 1% is 4x above the dominant discretization error.
  const sigma = 6;
  const p = gaussianPacket(N, dx, { x0: 40, y0: CENTER, kx: k, ky: 0, sigma });

  const solver = new CpuSolver(N, dx, dt);
  solver.real.set(p.real);
  solver.imag.set(p.imag);
  solver.primeImagHalfStep(zeroPotential(N));

  const x0 = solver.expectX();
  const T = 4.0; // a.u.; 800 steps
  const steps = Math.round(T / dt); // 800
  for (let s = 0; s < steps; s++) {
    assert.equal(solver.step(zeroPotential(N)), true, `step ${s} must stay stable`);
  }
  const x1 = solver.expectX();

  // The scheme integrates e^{+iHt} psi (a +k packet propagates in -x), so the
  // speed |<x>(T)-<x>(0)|/T is the group velocity magnitude |v_g| = k.
  const speed = Math.abs(x1 - x0) / T;
  const relErr = Math.abs(speed - k) / k;

  assert.ok(
    relErr < 0.01,
    `group velocity ${speed.toFixed(5)} should be ${k} within 1% (err ${(100 * relErr).toFixed(2)}%)`,
  );
});

// ---------------------------------------------------------------------------
// 3. Harmonic oscillator ground state is stationary
// ---------------------------------------------------------------------------
test('harmonic oscillator ground state: <E> and |psi|^2 stay constant', () => {
  const N = 256;
  const dx = L / N; // 0.390625 a0
  const dt = 2.5e-3; // a.u.

  // Isotropic 2D HO, V = (1/2) kappa r^2 (potential.glsl HARMONIC type):
  //   kappa = 0.05  ->  omega = sqrt(kappa) = 0.2236068 a.u.
  //   E0 = omega = 0.2236068 a.u.   (ground state, m = hbar = 1)
  //   psi0(r) = (omega/pi)^(1/2) exp(-omega r^2 / 2)
  //   -> Gaussian form exp(-r^2/4 sigma^2) with sigma = 1/sqrt(2 omega)
  //      = 1/sqrt(0.4472136) = 1.4953 a0 (sigma/dx ~ 3.8 cells, resolved).
  const kappa = 0.05;
  const omega = Math.sqrt(kappa);
  const sigma0 = 1 / Math.sqrt(2 * omega);

  const V = harmonicPotential(N, dx, CENTER, CENTER, kappa);
  const p = gaussianPacket(N, dx, { x0: CENTER, y0: CENTER, kx: 0, ky: 0, sigma: sigma0 });

  const solver = new CpuSolver(N, dx, dt);
  solver.real.set(p.real);
  solver.imag.set(p.imag);
  solver.primeImagHalfStep(V);

  // Sanity: the analytic ground state sits near the discrete ground energy.
  const E0 = solver.energy(V);
  assert.ok(
    Math.abs(E0 - omega) / omega < 0.01,
    `E0 = ${E0.toFixed(5)} should approximate omega = ${omega.toFixed(5)} (discrete correction < 1%)`,
  );

  // Reference density |psi(0)|^2 for the "shape unchanged" check.
  const NN = N * N;
  const rho0 = new Float64Array(NN);
  let peak0 = 0;
  for (let k = 0; k < NN; k++) {
    const r = solver.real[k];
    const i = solver.imag[k];
    rho0[k] = r * r + i * i;
    if (rho0[k] > peak0) peak0 = rho0[k];
  }

  let maxRelE = 0;
  for (let s = 0; s < 500; s++) {
    assert.equal(solver.step(V), true, `step ${s} must stay stable`);
    const E = solver.energy(V);
    maxRelE = Math.max(maxRelE, Math.abs(E - E0) / Math.abs(E0));
  }

  // 1) Energy constant to < 1e-6 relative over the full 500-step run.
  assert.ok(
    maxRelE < 1e-6,
    `<E> varied by ${maxRelE} relative over 500 steps (must be < 1e-6)`,
  );

  // 2) |psi|^2 shape unchanged: max per-cell deviation relative to the peak.
  //    For a stationary state the only change is the O((omega*dt)) leapfrog
  //    breathing plus the small overlap with other discrete eigenstates of
  //    the 5-point-stencil Hamiltonian (~1e-3 of peak); assert < 1e-2.
  let maxDev = 0;
  for (let k = 0; k < NN; k++) {
    const r = solver.real[k];
    const i = solver.imag[k];
    const dev = Math.abs(r * r + i * i - rho0[k]) / peak0;
    if (dev > maxDev) maxDev = dev;
  }
  assert.ok(
    maxDev < 1e-2,
    `|psi|^2 changed by ${maxDev.toExponential(2)} of peak over 500 steps (must be < 1e-2)`,
  );
});

// ---------------------------------------------------------------------------
// 4. CFL / stability violation is detected (flagged return)
// ---------------------------------------------------------------------------
test('CFL violation: dt above stability bound is detected and flagged', () => {
  const N = 128;
  const dx = L / N; // 0.78125 a0
  // Stability bound for the 5-point-stencil Visscher scheme (see DESIGN.md):
  //   dt_C = dx^2 / 2 = 0.78125^2 / 2 = 0.3051758 a.u.
  const dtCfl = (dx * dx) / 2;

  const launch = (dt) => {
    const solver = new CpuSolver(N, dx, dt);
    const p = gaussianPacket(N, dx, { x0: CENTER, y0: CENTER, kx: 0.5, ky: 0, sigma: 4 });
    solver.real.set(p.real);
    solver.imag.set(p.imag);
    return { solver, V: zeroPotential(N) };
  };

  // (a) dt = 2 * dt_C  ->  the leapfrog eigenvalue |lambda| > 1 for the
  //     near-Nyquist modes (max |E| = 4/dx^2, so dt*Emax = 2*2 = 4 > 2), so
  //     the high-k tail of the Gaussian grows like 4-ish^steps and blows up.
  {
    const { solver, V } = launch(2 * dtCfl);
    let healthy = true;
    let blownAt = -1;
    const maxSteps = 200;
    for (let s = 0; s < maxSteps; s++) {
      healthy = solver.step(V); // flagged return: false => unstable
      if (!healthy) {
        blownAt = s;
        break;
      }
    }
    assert.ok(blownAt >= 0, 'unstable dt was not flagged within 200 steps');
    assert.equal(solver.blownUp, true, 'solver.blownUp must be set on blowup');
    assert.ok(!Number.isFinite(solver.norm()) || solver.norm() > 1e4, 'norm must have exploded');
  }

  // (b) dt = dt_C / 2  ->  well inside the bound; must run stably.
  {
    const { solver, V } = launch(dtCfl / 2);
    for (let s = 0; s < 200; s++) {
      assert.equal(solver.step(V), true, `stable dt must not flag at step ${s}`);
    }
    assert.equal(solver.blownUp, false, 'stable dt must not set blownUp');
    assert.ok(Number.isFinite(solver.norm()), 'norm stays finite under CFL');
  }
});
