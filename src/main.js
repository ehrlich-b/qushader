/**
 * QuShader — Real-time 2D quantum mechanics sandbox.
 *
 * Entry point: sets up WebGL, wires together solver/potential/initializer/renderer,
 * runs the animation loop.
 */

import { initGL } from './gl-utils.js';
import { Solver } from './solver.js';
import { PotentialManager, COULOMB, GAUSSIAN_BARRIER, HARMONIC, BARRIER } from './potential.js';
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
let displaySize = Math.min(window.innerWidth, window.innerHeight) - 40;
canvas.width = N;
canvas.height = N;
canvas.style.width = displaySize + 'px';
canvas.style.height = displaySize + 'px';

// Size SVG overlay to match display canvas
const dragSvgEl = document.getElementById('drag-arrow');
dragSvgEl.setAttribute('width', displaySize);
dragSvgEl.setAttribute('height', displaySize);
dragSvgEl.setAttribute('viewBox', `0 0 ${displaySize} ${displaySize}`);

// Resize handler
window.addEventListener('resize', () => {
  displaySize = Math.min(window.innerWidth, window.innerHeight) - 40;
  canvas.style.width = displaySize + 'px';
  canvas.style.height = displaySize + 'px';
  dragSvgEl.setAttribute('width', displaySize);
  dragSvgEl.setAttribute('height', displaySize);
  dragSvgEl.setAttribute('viewBox', `0 0 ${displaySize} ${displaySize}`);
});

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
  potential.clear();
  simTime = 0;
  observables.probability = 1.0;
  observables.energy = 0;
  observables.autoBrightness = 40.0;
}

// --- Presets ---
const presets = {
  'free': () => {
    initializer.launch(solver, 20, L / 2, 2.0, 0, 4.0, false);
  },
  'double-slit': () => {
    potential.addSource(L / 2, L / 2, 100, BARRIER, 2.0, {
      param1: 2, param2: 4, param3: 15,
    });
    potential.update();
    initializer.launch(solver, 20, L / 2, 3.0, 0, 6.0, false);
  },
  'single-slit': () => {
    potential.addSource(L / 2, L / 2, 100, BARRIER, 2.0, {
      param1: 1, param2: 4, param3: 0,
    });
    potential.update();
    initializer.launch(solver, 20, L / 2, 3.0, 0, 6.0, false);
  },
  'triple-slit': () => {
    potential.addSource(L / 2, L / 2, 100, BARRIER, 2.0, {
      param1: 3, param2: 4, param3: 12,
    });
    potential.update();
    initializer.launch(solver, 20, L / 2, 3.0, 0, 6.0, false);
  },
  'tunneling': () => {
    potential.addSource(L / 2, L / 2, 1.0, GAUSSIAN_BARRIER, 3.0);
    potential.update();
    initializer.launch(solver, 25, L / 2, 1.0, 0, 4.0, false);
  },
  'coulomb': () => {
    potential.addSource(L / 2, L / 2, 1.0, COULOMB);
    potential.update();
  },
  'corral': () => {
    const cx = L / 2, cy = L / 2, r = 20;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      potential.addSource(cx + r * Math.cos(angle), cy + r * Math.sin(angle), 1.0, COULOMB);
    }
    potential.update();
  },
  'harmonic': () => {
    potential.addSource(L / 2, L / 2, 0.05, HARMONIC);
    potential.update();
    initializer.launch(solver, L / 2 + 10, L / 2, 0, 0, 2.0, false);
  },
  'capture': () => {
    potential.addSource(L / 2, L / 2, 1.0, COULOMB);
    potential.update();
    initializer.launch(solver, L / 2 - 15, L / 2, 0.5, 0, 4.0, false);
  },
};

