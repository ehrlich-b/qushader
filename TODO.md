# QuShader TODO

## What This Simulator Can and Cannot Be

### The honest physics constraints
This is a **single-particle** 2D TDSE solver. One quantum particle (an electron) in
an external potential, evolved in real time on a 512x512 grid.

**Can we simulate a water molecule?** No. Not even close. Water has 10 electrons.
Multi-electron systems live in **configuration space** — N electrons in 2D need a
2N-dimensional grid. Two electrons would need a 4D grid: 512^4 = 69 billion points.
That's supercomputer territory, not a browser tab. Three electrons is 6D. Ten is 20D.
This is *the* fundamental barrier of quantum mechanics, and no amount of GPU tricks
changes it. Anyone who tells you they're doing many-body QM on a grid in the browser
is lying or doing mean-field theory (which is single-particle with extra steps).

**Can we simulate hydrogen?** YES — with caveats. Hydrogen is one electron in a
Coulomb potential. That's exactly what we solve. The catch: real hydrogen is 3D, and
we're 2D. The bound states are different (Bessel-function-based, not the Laguerre
polynomials you see in textbooks). But "2D hydrogen" is a real, well-studied quantum
system. We can find its ground state, show its orbital structure, demonstrate
transitions between states. It's not *the* hydrogen atom, but it's *a* hydrogen atom
— the 2D one — and the physics is genuine.

**Can we do two particles?** Actually... maybe. Two particles in *1D* live in a 2D
configuration space. A 512x512 grid could solve two interacting particles on a 1D
line. You could show entanglement, exchange symmetry, fermion vs boson statistics.
This would be a genuinely novel thing for a browser simulator. It's a stretch goal
but it's not impossible.

### The actual end goal
Make the most **physically honest, visually stunning, viscerally interactive**
single-particle quantum mechanics sandbox that exists in a browser. Every feature
should either (a) demonstrate a real quantum effect that's hard to intuit from
equations alone, or (b) make the existing simulation more beautiful/usable. No
fake physics. No hand-waving. If we can't do it right, we don't do it.

---

## v0 — Core TDSE Sandbox (current)

### Done
- [x] Vite project, WebGL 2 context, EXT_color_buffer_float
- [x] GL utilities (shader compile, FBO, fullscreen triangle)
- [x] Visscher leapfrog solver with ping-pong framebuffers
- [x] 5-point stencil laplacian
- [x] Absorbing boundary (quadratic imaginary potential ramp)
- [x] Potential source system (Coulomb 2D/3D, Gaussian barrier, harmonic)
- [x] Wavepacket initialization with proper 2D normalization
- [x] Phase-wheel rendering (hue = phase, brightness = |psi|^2)
- [x] Potential overlay (blue = attractive, red = repulsive)
- [x] Drag-to-launch interaction with SVG arrow preview
- [x] Right-click place/remove sources
- [x] Scroll to adjust wavepacket width
- [x] Touch support (drag, long-press, pinch)
- [x] Pause/reset, keyboard shortcuts
- [x] Probability readout via CPU readback
- [x] 2D Coulomb (ln) / 3D slice (1/r) toggle

### v0 polish
- [x] Fix dt=0.005 vs DESIGN.md saying dt=0.01 — sync docs
- [x] Window resize handling (displaySize is frozen at load time)
- [x] Auto-brightness: scale brightness by 1/max(|psi|^2) with EMA smoothing
- [x] Wire up energy display (CPU readback with 5-point stencil laplacian)
- [x] GPU reduction for probability (kill the readPixels pipeline stall)
- [x] Source position indicators (faint crosshair or dot on the potential sources)

---

## v1 — The Quantum Greatest Hits

The demos everyone has seen but never interacted with.

### Double Slit
- [x] Barrier potential type: thin wall with configurable gap count, gap width, gap
      separation. Implemented as BARRIER type in potential shader.
- [x] Preset: single slit, double slit, triple slit
- [ ] This is THE demo. A plane-wave-ish packet hits the slits and you watch the
      interference pattern build up on the far side. Every physics student has seen
      the diagram — nobody has *played* with it. Adjustable slit width and separation
      let you see the fringe spacing change in real time.

### Tunneling
- [x] Gaussian barrier potential (already have the type — preset wired up)
- [x] Preset: thick barrier with packet aimed at it. Watch partial transmission,
      partial reflection.
- [x] Step potential variant: STEP type added to shader (smooth tanh edge).

