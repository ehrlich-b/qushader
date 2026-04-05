#version 300 es
precision highp float;

// Phase-wheel rendering:
// hue = arg(psi), brightness = |psi|^2

uniform sampler2D u_real;
uniform sampler2D u_imag;
uniform sampler2D u_potential;
uniform float u_brightness;
uniform int u_show_potential;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float R = texelFetch(u_real, tc, 0).r;
    float I = texelFetch(u_imag, tc, 0).r;

    float prob = R * R + I * I;
    float phase = atan(I, R); // [-PI, PI]
    float hue = (phase + PI) / TWO_PI; // [0, 1]

    // sqrt for better dynamic range
    float brightness = sqrt(prob) * u_brightness;

    vec3 color = hsv2rgb(vec3(hue, 0.85, min(brightness, 1.0)));

    // Potential overlay
    if (u_show_potential == 1) {
        float V = texelFetch(u_potential, tc, 0).r;
        // Show potential as faint blue/red overlay
        float vNorm = clamp(V * 0.1, -1.0, 1.0);
        if (vNorm < 0.0) {
            // Attractive (negative) potential: blue tint
            color += vec3(0.0, 0.0, -vNorm * 0.15);
        } else {
            // Repulsive (positive) potential: red tint
            color += vec3(vNorm * 0.15, 0.0, 0.0);
        }
    }

    // Subtle grid dot at potential source locations could go here

    fragColor = vec4(color, 1.0);
}
