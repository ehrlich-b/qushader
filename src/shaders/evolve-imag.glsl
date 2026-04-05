#version 300 es
precision highp float;

// Visscher leapfrog: update Im(psi) from Re(psi)
// I(t+3dt/2) = I(t+dt/2) + dt * H * R(t+dt)
// where H*R = -(1/2)*laplacian(R) + V*R

uniform sampler2D u_real;      // Re(psi) at time t+dt (just updated)
uniform sampler2D u_imag;      // Im(psi) at time t + dt/2
uniform sampler2D u_potential; // V(x,y)
uniform float u_dt;
uniform float u_dx;
uniform vec2 u_resolution;
uniform float u_absorb_width;

out vec4 fragColor;

float absorbMask(vec2 pos) {
    float w = u_absorb_width;
    vec2 edge = min(pos, u_resolution - pos);
    float d = min(edge.x, edge.y);
    if (d >= w) return 0.0;
    float t = 1.0 - d / w;
    return 0.5 * t * t;
}

void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float dx2 = u_dx * u_dx;

    // Current imag part
    float I = texelFetch(u_imag, tc, 0).r;

    // Real part and its neighbors for laplacian
    float R  = texelFetch(u_real, tc, 0).r;
    float Rp = texelFetch(u_real, tc + ivec2(1, 0), 0).r;
    float Rm = texelFetch(u_real, tc - ivec2(1, 0), 0).r;
    float Sp = texelFetch(u_real, tc + ivec2(0, 1), 0).r;
    float Sm = texelFetch(u_real, tc - ivec2(0, 1), 0).r;

    float laplacian_R = (Rp + Rm + Sp + Sm - 4.0 * R) / dx2;
    float V = texelFetch(u_potential, tc, 0).r;

    // H * R = -0.5 * laplacian(R) + V * R
    float HR = -0.5 * laplacian_R + V * R;

    // Absorbing boundary damping
    float gamma = absorbMask(gl_FragCoord.xy);

    // I(t+3dt/2) = I(t+dt/2) + dt * H * R  - dt * gamma * I
    float I_new = I + u_dt * HR - u_dt * gamma * I;

    fragColor = vec4(I_new, 0.0, 0.0, 1.0);
}