### Quantum Corral
- [x] Preset: ring of 8 Coulomb sources arranged in a circle (r=20 a0)
- [ ] Launch a wavepacket inside the corral and watch standing wave patterns form
- [ ] This recreates the famous IBM STM experiment (1993) where they arranged iron
      atoms on a copper surface and saw electron standing waves inside. Except here
      you can drag the walls around and watch the patterns reshape in real time.

### Harmonic Oscillator
- [x] Preset: single harmonic source, launch coherent wavepacket
- [ ] Watch the packet oscillate back and forth, dispersing and refocusing
- [ ] With imaginary time evolution (v2), find the stationary states and show the
      Hermite-Gaussian structure. In 2D, these are Laguerre-Gaussian modes — the
      same modes that describe laser beams.

### Bound State Capture
- [x] Preset: slow electron launched at a Coulomb well with k=0.5, sigma=4.0
- [ ] Show the captured portion ringing at the bound state frequency — the phase
      wheel spins at E/hbar, so different energy eigenstates spin at different rates.
      Interference between them makes the probability density breathe.

### Preset System
- [x] Dropdown: free particle, double slit, single slit, triple slit, tunneling,
      coulomb scattering, quantum corral, harmonic trap
- [x] Each preset configures sources + fires a wavepacket with good parameters
- [x] Text overlay explaining what you're seeing (dismissible)

---

## v2 — Seeing the Invisible

Features that reveal quantum structure you can't see from |psi|^2 alone.

### Probability Current Visualization
- [ ] Compute j = (1/m) * Im(psi* grad psi) on GPU
- [ ] In Visscher variables: j_x = (1/2) * (R * dI/dx - I * dR/dx) (approx)
- [ ] Render as: faint streamlines (LIC texture), small arrows, or animated particle
      advection (spawn dots, move them along j, fade them out)
- [ ] This makes quantum mechanics look like fluid dynamics. You see the "flow" of
      probability around potential sources, vortices forming in scattering, backflow
      behind barriers. It's hypnotic and deeply informative.

### Imaginary Time Evolution
- [ ] Replace dt with -i*dtau in the evolution (just flip which equation damps and
      which grows, then renormalize each step)
- [ ] This exponentially projects onto the ground state. Start from any initial state,
      evolve in imaginary time, watch it relax into the ground state orbital.
- [ ] For 2D hydrogen: shows the ground state is a modified Bessel function K_0
- [ ] Toggle: "find ground state" button that runs imaginary time until convergence,
      then switches back to real time so you can watch the stationary state sit there
      (phase wheel spinning uniformly = single energy eigenstate)
- [ ] Excited states via Gram-Schmidt: project out the ground state, re-evolve to
      find the first excited state. Repeat for higher states.

### Momentum Space View
- [ ] FFT the wavefunction to k-space, render as a second panel or toggle
- [ ] Phase-wheel coloring in momentum space too
- [ ] Lets you see the momentum distribution spreading out as position localizes
      (uncertainty principle made visible)
- [ ] FFT in WebGL 2 is expensive (log2(N) passes per axis) but doable at 512x512
- [ ] Alternative: WebGPU compute shader with proper FFT (see v4)

### Expectation Value Trails
- [ ] Compute <x>, <y> (position expectation) each frame, draw as a fading trail
- [ ] Overlay the classical trajectory for comparison (solve Newton's equation for
      same initial conditions)
- [ ] Ehrenfest's theorem says they match (for smooth potentials). Watching them
      diverge when the wavepacket hits a sharp feature or splits is the whole point.

### Energy Spectrum Analyzer
- [ ] Time-series of <H> or autocorrelation function C(t) = <psi(0)|psi(t)>
- [ ] FFT the time series to get the energy spectrum of the state
- [ ] Display as a small frequency plot — peaks correspond to bound state energies
- [ ] For Coulomb capture, you'd see discrete peaks at the 2D hydrogen eigenvalues

---

## v3 — Magnetic Fields and Topology

This is where it gets exotic. A uniform magnetic field perpendicular to the 2D plane
changes the physics fundamentally and opens up some of the most beautiful effects in
quantum mechanics.

### Magnetic Field (Minimal Coupling)
- [ ] Replace p^2/(2m) with (p - eA)^2/(2m) in the Hamiltonian
- [ ] Symmetric gauge: A = (B/2)(-y, x). Landau gauge: A = (0, Bx).
- [ ] In the Visscher scheme, this modifies the laplacian to a covariant laplacian:
      d/dx -> d/dx - iA_x, so the finite-difference stencil picks up phase factors
      from the vector potential (Peierls substitution)
