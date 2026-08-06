#include "lib/Compatibility.glsl"

#define USE_TEXTURE_COORDS
#define USE_MATERIAL_ID

#include "lib/Inputs.glsl"

#define TEXTURED
#include "lib/Textures.glsl"
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

struct Material {
    lowp vec4 color;
    lowp vec4 outlineColor;
    lowp vec2 outlineRange;
    mediump uint vectorTexture;
    lowp float smoothness;
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);
    lowp float intensity = textureAtlas(mat.vectorTexture, fragTextureCoords).r;

    /* Fill color */
    outColor = smoothstep(
        mat.outlineRange.x-mat.smoothness,
        mat.outlineRange.x+mat.smoothness,
        intensity)*mat.color;

    /* Outline */
    if(mat.outlineRange.x > mat.outlineRange.y) {
        /* Doing *0.5 instead of /2.0 because the latter causes iOS / WebGL to
           complain that "Overflow in implicit constant conversion, minimum
           range for lowp float is (-2,2)" */
        lowp float mid = (mat.outlineRange.x + mat.outlineRange.y)*0.5;
        lowp float halfRange = (mat.outlineRange.x - mat.outlineRange.y)*0.5;
        outColor += smoothstep(halfRange+mat.smoothness, halfRange-mat.smoothness, distance(mid, intensity))*mat.outlineColor;
    }
}
