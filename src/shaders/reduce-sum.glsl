#version 300 es
precision highp float;

// Hierarchical 2x2 reduction: sum R and G channels, max B channel

uniform sampler2D u_input;

out vec4 fragColor;

void main() {
    ivec2 base = ivec2(gl_FragCoord.xy) * 2;

    vec4 a = texelFetch(u_input, base, 0);
    vec4 b = texelFetch(u_input, base + ivec2(1, 0), 0);
    vec4 c = texelFetch(u_input, base + ivec2(0, 1), 0);
    vec4 d = texelFetch(u_input, base + ivec2(1, 1), 0);

    float prob = a.r + b.r + c.r + d.r;
    float energy = a.g + b.g + c.g + d.g;
    float maxP = max(max(a.b, b.b), max(c.b, d.b));

    fragColor = vec4(prob, energy, maxP, 1.0);
}
