/**
 * Compute observables (probability, energy, max density) via GPU reduction.
 *
 * Two-stage pipeline:
 * 1. Density shader computes per-pixel (prob, energy, prob) into RGBA32F
 * 2. Hierarchical 2x2 reduction: sum(R,G), max(B) down to 1x1
 * 3. Single-pixel readback (16 bytes instead of 3MB)
 */

import {
  createProgram, drawFullscreen, bindTextureUnit,
} from './gl-utils.js';

import quadVert from './shaders/quad.vert';
import reduceFrag from './shaders/reduce.glsl';
import reduceSumFrag from './shaders/reduce-sum.glsl';

export class Observables {
  constructor(gl, N, dx) {
    this.gl = gl;
    this.N = N;
    this.dx = dx;
    this.probability = 1.0;
    this.energy = 0.0;
    this.maxProb = 0.0;
    this.autoBrightness = 40.0;
    this.frameCounter = 0;
    this.updateInterval = 15;

    // Compile shaders
    this.densityProg = createProgram(gl, quadVert, reduceFrag);
    this.reduceProg = createProgram(gl, quadVert, reduceSumFrag);

    // Reduction chain: RGBA32F textures from N down to 1x1
    this.levels = [];
    let size = N;
    while (true) {
      const tex = this._createRGBA32FTexture(size);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.levels.push({ tex, fbo, size });
      if (size === 1) break;
      size = Math.max(1, size >> 1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Readback buffer for final 1x1 pixel
    this.resultBuf = new Float32Array(4);

    // VAO for draws
    this.vao = gl.createVertexArray();
  }

  _createRGBA32FTexture(size) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  update(solver, potentialTex) {
    this.frameCounter++;
    if (this.frameCounter % this.updateInterval !== 0) return;

    const gl = this.gl;
    const dx = this.dx;

    gl.bindVertexArray(this.vao);

    // Step 1: Compute density into level 0 (N x N RGBA32F)
    const level0 = this.levels[0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, level0.fbo);
    gl.viewport(0, 0, level0.size, level0.size);
    gl.useProgram(this.densityProg.program);

    const du = this.densityProg.uniforms;
    bindTextureUnit(gl, 0, solver.currentReal);
    bindTextureUnit(gl, 1, solver.currentImag);
    bindTextureUnit(gl, 2, potentialTex);
    gl.uniform1i(du.u_real, 0);
    gl.uniform1i(du.u_imag, 1);
    gl.uniform1i(du.u_potential, 2);
    gl.uniform1f(du.u_dx, dx);

    drawFullscreen(gl);

    // Step 2: Hierarchical 2x2 reduction
    gl.useProgram(this.reduceProg.program);
    const ru = this.reduceProg.uniforms;

    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1];
      const dst = this.levels[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.size, dst.size);

      bindTextureUnit(gl, 0, src.tex);
      gl.uniform1i(ru.u_input, 0);

      drawFullscreen(gl);
    }

    // Step 3: Read back 1x1 result
    const last = this.levels[this.levels.length - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, last.fbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, this.resultBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const totalProb = this.resultBuf[0] * dx * dx;
    const totalEnergy = this.resultBuf[1] * dx * dx;
    const maxP = this.resultBuf[2];

    this.probability = totalProb;
    this.energy = totalEnergy;
    this.maxProb = maxP;

    if (maxP > 1e-12) {
      const ideal = 0.8 / Math.sqrt(maxP);
      this.autoBrightness = this.autoBrightness * 0.7 + ideal * 0.3;
    } else {
      this.autoBrightness = 40.0;
    }
  }
}
