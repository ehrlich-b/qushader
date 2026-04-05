#version 300 es
precision highp float;

// Multiply texture by a scalar (used for wavefunction renormalization)

uniform sampler2D u_input;
uniform float u_scale;

out vec4 fragColor;

void main() {
    float val = texelFetch(u_input, ivec2(gl_FragCoord.xy), 0).r;
    fragColor = vec4(val * u_scale, 0.0, 0.0, 1.0);
}
