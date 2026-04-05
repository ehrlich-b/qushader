# QuShader - Claude Code Instructions

## Project Overview
Real-time 2D quantum mechanics simulator running in the browser. Solves the time-dependent Schrodinger equation (TDSE) on a GPU via WebGL 2 fragment shaders. Users drag to launch Gaussian wavepackets at Coulomb potential sources and watch quantum scattering, interference, and capture in real time.

Deployed as a subdomain of ehrlich.dev (the blog repo owns root domain/nginx config). This repo produces static assets only.

## Build & Run
```bash
npm install
npm run dev          # Vite dev server
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Architecture

### Four-Layer Shader Stack
1. **Solver** — Visscher leapfrog TDSE integrator on ping-pong RGBA32F framebuffers. Two textures: Re(psi)[t] and Im(psi)[t-dt/2], updated alternately. No FFT required.
2. **Potential Composer** — Sums contributions from placed potential sources (Coulomb, barriers, wells) into a potential texture each frame.
3. **Initializer** — Generates Gaussian wavepacket textures from drag interactions. Start position = r0, drag vector = momentum k0.
4. **Renderer** — Maps evolved wavefunction to visual output. Phase-wheel coloring: hue = arg(psi), brightness = |psi|^2.

### Key Technical Decisions
- **Physically honest 2D**: Default Coulomb potential is V(r) = -Z*ln(r/r0), the true 2D Coulomb. Toggle available for -Z/r "3D slice" mode, clearly labeled as non-self-consistent.
- **Hartree atomic units internally**: hbar = m_e = e = 1. Grid spans ~100 Bohr radii on 512x512 mesh (dx ~ 0.2 a0).
- **Absorbing boundaries**: Potential ramp at edges kills outgoing waves, prevents box reflections.
- **Coulomb singularity softened**: V(r) = -Z/(r + eps) where eps ~ dx/2.
- **No frameworks**: Vanilla JS + raw WebGL 2 calls. GLSL shaders inlined or in separate .glsl files.

### File Structure
```
src/
  main.js           # Entry point, canvas setup, animation loop
  solver.js         # Visscher leapfrog TDSE integrator (framebuffer ping-pong)
  potential.js      # Potential source management and composition shader
  initializer.js    # Wavepacket generation
  renderer.js       # Probability density / phase-wheel rendering
  gl-utils.js       # WebGL 2 boilerplate (shader compile, FBO setup, etc.)
  interaction.js    # Mouse/touch drag-to-launch, right-click source placement
  ui.js             # Minimal HUD (probability, energy, time, controls)
  shaders/
    evolve-real.glsl
    evolve-imag.glsl
    potential.glsl
    initialize.glsl
    render.glsl
index.html
```

## Physics Notes
- Visscher method splits Re/Im and leapfrogs them. Conditionally stable: dt < dx^2/2 (in atomic units).
- Multiple substeps per animation frame (default 10) to keep simulation speed reasonable.
- Total probability integral should stay near 1.0 — drift indicates numerical instability.
- 2D Coulomb bound states are Bessel-function-based, not Laguerre-polynomial.
- Multi-particle (helium, etc.) is fundamentally impossible on a 2D grid — requires 4D+ configuration space. This is single-particle QM only.

## Tech Stack
- Vite (build/dev server)
- Vanilla JS (no framework)
- WebGL 2 (RGBA32F textures via EXT_color_buffer_float)
- Target: 60fps on 2020-era integrated GPU

## Deploy
Static site. Build output goes to `dist/`. Blog repo (ehrlich.dev) handles nginx config for the subdomain.
