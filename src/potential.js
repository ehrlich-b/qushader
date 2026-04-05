/**
 * Potential source management and GPU composition.
 */

import {
  createFloat32Texture, createFBO, createProgram,
  drawFullscreen, bindTextureUnit,
} from './gl-utils.js';

import quadVert from './shaders/quad.vert';
import potentialFrag from './shaders/potential.glsl';

const MAX_SOURCES = 8;

// Source types
export const COULOMB = 0;
export const GAUSSIAN_BARRIER = 1;
export const HARMONIC = 2;
export const BARRIER = 3;
export const STEP = 4;

export class PotentialManager {
  constructor(gl, N, dx) {
    this.gl = gl;
    this.N = N;
    this.dx = dx;
    this.sources = []; // { x, y, strength, type, width, softening }
    this.potentialMode = 0; // 0 = 2D ln, 1 = 3D 1/r
    this.dirty = true;

    this.texture = createFloat32Texture(gl, N, N, null);
    this.fbo = createFBO(gl, this.texture);

    this.program = createProgram(gl, quadVert, potentialFrag);
    this.vao = gl.createVertexArray();
  }

  addSource(x, y, strength, type = COULOMB, width = 1.0, extra = {}) {
    if (this.sources.length >= MAX_SOURCES) return false;
    this.sources.push({
      x, y, strength, type, width,
      param1: extra.param1 ?? (type === COULOMB ? this.dx * 0.5 : 0),
      param2: extra.param2 ?? 0,
      param3: extra.param3 ?? 0,
    });
    this.dirty = true;
    return true;
  }

  removeSourceNear(x, y, threshold = 2.0) {
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < closestDist) {
        closestDist = d;
        closest = i;
      }
    }
    if (closest >= 0 && closestDist < threshold) {
      this.sources.splice(closest, 1);
      this.dirty = true;
      return true;
    }
    return false;
  }

  toggleMode() {
    this.potentialMode = 1 - this.potentialMode;
    this.dirty = true;
    return this.potentialMode;
  }

  /** Recompute potential texture if sources changed */
  update() {
    if (!this.dirty) return;
    this.dirty = false;

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.N, this.N);
    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);

    const u = this.program.uniforms;

    // Pack source data into uniform arrays
    const a = new Float32Array(MAX_SOURCES * 4);
    const b = new Float32Array(MAX_SOURCES * 4);
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      a[i * 4 + 0] = s.x;
      a[i * 4 + 1] = s.y;
      a[i * 4 + 2] = s.strength;
      a[i * 4 + 3] = s.type;
      b[i * 4 + 0] = s.width;
      b[i * 4 + 1] = s.param1;
      b[i * 4 + 2] = s.param2;
      b[i * 4 + 3] = s.param3;
    }

    gl.uniform4fv(u.u_sources_a, a);
    gl.uniform4fv(u.u_sources_b, b);
    gl.uniform1i(u.u_num_sources, this.sources.length);
    gl.uniform1f(u.u_dx, this.dx);
    gl.uniform2f(u.u_resolution, this.N, this.N);
    gl.uniform1i(u.u_potential_mode, this.potentialMode);

    drawFullscreen(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clear() {
    this.sources = [];
    this.dirty = true;
  }
}