- [ ] The stencil becomes: psi(x+dx) * exp(-i*A_x*dx) + ... (complex phases on
      neighbor lookups). This means the "real" and "imag" evolution shaders now
      couple to both textures at each neighbor, not just one.

### Landau Levels
- [ ] Uniform B field + no potential: free electron in a magnetic field
- [ ] Classical: cyclotron orbits. Quantum: discrete Landau levels, each infinitely
      degenerate. The wavepacket traces a cyclotron circle but also disperses into
      the quantized level structure.
- [ ] Visible effect: launch a packet in a B field, watch it curve and form a ring
      pattern as it quantizes. Gorgeous.

### Aharonov-Bohm Effect
- [ ] Solenoid (B field confined to a tiny region, A field everywhere outside)
- [ ] Two paths around the solenoid acquire different phases purely from the vector
      potential — even though B = 0 along both paths
- [ ] Set up: thin flux tube at center, split a wavepacket around it, watch the
      interference pattern on the far side shift as you change the enclosed flux
- [ ] This is one of the most profound results in quantum mechanics: the vector
      potential is physically real, not just a mathematical convenience. And you can
      see it by changing a slider and watching fringes move.

### Quantum Hall Physics (stretch)
- [ ] B field + random impurity potential (scattered Coulomb sources)
- [ ] Edge states: probability current flows along the boundary in one direction only
- [ ] This is the integer quantum Hall effect in miniature. The probability current
      visualization (v2) makes the chiral edge states directly visible.

---

## v4 — Pushing the Boundaries

### WebGPU Backend
- [ ] Compute shaders instead of fragment shaders
- [ ] Proper FFT (butterfly algorithm in compute) for split-operator method
- [ ] Split-operator is unconditionally stable and higher-order accurate — no more
      CFL condition, can take larger timesteps
- [ ] Higher resolution (1024x1024 or 2048x2048) feasible with compute
- [ ] Shared memory / workgroup optimizations for stencil operations

### H2 Molecule: Two Electrons, Two Protons, One Grid (THE CAPSTONE)

The stretch goal. Simulate the hydrogen molecule from first principles in the
browser. Two electrons sharing two protons — covalent bonding, entanglement, and
exchange symmetry, all visible in real time.

#### The physics trick that makes this possible
Two electrons in 2D need a 4D grid (impossible). But two electrons in **1D** need
a 2D grid — and we already have a 512x512 one. We collapse the problem to 1D:
two protons fixed on a line (Born-Oppenheimer approximation), two electrons moving
in the combined potential. The grid axes become (x1, x2): position of electron 1
and position of electron 2. Every pixel encodes "electron 1 is here AND electron 2
is there."

This is real quantum chemistry. The Born-Oppenheimer approximation is what every
molecular simulation on earth uses. The 1D reduction changes the quantitative details
but preserves all the qualitative physics: bonding, antibonding, entanglement, Pauli
exclusion.

#### Hamiltonian
```
H = T1 + T2 + V_ext(x1) + V_ext(x2) + V_ee(x1, x2)

T_i       = -(1/2) d^2/dx_i^2              kinetic energy of electron i
V_ext(x)  = -Z/|x - R_A| - Z/|x - R_B|    attraction to both protons (softened)
V_ee      = 1/|x1 - x2|                    electron-electron repulsion (softened)
R_A, R_B  = fixed proton positions on the 1D line
```

On the GPU this is still a 2D laplacian + a potential texture — the solver doesn't
even know it's doing two-particle physics. The potential shader just computes
V(x1, x2) = V_ext(x1) + V_ext(x2) + 1/|x1 - x2| at each grid point.

#### Fermion symmetry
Electrons are fermions: psi(x1, x2) = -psi(x2, x1). The wavefunction must be
antisymmetric under particle exchange (reflection about the diagonal x1 = x2).
- [ ] After each timestep (or every N steps), enforce: psi -> (psi(x1,x2) - psi(x2,x1)) / 2
- [ ] This is a projection onto the antisymmetric subspace. Cheap: just read the
      texture, flip coordinates, subtract, write back. One extra render pass.
- [ ] Toggle for bosonic symmetry (psi + psi_flipped) to show the contrast:
      fermions avoid the diagonal (Pauli exclusion), bosons cluster on it (bunching)

