/**
 * Compute observables (probability, energy) by GPU readback.
 *
 * We do a full readback of the wavefunction textures periodically
 * (not every frame — it's expensive). GPU reduction would be better
 * but this is simpler for v0.
 */

export class Observables {
  constructor(gl, N, dx) {
    this.gl = gl;
    this.N = N;
    this.dx = dx;
    this.probability = 1.0;
    this.energy = 0.0;
    this.frameCounter = 0;
    this.updateInterval = 15; // compute every N frames

    // Readback buffers — R32F textures, so read with gl.RED
    this.realBuf = new Float32Array(N * N);
    this.imagBuf = new Float32Array(N * N);
  }

  update(solver, potentialTex) {
    this.frameCounter++;
    if (this.frameCounter % this.updateInterval !== 0) return;

    const gl = this.gl;
    const N = this.N;
    const dx = this.dx;

    // Read real texture (R32F → RED/FLOAT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, solver.realFBO[solver.cur]);
    gl.readPixels(0, 0, N, N, gl.RED, gl.FLOAT, this.realBuf);

    // Read imag texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, solver.imagFBO[solver.cur]);
    gl.readPixels(0, 0, N, N, gl.RED, gl.FLOAT, this.imagBuf);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Compute probability
    let prob = 0;
    for (let i = 0; i < N * N; i++) {
      const r = this.realBuf[i];
      const im = this.imagBuf[i];
      prob += r * r + im * im;
    }
    this.probability = prob * dx * dx;

    // Energy computation would need the potential readback too,
    // and laplacian computation on CPU. Skip for now — probability
    // is the critical diagnostic.
    // TODO: GPU reduction for energy
  }
}
