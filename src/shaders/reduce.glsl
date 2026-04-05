#version 300 es
precision highp float;

// Compute per-pixel density: probability (R), energy density (G), probability again (B, for max reduction)

uniform sampler2D u_real;
uniform sampler2D u_imag;
uniform sampler2D u_potential;
uniform float u_dx;

out vec4 fragColor;

void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float R = texelFetch(u_real, tc, 0).r;
    float I = texelFetch(u_imag, tc, 0).r;
    float prob = R * R + I * I;

    float dx2 = u_dx * u_dx;

    float Rp = texelFetch(u_real, tc + ivec2(1,0), 0).r;
    float Rm = texelFetch(u_real, tc - ivec2(1,0), 0).r;
    float Rj = texelFetch(u_real, tc + ivec2(0,1), 0).r;
    float Rk = texelFetch(u_real, tc - ivec2(0,1), 0).r;
    float lapR = (Rp + Rm + Rj + Rk - 4.0*R) / dx2;

    float Ip = texelFetch(u_imag, tc + ivec2(1,0), 0).r;
    float Im2 = texelFetch(u_imag, tc - ivec2(1,0), 0).r;
    float Ij = texelFetch(u_imag, tc + ivec2(0,1), 0).r;
    float Ik = texelFetch(u_imag, tc - ivec2(0,1), 0).r;
    float lapI = (Ip + Im2 + Ij + Ik - 4.0*I) / dx2;

    float V = texelFetch(u_potential, tc, 0).r;
    float energy = -0.5*(R*lapR + I*lapI) + V*prob;

    fragColor = vec4(prob, energy, prob, 1.0);
}
