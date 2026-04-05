/**
 * Visscher leapfrog TDSE solver.
 *
 * Maintains two textures (Re and Im at staggered half-timesteps)
 * and ping-pong evolves them via fragment shaders.
 */

import {
  createFloat32Texture, createFBO, createProgram,
  drawFullscreen, bindTextureUnit,
} from './gl-utils.js';

import quadVert from './shaders/quad.vert';
import evolveRealFrag from './shaders/evolve-real.glsl';
import evolveImagFrag from './shaders/evolve-imag.glsl';

export class Solver {
  constructor(gl, N, dx, dt) {
    this.gl = gl;
    this.N = N;
    this.dx = dx;
    this.dt = dt;
    this.absorbWidth = Math.floor(N * 0.1); // 10% border

    // Two pairs for ping-pong
    this.realTex = [
      createFloat32Texture(gl, N, N, null),
      createFloat32Texture(gl, N, N, null),
    ];
    this.imagTex = [
      createFloat32Texture(gl, N, N, null),
      createFloat32Texture(gl, N, N, null),
    ];

    this.realFBO = [
      createFBO(gl, this.realTex[0]),
      createFBO(gl, this.realTex[1]),
    ];
    this.imagFBO = [
      createFBO(gl, this.imagTex[0]),
      createFBO(gl, this.imagTex[1]),
    ];

    // Which index is "current" (read from) vs "next" (write to)
    this.cur = 0;

    // Compile evolution programs
    this.evolveRealProg = createProgram(gl, quadVert, evolveRealFrag);
    this.evolveImagProg = createProgram(gl, quadVert, evolveImagFrag);

    // Create empty VAO (needed for WebGL 2 draw without buffers)
    this.vao = gl.createVertexArray();
  }

  /** Get the current Re(psi) texture for reading */
  get currentReal() { return this.realTex[this.cur]; }
  /** Get the current Im(psi) texture for reading */
  get currentImag() { return this.imagTex[this.cur]; }

  /** Overwrite current real texture */
  setRealTexture(tex) {
    this.realTex[this.cur] = tex;
    // Reattach to FBO
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.realFBO[this.cur]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setImagTexture(tex) {
    this.imagTex[this.cur] = tex;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.imagFBO[this.cur]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Perform one Visscher leapfrog step.
   * 1. Update Im: I(t+3dt/2) = I(t+dt/2) + dt * H * R(t+dt)
   *    ... wait, ordering: first update R, then I.
   *
   * Actually Visscher ordering:
   *   Step A: R(t+dt) = R(t) - dt * H_I(t+dt/2)
   *   Step B: I(t+3dt/2) = I(t+dt/2) + dt * H_R(t+dt)
   */
  step(potentialTex) {
    const gl = this.gl;
    const next = 1 - this.cur;

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.N, this.N);

    // Step A: Evolve Real
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.realFBO[next]);
    gl.useProgram(this.evolveRealProg.program);

    const rp = this.evolveRealProg.uniforms;
    bindTextureUnit(gl, 0, this.realTex[this.cur]);
    bindTextureUnit(gl, 1, this.imagTex[this.cur]);
    bindTextureUnit(gl, 2, potentialTex);
    gl.uniform1i(rp.u_real, 0);
    gl.uniform1i(rp.u_imag, 1);
    gl.uniform1i(rp.u_potential, 2);
    gl.uniform1f(rp.u_dt, this.dt);
    gl.uniform1f(rp.u_dx, this.dx);
    gl.uniform2f(rp.u_resolution, this.N, this.N);
    gl.uniform1f(rp.u_absorb_width, this.absorbWidth);

    drawFullscreen(gl);

    // Step B: Evolve Imag (using the just-updated Real)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.imagFBO[next]);
    gl.useProgram(this.evolveImagProg.program);

    const ip = this.evolveImagProg.uniforms;
    bindTextureUnit(gl, 0, this.realTex[next]); // freshly updated
    bindTextureUnit(gl, 1, this.imagTex[this.cur]);
    bindTextureUnit(gl, 2, potentialTex);
    gl.uniform1i(ip.u_real, 0);
    gl.uniform1i(ip.u_imag, 1);
    gl.uniform1i(ip.u_potential, 2);
    gl.uniform1f(ip.u_dt, this.dt);
    gl.uniform1f(ip.u_dx, this.dx);
    gl.uniform2f(ip.u_resolution, this.N, this.N);
    gl.uniform1f(ip.u_absorb_width, this.absorbWidth);

    drawFullscreen(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = next;
  }

  /** Clear wavefunction to zero */
  clear() {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.realFBO[i]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.imagFBO[i]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;
  }
}
