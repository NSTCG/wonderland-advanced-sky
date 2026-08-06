#include "lib/Compatibility.glsl"

#define SHADER_TYPE_MESH_VISUALIZER

#define USE_MATERIAL_ID
#define USE_BARYCENTRIC

#include "lib/Inputs.glsl"
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

struct Material {
    lowp vec4 color;
    lowp vec4 wireframeColor;
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    lowp vec3 d = fwidth(fragBarycentric);
    lowp vec3 factor = smoothstep(vec3(0.0), d*1.5, fragBarycentric);
    lowp float nearest = min(min(factor.x, factor.y), factor.z);

    outColor = mix(mat.wireframeColor, mat.color, nearest);
}
