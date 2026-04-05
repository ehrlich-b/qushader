# QuShader - Technical Design

## The Problem
Visualize quantum mechanics honestly in the browser. Solve the TDSE on a 2D grid in real time, let users interact with it (launch particles, place potentials), and render the results beautifully.

## Prior Art
- **marl0ny/QM-Simulator-2D** — WebGL TDSE solver with Visscher, Crank-Nicolson, and split-operator methods. Closest existing project. Monolithic app, not a toolkit. ~38 stars.
- **davidar.io "Shaders of Schrodinger"** — ShaderToy-based TDSE in <50 lines GLSL using RK4. Elegant but non-interactive.
- **George Stagg WebGL GPE** — 256x256 superfluid sim (Gross-Pitaevskii, not Schrodinger). Good GPU architecture reference.
- **csp256/Hydrogen_Wavefunction_Visualizer** — Static 3D orbital gallery via Three.js marching cubes. No dynamics.

**What's missing**: Nobody has the composable sandbox — drag-to-launch, multiple potential sources, extensible shader library, Coulomb scattering interaction. Nobody has migrated to WebGPU for this problem class.

## Solver: Visscher Leapfrog (v0)

The Visscher method stores Re(psi) and Im(psi) at staggered half-timesteps:

```
R(t)        known
I(t+dt/2)   known

I(t+dt/2) = I(t-dt/2) + dt * H_R * R(t)      // H_R = kinetic + potential acting on real part
R(t+dt)   = R(t)       - dt * H_I * I(t+dt/2) // H_I = kinetic + potential acting on imag part
```

Where the Hamiltonian action is: H*psi = -(1/2)*laplacian(psi) + V*psi

The Laplacian is a 5-point stencil: laplacian(f) = (f[i+1,j] + f[i-1,j] + f[i,j+1] + f[i,j-1] - 4*f[i,j]) / dx^2

**Why Visscher over split-operator**: No FFT needed. FFT in WebGL 2 requires log2(N) render passes per axis per timestep — expensive and complex. Visscher needs exactly 2 render passes per timestep. The tradeoff is a CFL stability condition (dt < dx^2/2), but with dx ~ 0.2 a0 this gives dt < 0.02 a0, which is fine.

**Why Visscher over Crank-Nicolson**: CN requires solving a linear system (tridiagonal in 1D, but banded in 2D). Iterative solvers on GPU are doable but complex. Visscher is explicit — just texture reads and arithmetic.

## Framebuffer Layout

```
Texture A: RGBA32F — (Re(psi), Im(psi), 0, 0)  [current]
Texture B: RGBA32F — (Re(psi), Im(psi), 0, 0)  [next]
Texture V: RGBA32F — (V(x,y), 0, 0, 0)         [potential, updated when sources change]
```

Ping-pong between A and B each substep. The RG channels hold the staggered-time Re/Im values.

Actually — Visscher needs Re and Im at *different* times. Better layout:

```
Texture R: R32F or RG32F — Re(psi) at time t
Texture I: R32F or RG32F — Im(psi) at time t + dt/2
```

Update I from R, then R from I. Two passes per step. Each pass reads one texture, writes the other.

## Potential System

```glsl
struct PotentialSource {
    vec2 position;    // grid coordinates
    float strength;   // Z (positive = attractive)
    int type;         // 0=coulomb_2d, 1=coulomb_3d, 2=gaussian_barrier, 3=harmonic
    float width;      // for barriers/wells
    float softening;  // regularization for singularity
};
```

MAX_SOURCES = 8 as a uniform array. The potential shader loops over sources and sums contributions.

2D Coulomb: V(r) = -Z * ln(sqrt((x-x0)^2 + (y-y0)^2 + eps^2) / r_ref)
3D-slice Coulomb: V(r) = -Z / sqrt((x-x0)^2 + (y-y0)^2 + eps^2)

## Wavepacket Initialization

Gaussian wavepacket in position space:

```
psi(x,y) = N * exp(-|r - r0|^2 / (4*sigma^2)) * exp(i * k0 . r)
```

- r0: launch position (mouse-down location)
- k0: momentum vector (proportional to drag vector)
- sigma: spatial width (scroll wheel adjustable, default ~3 a0)
- N: normalization constant (computed so integral |psi|^2 = 1)

Split into Re/Im for the two textures:
- Re(psi) = N * exp(-|r-r0|^2/(4*sigma^2)) * cos(k0 . r)
- Im(psi) = N * exp(-|r-r0|^2/(4*sigma^2)) * sin(k0 . r)

The Im texture needs to be initialized at the half-step. For a free particle, the half-step offset is negligible for visualization purposes. For strict correctness, evolve Im by dt/2 after initialization.

## Rendering

Phase-wheel coloring:
```glsl
float prob = R*R + I*I;  // approximate |psi|^2 (R and I at slightly different times)
float phase = atan(I, R);
vec3 color = hsv2rgb(vec3(phase / (2.0 * PI), 1.0, sqrt(prob) * scale));
```

sqrt(prob) for brightness gives better dynamic range than linear prob.

## Absorbing Boundary

A smooth imaginary potential at the edges:
```
V_absorb(x,y) = -i * V0 * mask(x,y)
```

Where mask ramps from 0 to 1 over the outer ~10% of the grid. In the Visscher scheme, the imaginary potential couples differently than the real potential — it acts as a damping term:

```
I_new = I_old + dt * (H_R * R - V_absorb * I)    // damping on Im
R_new = R     - dt * (H_I * I + V_absorb * R)    // damping on Re
```

This exponentially attenuates the wavefunction near boundaries.

## Unit System

Hartree atomic units: hbar = m_e = e = 4*pi*eps0 = 1
- Length: Bohr radius a0 = 0.529 Angstrom
- Energy: Hartree = 27.2 eV
- Time: hbar/Hartree = 24.2 attoseconds

Grid: 512x512, spanning L = 100 a0, so dx = L/512 ~ 0.195 a0
CFL condition: dt < dx^2/2 ~ 0.019 atomic time units
Default dt = 0.01, substeps_per_frame = 10

## Interaction Model

- **Left-click-drag**: Launch wavepacket. Down = position, drag = momentum. Visual: draw an arrow showing launch direction/speed.
- **Right-click**: Place/remove Coulomb source at cursor position.
- **Scroll wheel**: Adjust wavepacket width sigma.
- **Touch**: Single-finger drag = launch, long-press = place source, pinch = adjust sigma.
- **Spacebar**: Pause/resume.
- **R**: Reset simulation.

## Performance Budget

Target: 60fps on Intel UHD 630 (2020 integrated GPU).

Per frame:
- 10 substeps * 2 passes/substep = 20 draw calls for evolution
- 1 draw call for rendering
- Total: 21 draw calls, each on a 512x512 texture
- ~2M multiply-adds per substep = ~20M per frame
- This is trivial for any GPU — bottleneck will be render pass overhead, not compute

## Future (v1+)

- WebGPU backend with compute shaders and proper FFT for split-operator method
- Multiple potential types: double slit, harmonic, periodic lattice, step barrier
- Probability current visualization (streamlines/arrows)
- Preset experiments (tunneling, double slit, orbital gallery)
- Recording/export (GIF, WebM)
- Magnetic field (minimal coupling)
- Stationary state finder (imaginary time evolution)