// --- Preset info overlay ---
const presetDescriptions = {
  'free': 'Free particle — a Gaussian wavepacket spreading as it propagates. No potential, pure quantum diffusion.',
  'double-slit': 'Double slit — watch the interference pattern build as the wavepacket passes through two gaps.',
  'single-slit': 'Single slit — diffraction through a narrow opening. Narrower slit = wider spread.',
  'triple-slit': 'Triple slit — three-way interference produces a richer fringe pattern.',
  'tunneling': 'Quantum tunneling — the packet hits a barrier it classically cannot cross, yet part leaks through.',
  'coulomb': 'Coulomb scattering — drag to launch an electron at the proton.',
  'corral': 'Quantum corral — eight protons form a ring. Launch a wavepacket inside to see standing waves.',
  'harmonic': 'Harmonic trap — quadratic potential well. The wavepacket oscillates like a quantum spring.',
  'capture': 'Bound state capture — a slow electron falls into a Coulomb well. Watch it ring at the bound state frequency.',
};

const presetInfoEl = document.getElementById('preset-info');
let presetInfoTimer = null;

function showPresetInfo(name) {
  const desc = presetDescriptions[name];
  if (!desc) return;
  presetInfoEl.textContent = desc;
  presetInfoEl.classList.add('visible');
  clearTimeout(presetInfoTimer);
  presetInfoTimer = setTimeout(() => {
    presetInfoEl.classList.remove('visible');
  }, 5000);
}

presetInfoEl.addEventListener('click', () => {
  presetInfoEl.classList.remove('visible');
  clearTimeout(presetInfoTimer);
});

function loadPreset(name) {
  if (!presets[name]) return;
  reset();
  presets[name]();
  showPresetInfo(name);
  if (paused) {
    paused = false;
    document.getElementById('btn-pause').textContent = 'pause';
  }
}

document.getElementById('preset-select').addEventListener('change', e => {
  if (e.target.value) {
    loadPreset(e.target.value);
    e.target.value = '';
  }
});

// --- Overlay rendering (drag arrow + source indicators) ---
function updateOverlay() {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / L;
  let svg = '';

  // Source position indicators
  for (const s of potential.sources) {
    const sx = s.x * scale;
    const sy = rect.height - s.y * scale;
    svg += `<circle cx="${sx}" cy="${sy}" r="4" fill="none" stroke="rgba(100,180,255,0.4)" stroke-width="1"/>`;
    svg += `<line x1="${sx - 6}" y1="${sy}" x2="${sx + 6}" y2="${sy}" stroke="rgba(100,180,255,0.25)" stroke-width="0.5"/>`;
    svg += `<line x1="${sx}" y1="${sy - 6}" x2="${sx}" y2="${sy + 6}" stroke="rgba(100,180,255,0.25)" stroke-width="0.5"/>`;
  }

  // Drag arrow
  const arrow = interaction.getDragArrow();
  if (arrow) {
    const ox = rect.left;
    const oy = rect.top;
    const x1 = arrow.x1 - ox;
    const y1 = arrow.y1 - oy;
    const x2 = arrow.x2 - ox;
    const y2 = arrow.y2 - oy;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(170,238,255,0.6)" stroke-width="2"/>`;
    svg += `<circle cx="${x1}" cy="${y1}" r="3" fill="rgba(170,238,255,0.8)"/>`;
    svg += `<circle cx="${x2}" cy="${y2}" r="${interaction.sigma * scale}" fill="none" stroke="rgba(170,238,255,0.3)" stroke-width="1"/>`;
  }

  dragSvg.innerHTML = svg;
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
  renderer.brightness = observables.autoBrightness;

  // HUD
  hudProb.textContent = observables.probability.toFixed(4);
  hudProb.className = Math.abs(observables.probability - 1.0) > 0.1 ? 'warn' : 'value';
  hudEnergy.textContent = observables.probability > 0.001
    ? (observables.energy / observables.probability).toFixed(3)
    : '\u2014';
  hudTime.textContent = simTime.toFixed(2);
  hudSources.textContent = potential.sources.length;

  // Overlay
  updateOverlay();
}

// --- Start ---
// Place a default proton at the center
potential.addSource(L / 2, L / 2, 1.0, COULOMB);
potential.update();

requestAnimationFrame(frame);
