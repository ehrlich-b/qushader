/**
 * Renders the wavefunction to the display canvas.
 */

import {
  createProgram, drawFullscreen, bindTextureUnit,
} from './gl-utils.js';

import quadVert from './shaders/quad.vert';
import renderFrag from './shaders/render.glsl';

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, quadVert, renderFrag);
    this.vao = gl.createVertexArray();
    this.brightness = 40.0; // adjustable
    this.showPotential = true;
  }

  render(solver, potentialTex, displayWidth, displayHeight) {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, displayWidth, displayHeight);
    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);

    const u = this.program.uniforms;
    bindTextureUnit(gl, 0, solver.currentReal);
    bindTextureUnit(gl, 1, solver.currentImag);
    bindTextureUnit(gl, 2, potentialTex);
    gl.uniform1i(u.u_real, 0);
    gl.uniform1i(u.u_imag, 1);
    gl.uniform1i(u.u_potential, 2);
    gl.uniform1f(u.u_brightness, this.brightness);
    gl.uniform1i(u.u_show_potential, this.showPotential ? 1 : 0);

    drawFullscreen(gl);
  }
}
