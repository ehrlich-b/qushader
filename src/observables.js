/**
 * Compute observables (probability, energy, max density) by GPU readback.
 *
 * Reads wavefunction + potential textures periodically (not every frame)
 * and computes diagnostics on CPU.
 */

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
    this.updateInterval = 15; // compute every N frames

    // Readback buffers
    this.realBuf = new Float32Array(N * N);
    this.imagBuf = new Float32Array(N * N);
    this.potentialBuf = new Float32Array(N * N);

    // Temp FBO for reading the potential texture
    this.readFBO = gl.createFramebuffer();
  }

  update(solver, potentialTex) {
    this.frameCounter++;
    if (this.frameCounter % this.updateInterval !== 0) return;

    const gl = this.gl;
    const N = this.N;
    const dx = this.dx;
    const dx2 = dx * dx;

    // Read real texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, solver.realFBO[solver.cur]);
    gl.readPixels(0, 0, N, N, gl.RED, gl.FLOAT, this.realBuf);

    // Read imag texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, solver.imagFBO[solver.cur]);
    gl.readPixels(0, 0, N, N, gl.RED, gl.FLOAT, this.imagBuf);

    // Read potential texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, potentialTex, 0
    );
    gl.readPixels(0, 0, N, N, gl.RED, gl.FLOAT, this.potentialBuf);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Compute probability, peak density, and energy in one pass over interior pixels.
    // Skipping the 1-pixel border is negligible (absorbing boundary kills the edge anyway).
    let prob = 0;
    let energySum = 0;
    let maxP = 0;

    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const idx = y * N + x;
        const R = this.realBuf[idx];
        const I = this.imagBuf[idx];
        const p = R * R + I * I;
        prob += p;
        if (p > maxP) maxP = p;

        const V = this.potentialBuf[idx];
        const lapR = (this.realBuf[idx + 1] + this.realBuf[idx - 1] +
                      this.realBuf[idx + N] + this.realBuf[idx - N] - 4 * R) / dx2;
        const lapI = (this.imagBuf[idx + 1] + this.imagBuf[idx - 1] +
                      this.imagBuf[idx + N] + this.imagBuf[idx - N] - 4 * I) / dx2;
        energySum += -0.5 * (R * lapR + I * lapI) + V * p;
      }
    }

    this.probability = prob * dx2;
    this.energy = energySum * dx2;
    this.maxProb = maxP;

    // Auto-brightness: target sqrt(maxP) * brightness ~ 0.8
    if (maxP > 1e-12) {
      const ideal = 0.8 / Math.sqrt(maxP);
      this.autoBrightness = this.autoBrightness * 0.7 + ideal * 0.3;
    } else {
      this.autoBrightness = 40.0;
    }
  }
}
