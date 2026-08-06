precision highp float;

#define USE_LIGHTS
#define USE_MATERIAL_ID

#define FEATURE_TONEMAPPING

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.glsl"

#define USE_NDC_COORDINATES
in highp vec2 ndcCoordinates;

out lowp vec4 outColor;

struct Material {
    lowp vec3 direction;
    lowp float exposure;
};

#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

#include "lib/Quaternion.glsl"
#include "lib/Math.glsl"
#include "lib/CoordinateSystems.glsl"
#include "lib/Color.glsl"
#include "lib/Lights.glsl"
#include "lib/SkyProcedural.glsl"

void main() {
    vec3 unprojPoint = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    vec3 direction = length(unprojPoint) > 0.001 ? normalize(quat_transformVector(viewToWorld[0], unprojPoint)) : vec3(0.0, 1.0, 0.0);

    Material mat = decodeMaterial(material);

    // Default fallbacks with zero-guards
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

    vec3 color = evaluateUltraStylizedSky(direction, lightDir, lightCol, isNight, animTime) * exposureVal;

    #ifdef TONEMAPPING
    /* Apply exposure */
    float camExp = cameraParams.y <= 0.001 ? 1.0 : cameraParams.y;
    color *= camExp;
    color = tonemap(color);
    #endif

    outColor = vec4(linearToSrgb(color), 1.0);
}
