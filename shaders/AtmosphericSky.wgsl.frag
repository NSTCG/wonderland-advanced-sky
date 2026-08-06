#define USE_MATERIAL_ID
#define USE_NDC_COORDINATES

#define FEATURE_TONEMAPPING

#include "lib/Compatibility.wgsl"

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.wgsl"

struct Material {
    direction: vec3<f16>,
    exposure: f16,
};

#include "lib/Packing.wgsl"
#include "lib/Materials.wgsl"

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

#include "lib/Quaternion.wgsl"
#include "lib/Math.wgsl"
#include "lib/CoordinateSystems.wgsl"
#include "lib/Color.wgsl"
#include "lib/Lights.wgsl"
#include "lib/SkyProcedural.wgsl"

@fragment
fn main(
    @location(0) ndcCoordinates: vec2<f32>
) -> @location(0) vec4<f32> {

    let unprojPoint: vec3<f32> = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    let direction: vec3<f32> = normalize(quat_transformVector(viewToWorld[0], unprojPoint));

    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    var lightPos = vec3<f32>(0.0, 1.0, 0.5);
    var lightDir = normalize(vec3<f32>(mat.direction));
    var lightCol = vec3<f32>(1.0);
    var isNight: f32 = 0.0;
    var animTime: f32 = 0.0;

    #if NUM_LIGHTS > 0
    lightPos = lightPositionsWorld[0];
    isNight = select(0.0, 1.0, lightPos.x >= 0.5);
    animTime = lightPos.y;

    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(-lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

    var color: vec3<f32> = evaluateUltraStylizedSky(direction, lightDir, lightCol, isNight, animTime) * f32(mat.exposure);

    #ifdef TONEMAPPING
    /* Apply exposure */
    color *= cameraParams.y;
    color = tonemap(color);
    #endif

    return vec4<f32>(linearToSrgb3(color), 1.0);
}
