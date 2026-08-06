/**
 * SkySphere Shader (WGSL)
 *
 * Designed for a large scaled double-sided 3D sphere mesh.
 */

#define USE_LIGHTS
#define FEATURE_TONEMAPPING
#define USE_MATERIAL_ID
#define USE_POSITION_WORLD
#define USE_NORMAL

#include "lib/Compatibility.wgsl"

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.wgsl"
#include "lib/Inputs.wgsl"
#include "lib/Color.wgsl"
#include "lib/Packing.wgsl"
#include "lib/Materials.wgsl"
#include "lib/Lights.wgsl"
#include "lib/SkyProcedural.wgsl"

struct Material {
    color: vec4<f16>,
    direction: vec3<f32>,
    exposure: f32,
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

@fragment
fn main(
    @location(0) fragPositionWorld: vec3<f32>,
    @location(1) fragNormal: vec3<f32>,
) -> @location(0) vec4<f32> {
    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    let viewVec = fragPositionWorld - viewPositionWorld;
    let direction = select(normalize(fragPositionWorld), normalize(viewVec), length(viewVec) > 0.001);

    var lightPos = vec3<f32>(0.0, 1.0, 0.5);
    var lightDir = select(vec3<f32>(0.0, 1.0, 0.5), normalize(mat.direction), length(mat.direction) > 0.001);
    var lightCol = vec3<f32>(1.0);
    var isNight: f32 = 0.0;
    var animTime: f32 = 0.0;
    let exposureVal = select(1.0, mat.exposure, mat.exposure > 0.001);

    #if NUM_LIGHTS > 0
    lightPos = lightPositionsWorld[0];
    isNight = select(0.0, 1.0, lightPos.x >= 0.5);
    animTime = lightPos.y;

    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

    var color = evaluateUltraStylizedSky(direction, lightDir, lightCol, isNight, animTime) * exposureVal;

    #ifdef TONEMAPPING
    let camExp = select(1.0, cameraParams.y, cameraParams.y > 0.001);
    color *= camExp;
    var linear = srgbToLinear3(color);
    color = linearToSrgb3(tonemap(linear));
    #endif

    return vec4<f32>(color, f32(mat.color.a));
}
