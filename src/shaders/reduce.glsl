#version 300 es
precision highp float;

// Compute |psi|^2 for probability integration
// Also compute local energy density for energy calculation

uniform sampler2D u_real;
uniform sampler2D u_imag;
uniform sampler2D u_potential;
uniform float u_dx;
uniform int u_mode; // 0 = probability, 1 = energy

out vec4 fragColor;

void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float R = texelFetch(u_real, tc, 0).r;
    float I = texelFetch(u_imag, tc, 0).r;

    if (u_mode == 0) {
        // Probability density
        float prob = (R * R + I * I);
        fragColor = vec4(prob, 0.0, 0.0, 1.0);
    } else {
        // Energy density: Re(psi* H psi) = R*(H*R component) + I*(H*I component)
        // Approximate with kinetic + potential energy density
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

        // <H> integrand = -0.5*(R*lapR + I*lapI) + V*(R*R + I*I)
        float energy = -0.5*(R*lapR + I*lapI) + V*(R*R + I*I);
        fragColor = vec4(energy, 0.0, 0.0, 1.0);
    }
}
