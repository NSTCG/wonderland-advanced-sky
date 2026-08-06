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
#include "lib/SkyProcedural.wgsl"

@fragment
fn main(
    @location(0) ndcCoordinates: vec2<f32>
) -> @location(0) vec4<f32> {

    let unprojPoint: vec3<f32> = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    let direction: vec3<f32> = normalize(quat_transformVector(viewToWorld[0], unprojPoint));

    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    /** @todo: Expose parameters */
    var params: AtmosphericParams;
    params.turbidity = 10.0;
    params.rayleigh = 3.0;
    params.mieCoefficient = 0.005;
    params.mieDirectionalG = 0.7;
    let sunDirection: vec3<f32> = normalize(mat.direction);

    var color: vec3<f32> = evaluateAthmosphericSky(direction, sunDirection, params)*mat.exposure;

    #ifdef TONEMAPPING
    /* Apply exposure */
    color *= cameraParams.y;
    color = tonemap(color);
    #endif

    return vec4<f32>(linearToSrgb3(color), 1.0);
}
