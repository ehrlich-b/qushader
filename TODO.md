# QuShader TODO

## v0 — Core TDSE Sandbox

### Infrastructure
- [ ] Vite project setup, index.html, dev server
- [ ] WebGL 2 context creation with EXT_color_buffer_float check
- [ ] GL utility functions (compile shader, create FBO, create texture)

### Solver
- [ ] RGBA32F ping-pong framebuffer pair for Re(psi) / Im(psi)
- [ ] Potential texture (R32F or RGBA32F)
- [ ] Visscher leapfrog evolution shaders (evolve-real, evolve-imag)
- [ ] Absorbing boundary condition (imaginary potential ramp at edges)
- [ ] Substep loop (default 10 substeps per animation frame)

### Potentials
- [ ] PotentialSource struct and uniform array (MAX_SOURCES=8)
- [ ] 2D Coulomb: V(r) = -Z*ln(r) with softening
- [ ] 3D-slice Coulomb toggle: V(r) = -Z/r with softening
- [ ] Potential composition shader (sum over sources)
- [ ] Dynamic potential update when sources are added/moved/removed

### Initialization
- [ ] Gaussian wavepacket shader (position, momentum, width)
- [ ] Normalization (ensure integral |psi|^2 = 1)
- [ ] Half-step Im initialization for Visscher consistency

### Rendering
- [ ] Phase-wheel coloring (hue = arg(psi), brightness = |psi|^2)
- [ ] Potential contour overlay (faint)
- [ ] Dark background, display canvas scaling

### Interaction
- [ ] Left-click-drag to launch wavepacket (arrow preview)
- [ ] Right-click to place/remove Coulomb sources
- [ ] Scroll wheel to adjust wavepacket width
- [ ] Touch support (single-finger drag, long-press, pinch)
- [ ] Spacebar pause/resume, R to reset

### HUD / UI
- [ ] Total probability display (integral |psi|^2)
- [ ] Energy display (expectation value of H)
- [ ] Simulation time display
- [ ] Reset button, pause/play button
- [ ] Source count indicator

### Polish
- [ ] Graceful fallback if EXT_color_buffer_float unavailable
- [ ] Performance profiling on integrated GPU
- [ ] Mobile responsiveness

## v1 — Extended

- [ ] WebGPU backend with split-operator FFT solver
- [ ] Double slit barrier potential
- [ ] Harmonic oscillator potential
- [ ] Periodic lattice potential
- [ ] Step barrier potential
- [ ] User-painted arbitrary potential
- [ ] Probability current visualization
- [ ] Preset experiment selector
- [ ] Recording/export (GIF, WebM)
- [ ] Stationary state finder (imaginary time evolution)

## Deployment
- [ ] Build to dist/, configure blog repo nginx for subdomain
- [ ] Add to ehrlich.dev subdomain list in blog CLAUDE.md
