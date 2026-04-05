#version 300 es
precision highp float;

// Visscher leapfrog: update Re(psi) from Im(psi)
// R(t+dt) = R(t) - dt * H * I(t+dt/2)
// where H*I = -(1/2)*laplacian(I) + V*I

uniform sampler2D u_real;      // Re(psi) at time t
uniform sampler2D u_imag;      // Im(psi) at time t + dt/2
uniform sampler2D u_potential; // V(x,y)
uniform float u_dt;
uniform float u_dx;
uniform vec2 u_resolution;    // grid size in texels
uniform float u_absorb_width; // absorbing boundary width in texels

out vec4 fragColor;

float absorbMask(vec2 pos) {
    float w = u_absorb_width;
    vec2 edge = min(pos, u_resolution - pos);
    float d = min(edge.x, edge.y);
    if (d >= w) return 0.0;
    float t = 1.0 - d / w;
    return 0.5 * t * t; // quadratic ramp
}

void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float dx2 = u_dx * u_dx;

    // Current real part
    float R = texelFetch(u_real, tc, 0).r;

    // Imaginary part and its neighbors for laplacian
    float I  = texelFetch(u_imag, tc, 0).r;
    float Ip = texelFetch(u_imag, tc + ivec2(1, 0), 0).r;
    float Im = texelFetch(u_imag, tc - ivec2(1, 0), 0).r;
    float Jp = texelFetch(u_imag, tc + ivec2(0, 1), 0).r;
    float Jm = texelFetch(u_imag, tc - ivec2(0, 1), 0).r;

    float laplacian_I = (Ip + Im + Jp + Jm - 4.0 * I) / dx2;
    float V = texelFetch(u_potential, tc, 0).r;

    // H * I = -0.5 * laplacian(I) + V * I
    float HI = -0.5 * laplacian_I + V * I;

    // Absorbing boundary damping
    float gamma = absorbMask(gl_FragCoord.xy);

    // R(t+dt) = R(t) - dt * H * I  - dt * gamma * R
    float R_new = R - u_dt * HI - u_dt * gamma * R;

    fragColor = vec4(R_new, 0.0, 0.0, 1.0);
}
