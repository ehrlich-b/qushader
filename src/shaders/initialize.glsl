#version 300 es
precision highp float;

// Generate a Gaussian wavepacket
// psi(r) = N * exp(-|r-r0|^2 / (4*sigma^2)) * exp(i * k0 . r)

uniform vec2 u_r0;      // center position (atomic units)
uniform vec2 u_k0;      // momentum vector (atomic units)
uniform float u_sigma;   // width (atomic units)
uniform float u_dx;
uniform int u_component; // 0 = real, 1 = imag

// Existing wavefunction to add to
uniform sampler2D u_existing;
uniform int u_additive;  // 1 = add to existing, 0 = replace

out vec4 fragColor;

void main() {
    vec2 pos = gl_FragCoord.xy * u_dx;
    vec2 dr = pos - u_r0;
    float r2 = dot(dr, dr);
    float sigma2 = u_sigma * u_sigma;

    // Normalization: 1/(2*pi*sigma^2)^(1/2) for 2D Gaussian
    float N = 1.0 / (u_sigma * sqrt(2.0 * 3.14159265359));
    float envelope = N * exp(-r2 / (4.0 * sigma2));
    float phase = dot(u_k0, pos);

    float val;
    if (u_component == 0) {
        val = envelope * cos(phase);
    } else {
        val = envelope * sin(phase);
    }

    float existing = 0.0;
    if (u_additive == 1) {
        existing = texelFetch(u_existing, ivec2(gl_FragCoord.xy), 0).r;
    }

    fragColor = vec4(existing + val, 0.0, 0.0, 1.0);
}
