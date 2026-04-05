#version 300 es
// Full-screen triangle (no vertex buffer needed)
// Draw with gl.drawArrays(gl.TRIANGLES, 0, 3)
void main() {
    float x = float((gl_VertexID & 1) << 2);
    float y = float((gl_VertexID & 2) << 1);
    gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
