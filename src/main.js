/**
 * QuShader — Real-time 2D quantum mechanics sandbox.
 *
 * Entry point: sets up WebGL, wires together solver/potential/initializer/renderer,
 * runs the animation loop.
 */

import { initGL } from './gl-utils.js';
import { Solver } from './solver.js';
import { PotentialManager, COULOMB } from './potential.js';
import { Initializer } from './initializer.js';
import { Renderer } from './renderer.js';
import { Observables } from './observables.js';
import { Interaction } from './interaction.js';

// --- Physics constants (Hartree atomic units) ---
const N = 512;          // Grid size
const L = 100.0;        // Physical size in Bohr radii
const dx = L / N;       // Grid spacing (~0.195 a0)
const dt = 0.005;       // Timestep (CFL limit: dx^2/2 ~ 0.019)
const SUBSTEPS = 10;    // Substeps per animation frame

// --- Canvas setup ---
const canvas = document.getElementById('sim');
const container = document.getElementById('container');
const fallback = document.getElementById('fallback');

// Display size — simulation is always N×N, rendered larger
const displaySize = Math.min(window.innerWidth, window.innerHeight) - 40;
canvas.width = N;
canvas.height = N;
canvas.style.width = displaySize + 'px';
canvas.style.height = displaySize + 'px';

// Size SVG overlay to match display canvas
const dragSvgEl = document.getElementById('drag-arrow');
dragSvgEl.setAttribute('width', displaySize);
dragSvgEl.setAttribute('height', displaySize);
dragSvgEl.setAttribute('viewBox', `0 0 ${displaySize} ${displaySize}`);

// --- WebGL init ---
const gl = initGL(canvas);
if (!gl) {
  canvas.style.display = 'none';
  container.style.display = 'none';
  fallback.style.display = 'block';
  throw new Error('WebGL 2 with float textures not available');
}

// --- Systems ---
const solver = new Solver(gl, N, dx, dt);
const potential = new PotentialManager(gl, N, dx);
const initializer = new Initializer(gl, N, dx);
const renderer = new Renderer(gl);
const observables = new Observables(gl, N, dx);
const interaction = new Interaction(canvas, N, dx, L);

// --- State ---
let paused = false;
let simTime = 0;

// --- HUD elements ---
const hudProb = document.getElementById('hud-prob');
const hudEnergy = document.getElementById('hud-energy');
const hudTime = document.getElementById('hud-time');
const hudSources = document.getElementById('hud-sources');
const modeIndicator = document.getElementById('potential-mode');
const dragSvg = document.getElementById('drag-arrow');

// --- Wire up interaction callbacks ---
interaction.onLaunch = (x0, y0, kx, ky, sigma) => {
  initializer.launch(solver, x0, y0, kx, ky, sigma, true);
};

interaction.onPlace = (x, y) => {
  potential.addSource(x, y, 1.0, COULOMB);
};

interaction.onRemove = (x, y) => {
  return potential.removeSourceNear(x, y, 3.0 * dx);
};

// --- Keyboard ---
document.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    paused = !paused;
    document.getElementById('btn-pause').textContent = paused ? 'play' : 'pause';
  } else if (e.key === 'r' || e.key === 'R') {
    reset();
  }
});

// --- Buttons ---
document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  document.getElementById('btn-pause').textContent = paused ? 'play' : 'pause';
});

document.getElementById('btn-reset').addEventListener('click', reset);

document.getElementById('btn-toggle-potential').addEventListener('click', () => {
  const mode = potential.toggleMode();
  modeIndicator.textContent = mode === 0 ? '2D Coulomb (ln)' : '3D slice (1/r)';
});

function reset() {
  solver.clear();
  simTime = 0;
  observables.probability = 1.0;
}

// --- Drag arrow rendering ---
function updateDragArrow() {
  const arrow = interaction.getDragArrow();
  if (!arrow) {
    dragSvg.innerHTML = '';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const ox = rect.left;
  const oy = rect.top;
  const x1 = arrow.x1 - ox;
  const y1 = arrow.y1 - oy;
  const x2 = arrow.x2 - ox;
  const y2 = arrow.y2 - oy;

  dragSvg.innerHTML = `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
          stroke="rgba(170,238,255,0.6)" stroke-width="2" />
    <circle cx="${x1}" cy="${y1}" r="3" fill="rgba(170,238,255,0.8)" />
    <circle cx="${x2}" cy="${y2}" r="${interaction.sigma * (rect.width / L)}"
            fill="none" stroke="rgba(170,238,255,0.3)" stroke-width="1" />
  `;
}

// --- Animation loop ---
function frame() {
  requestAnimationFrame(frame);

  // Update potential texture if sources changed
  potential.update();

  // Evolve
  if (!paused) {
    for (let i = 0; i < SUBSTEPS; i++) {
      solver.step(potential.texture);
    }
    simTime += SUBSTEPS * dt;
  }

  // Render
  renderer.render(solver, potential.texture, canvas.width, canvas.height);

  // Observables
  observables.update(solver, potential.texture);

  // HUD
  hudProb.textContent = observables.probability.toFixed(4);
  hudProb.className = Math.abs(observables.probability - 1.0) > 0.1 ? 'warn' : 'value';
  hudTime.textContent = simTime.toFixed(2);
  hudSources.textContent = potential.sources.length;

  // Drag arrow
  updateDragArrow();
}

// --- Start ---
// Place a default proton at the center
potential.addSource(L / 2, L / 2, 1.0, COULOMB);
potential.update();

requestAnimationFrame(frame);