#### Initialization
- [ ] Product state: psi(x1,x2) = phi_A(x1) * phi_B(x2) - phi_B(x1) * phi_A(x2)
      where phi_A is a Gaussian centered on proton A, phi_B on proton B
      (Slater determinant — the simplest antisymmetric two-electron state)
- [ ] This is two electrons, one on each proton. As they evolve, the interaction
      potential entangles them.

#### What you see
- [ ] Config-space heatmap: |psi(x1, x2)|^2 on the 512x512 grid
      - Diagonal (x1 = x2) = both electrons at the same position → suppressed for
        fermions (Pauli exclusion visible as a dark nodal line)
      - Off-diagonal blobs near (R_A, R_B) and (R_B, R_A) = one electron per proton
        (covalent bond)
      - Blobs near (R_A, R_A) or (R_B, R_B) = both electrons on same proton (ionic)
- [ ] Marginal density: integrate out x2 to get rho(x1) = single-electron density.
      Render as a 1D plot overlay. Shows where each electron "is" on average.
- [ ] Entanglement measure: compute the von Neumann entropy of the reduced density
      matrix (SVD of the wavefunction matrix). S = 0 means product state (no
      entanglement). S > 0 means the electrons are correlated. Display as a number
      and watch it grow as the particles interact.

#### Presets
- [ ] "H2 Formation": two protons ~10 a0 apart, one electron on each, watch the
      covalent bond form as the wavefunctions overlap
- [ ] "Ionic vs Covalent": vary proton separation. Close → covalent dominates.
      Far → ionic states become visible. Very far → two independent atoms.
- [ ] "Pauli Exclusion": identical initial conditions but toggle fermion/boson
      symmetry. Fermions: dark diagonal, electrons avoid each other. Bosons:
      bright diagonal, electrons bunch together. Same Hamiltonian, opposite behavior.
      This is the single most vivid demonstration of why spin statistics matter.
- [ ] "Dissociation": start in a bound state, slowly pull protons apart (adiabatic),
      watch the molecular orbital split into two atomic orbitals

#### Implementation phases
- [ ] Phase 1: New "config space" mode with 1D external potential + interaction term
      in the potential shader. Reuse the existing Visscher solver unchanged.
- [ ] Phase 2: Symmetry projection pass (antisymmetrize/symmetrize)
- [ ] Phase 3: Slater determinant initialization shader
- [ ] Phase 4: Marginal density computation (GPU reduction along one axis)
- [ ] Phase 5: Entanglement entropy (SVD of wavefunction — CPU readback, small matrix)
- [ ] Phase 6: Dual-view rendering: config space heatmap + real-space marginal density
- [ ] Phase 7: Proton position sliders for interactive adiabatic manipulation

### Anderson Localization
- [ ] Random potential: scatter ~100 weak Gaussian bumps at random positions
- [ ] In 2D, ALL states are localized (no mobility edge, unlike 3D). A wavepacket
      will spread initially, then freeze — exponentially localized by disorder.
- [ ] Gradually increase disorder strength and watch the localization length shrink
- [ ] This is one of the most important results in condensed matter physics and it's
      almost never shown dynamically.

### Periodic Lattice / Band Structure
- [ ] Regular grid of potential sources (Coulomb or Gaussian wells)
- [ ] Launch a Bloch wave (wavepacket with crystal momentum k)
- [ ] Watch it propagate through the lattice — or not, if k is at a band edge
- [ ] Bragg reflection: certain momenta perfectly reflect off the lattice
- [ ] With the momentum-space view (v2), you can see the Brillouin zone structure

### Quantum Chaos
- [ ] Stadium billiard: hard-wall potential shaped like a stadium (rectangle +
      semicircles). Classically chaotic. Quantum mechanically: eigenstate scarring,
      level repulsion, random-matrix statistics.
- [ ] Sinai billiard: square box with a circular hard wall in the center
- [ ] Launch a wavepacket and watch it explore the chaotic phase space. Compare
      with the integrable rectangle (where it just bounces regularly).

### Recording / Export
- [ ] Capture canvas frames to WebM or GIF
- [ ] "Record" button: accumulate frames, stop, download
- [ ] Parameter overlay in the recording (dt, N, what potential is active)

---

## Deployment
- [ ] Build to dist/, configure blog repo nginx for subdomain
- [ ] Add to ehrlich.dev subdomain list
- [ ] OG image / meta tags for social sharing (screenshot of a nice scattering event)
