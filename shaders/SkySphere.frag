#include "lib/Compatibility.glsl"

/**
 * SkySphere Shader (GLSL)
 *
 * Designed for a large scaled double-sided 3D sphere mesh.
 * Recreates the full atmospheric sky (day/sunset/night, sun/moon disks, stars, clouds)
 * using evaluateUltraStylizedSky based on world-space fragment ray direction.
 */

#define USE_LIGHTS
#define FEATURE_TONEMAPPING
#define USE_MATERIAL_ID
#define USE_POSITION_WORLD
#define USE_NORMAL

#include "lib/Uniforms.glsl"
#include "lib/Inputs.glsl"
#include "lib/Color.glsl"
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"
#include "lib/Lights.glsl"
#include "lib/SkyProcedural.glsl"

struct Material {
    lowp vec4 color;
    mediump vec3 direction;
    mediump float exposure;
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    // Compute view ray direction from camera position to 3D sphere fragment in world space
    vec3 viewVec = fragPositionWorld - viewPositionWorld;
    vec3 direction = length(viewVec) > 0.001 ? normalize(viewVec) : normalize(fragPositionWorld);

    // Light direction & animation state fallbacks
    vec3 lightPos = vec3(0.0, 1.0, 0.5);
    vec3 lightDir = length(mat.direction) > 0.001 ? normalize(mat.direction) : vec3(0.0, 1.0, 0.5);
    vec3 lightCol = vec3(1.0);
    float isNight = 0.0;
    float animTime = 0.0;
    float exposureVal = mat.exposure <= 0.001 ? 1.0 : mat.exposure;

    #if NUM_LIGHTS > 0
    lightPos = lightPositionsWorld[0];
    isNight = (lightPos.x >= 0.5) ? 1.0 : 0.0;
    animTime = lightPos.y;

    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

    // Recreate full atmospheric sky effect on sphere mesh
    vec3 color = evaluateUltraStylizedSky(direction, lightDir, lightCol, isNight, animTime) * exposureVal;

    #ifdef TONEMAPPING
    float camExp = cameraParams.y <= 0.001 ? 1.0 : cameraParams.y;
    color *= camExp;
    color = tonemap(color);
    #endif

    outColor = vec4(color, mat.color.a);
}
