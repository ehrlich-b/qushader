#version 300 es
precision highp float;

// Imaginary time step: psi_new = psi - dt * H(psi)
// Projects onto the ground state by exponentially damping higher-energy components.

uniform sampler2D u_psi;
uniform sampler2D u_potential;
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

    float psi = texelFetch(u_psi, tc, 0).r;

    float pp = texelFetch(u_psi, tc + ivec2(1,0), 0).r;
    float pm = texelFetch(u_psi, tc - ivec2(1,0), 0).r;
    float jp = texelFetch(u_psi, tc + ivec2(0,1), 0).r;
    float jm = texelFetch(u_psi, tc - ivec2(0,1), 0).r;

    float lap = (pp + pm + jp + jm - 4.0 * psi) / dx2;
    float V = texelFetch(u_potential, tc, 0).r;

    float H_psi = -0.5 * lap + V * psi;
    float gamma = absorbMask(gl_FragCoord.xy);

    float psi_new = psi - u_dt * H_psi - u_dt * gamma * psi;

    fragColor = vec4(psi_new, 0.0, 0.0, 1.0);
}
