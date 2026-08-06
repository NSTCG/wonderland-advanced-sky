precision highp float;

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
#include "lib/SkyProcedural.glsl"

void main() {
    vec3 unprojPoint = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    vec3 direction = normalize(quat_transformVector(viewToWorld[0], unprojPoint));

    Material mat = decodeMaterial(material);

    /** @todo: Expose parameters */
    AtmosphericParams params;
    params.turbidity = 10.0;
    params.rayleigh = 3.0;
    params.mieCoefficient = 0.005;
    params.mieDirectionalG = 0.7;
    vec3 sunDirection = normalize(mat.direction);
    vec3 color = evaluateAthmosphericSky(direction, sunDirection, params)*mat.exposure;

    #ifdef TONEMAPPING
    /* Apply exposure */
    color *= cameraParams.y;
    color = tonemap(color);
    #endif

    outColor = vec4(linearToSrgb(color), 1.0);
}
