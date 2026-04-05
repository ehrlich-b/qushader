/**
 * Wavepacket initialization — writes Gaussian wavepackets into the solver textures.
 */

import {
  createFloat32Texture, createFBO, createProgram,
  drawFullscreen, bindTextureUnit,
} from './gl-utils.js';

import quadVert from './shaders/quad.vert';
import initFrag from './shaders/initialize.glsl';

export class Initializer {
  constructor(gl, N, dx) {
    this.gl = gl;
    this.N = N;
    this.dx = dx;

    this.program = createProgram(gl, quadVert, initFrag);
    this.vao = gl.createVertexArray();

    // Temp FBO for writing init results
    this.tmpTex = createFloat32Texture(gl, N, N, null);
    this.tmpFBO = createFBO(gl, this.tmpTex);
  }

  /**
   * Generate a Gaussian wavepacket and write it into target textures.
   *
   * @param {object} solver - The Solver instance
   * @param {number} x0 - Center x in atomic units
   * @param {number} y0 - Center y in atomic units
   * @param {number} kx - Momentum x in atomic units
   * @param {number} ky - Momentum y in atomic units
   * @param {number} sigma - Width in atomic units
   * @param {boolean} additive - Add to existing wavefunction?
   */
  launch(solver, x0, y0, kx, ky, sigma, additive = true) {
    const gl = this.gl;
    const u = this.program.uniforms;

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.N, this.N);
    gl.useProgram(this.program.program);

    gl.uniform2f(u.u_r0, x0, y0);
    gl.uniform2f(u.u_k0, kx, ky);
    gl.uniform1f(u.u_sigma, sigma);
    gl.uniform1f(u.u_dx, this.dx);

    // Generate real part
    gl.uniform1i(u.u_component, 0);
    gl.uniform1i(u.u_additive, additive ? 1 : 0);
    bindTextureUnit(gl, 0, solver.currentReal);
    gl.uniform1i(u.u_existing, 0);

    // Write to temp texture, then swap into solver
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmpFBO);
    drawFullscreen(gl);

    // Swap temp into solver's real slot
    const oldReal = solver.currentReal;
    solver.setRealTexture(this.tmpTex);
    this.tmpTex = oldReal;
    // Reattach old texture to our temp FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmpFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tmpTex, 0);

    // Generate imag part
    gl.uniform1i(u.u_component, 1);
    gl.uniform1i(u.u_additive, additive ? 1 : 0);
    bindTextureUnit(gl, 0, solver.currentImag);
    gl.uniform1i(u.u_existing, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmpFBO);
    drawFullscreen(gl);

    const oldImag = solver.currentImag;
    solver.setImagTexture(this.tmpTex);
    this.tmpTex = oldImag;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tmpFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tmpTex, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
