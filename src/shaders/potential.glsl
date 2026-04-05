#version 300 es
precision highp float;

// Compose potential from sources

#define MAX_SOURCES 8

// Each source: vec4(x, y, strength, type), vec4(width, softening, 0, 0)
uniform vec4 u_sources_a[MAX_SOURCES]; // position.xy, strength, type
uniform vec4 u_sources_b[MAX_SOURCES]; // width, softening, 0, 0
uniform int u_num_sources;
uniform float u_dx;
uniform vec2 u_resolution;
uniform int u_potential_mode; // 0 = 2D Coulomb (ln), 1 = 3D slice (1/r)

out vec4 fragColor;

void main() {
    vec2 pos = gl_FragCoord.xy * u_dx; // position in atomic units

    float V = 0.0;

    for (int i = 0; i < MAX_SOURCES; i++) {
        if (i >= u_num_sources) break;

        vec2 src_pos = u_sources_a[i].xy;
        float Z = u_sources_a[i].z;
        int type = int(u_sources_a[i].w);
        float width = u_sources_b[i].x;
        float eps = u_sources_b[i].y;

        vec2 dr = pos - src_pos;
        float r = length(dr);

        if (type == 0) {
            if (u_potential_mode == 0) {
                // 2D Coulomb: V = Z * ln(r/r_ref)
                // Attractive well: ln(r) → -inf near origin, ~0 at boundary
                float r_ref = u_resolution.x * u_dx * 0.5;
                V += Z * 0.5 * log((r * r + eps * eps) / (r_ref * r_ref));
            } else {
                // 3D slice: V = -Z / r
                V += -Z / sqrt(r * r + eps * eps);
            }
        } else if (type == 1) {
            // Gaussian barrier: V = Z * exp(-r^2 / (2*width^2))
            V += Z * exp(-r * r / (2.0 * width * width));
        } else if (type == 2) {
            // Harmonic: V = 0.5 * Z * r^2
            V += 0.5 * Z * r * r;
        }
    }

    fragColor = vec4(V, 0.0, 0.0, 1.0);
}
