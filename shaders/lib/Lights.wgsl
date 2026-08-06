#if NUM_LIGHTS > 0

struct Lights {
    positionsWorld: array<vec3<f32>, NUM_LIGHTS>,
    directionsWorld: array<vec3<f32>, NUM_LIGHTS>,
    /* R, G, B, intensity */
    colors: array<vec4<f8>, NUM_LIGHTS>,
    /* outerAngle, innerAngle, shadows, shadowIndex */
    parameters: array<vec4<f32>, NUM_LIGHTS>,
}

@group(0) @binding(1) var<uniform> lights: Lights;

#endif

fn distanceAttenuation(distanceSquared: f16, intensity: f16) -> f16 {
    #ifdef DEPRECATED_LIGHT_ATTENUATION
    return 1.0/(1.0 + distanceSquared/intensity*0.3333);
    #else
    /* Prevent attenuation blowing up near 0 by pretending lights are bulbs
     * with radius 5cm */
    return intensity/max(distanceSquared, 0.0025);
    #endif
}

fn spotAttenuation(l: vec3<f32>, direction: vec3<f32>, coneCos: f32, penumbraCos: f32) -> f32 {
    let angleCos: f32 = dot(l, direction);
    if (angleCos > coneCos) {
        return smoothstep(coneCos, penumbraCos, angleCos);
    } else {
        return 0.0;
    }
}

const LOG2 = -1.442695;

/**
 * Calculate fog blend factor, equivalent to GL fixed function fog mode GL_EXP2
 *
 * @param dist Distance to fragment in eye coordinates
 * @param density Fog density
 * returns Fog factor, clamped to 0-1
 */
fn fogBlendFactor(dist: f32, density: f32) -> f32 {
    /* e^(-d²), rewritten to use exp2 for performance: 2^(-d²log2(e)) */
    let d = density * dist;
    return 1.0 - clamp(exp2(d*d*LOG2), 0.0, 1.0);
}

#if NUM_SHADOWS > 0
struct Shadows {
    matrices: array<mat4x4<f32>, NUM_SHADOWS>,
    parameters: array<vec4<f32>, NUM_SHADOWS>,
    splits: array<vec4<f32>, NUM_SHADOWS>,
    lightView: array<mat2x4<f32>, NUM_SHADOWS>,
    lightProj: array<mat4x4<f32>, NUM_SHADOWS>,
}

@group(0) @binding(2) var<uniform> shadows: Shadows;

@group(1) @binding(2) var shadowAtlas: texture_depth_2d_array;
@group(1) @binding(3) var shadowSampler: sampler_comparison;

fn matrixRow(mat: mat4x4<f32>, i: i32) -> vec4<f32> {
    return vec4<f32>(mat[0][i], mat[1][i], mat[2][i], mat[3][i]);
}

fn shadowCoord(index: i32, position: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>, shadowMapTexelSize: f32) -> vec4<f32> {
    let shadowNormalOffset: f32 = shadows.parameters[index].y;
    let shadowViewProj: mat4x4<f32> = shadows.matrices[index];

    let cosLightAngle: f32 = dot(toLight, normal);
    #ifdef FEATURE_SHADOW_NORMAL_OFFSET_SLOPE_SCALE
    var normalOffsetScale: f32 = clamp(1.0 - cosLightAngle, 0.0, 1.0);
    #else
    var normalOffsetScale: f32 = 1.0;
    #endif
    normalOffsetScale *= shadowNormalOffset*shadowMapTexelSize;
    let shadowOffset: vec3<f32> = normal*normalOffsetScale;
    let shadowFragPositionWorld: vec3<f32> = position + shadowOffset;
    #ifdef FEATURE_SHADOW_NORMAL_OFFSET_UV_ONLY
    let row0: vec4<f32> = matrixRow(shadowViewProj, 0);
    let row1: vec4<f32> = matrixRow(shadowViewProj, 1);
    let row2: vec4<f32> = matrixRow(shadowViewProj, 2);
    let row3: vec4<f32> = matrixRow(shadowViewProj, 3);
    let coord: vec4<f32> = vec4<f32>(dot(row0.xyz, shadowFragPositionWorld) + row0.w,
        dot(row1.xyz, shadowFragPositionWorld) + row1.w,
        dot(row2.xyz, position) + row2.w,
        dot(row3.xyz, position) + row3.w);
    #else
    let coord: vec4<f32> = shadowViewProj*vec4<f32>(shadowFragPositionWorld, 1.0);
    #endif

    return coord;
}

fn shadowCoordOrtho(index: i32, position: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> vec3<f32> {
    let shadowBias: f32 = shadows.parameters[index].x;
    let shadowMapTexelSize: f32 = shadows.parameters[index].z;
    let coord: vec4<f32> = shadowCoord(index, position, normal, toLight, shadowMapTexelSize);
    return vec3<f32>(coord.xy, (coord.z - shadowBias));
}

fn shadowCoordPerspective(index: i32, position: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> vec3<f32> {
    let shadowBias: f32 = shadows.parameters[index].x;
    var shadowMapTexelSize: f32 = shadows.parameters[index].z;

    #ifdef FEATURE_SHADOW_NORMAL_OFFSET_SCALE_BY_SHADOW_DEPTH
    let positionLightView: vec3<f32> = quat2_transformPoint(
        Quat2(shadows.lightView[index][0], shadows.lightView[index][1]), position);
    let shadowFOVFactor: f32 = max(shadows.lightProj[index][0].x, shadows.lightProj[index][1].y);
    shadowMapTexelSize *= abs(positionLightView.z) * shadowFOVFactor;
    #endif

    let coord: vec4<f32> = shadowCoord(index, position, normal, toLight, shadowMapTexelSize);
    return vec3<f32>(coord.xy/coord.w, clamp((coord.z - shadowBias)/coord.w, 0.0, 1.0));
}

fn sampleShadowOrtho(index: i32, position: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
    let coord: vec3<f32> = shadowCoordOrtho(index, position, normal, toLight);
    return textureSampleCompare(shadowAtlas, shadowSampler, coord.xy, index, coord.z);
}

fn sampleShadowPerspective(index: i32, position: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
    let coord: vec3<f32> = shadowCoordPerspective(index, position, normal, toLight);
    return textureSampleCompare(shadowAtlas, shadowSampler, coord.xy, index, coord.z);
}

fn sampleShadowParaboloid(index: i32, position: vec3<f32>) -> f32 {
    let shadowBias: f32 = shadows.parameters[index].x;
    let shadowNear: f32 = shadows.parameters[index].z;
    let shadowFar: f32 = shadows.parameters[index].w;
    var coord: vec3<f32> = (shadows.matrices[index] * vec4<f32>(position, 1.0)).xyz;

    let dist: f32 = -coord.z;
    coord = normalize(coord);
    coord = vec3<f32>(coord.xy / 1.0 - coord.z, coord.z);
    coord = vec3<f32>(coord.xy * 0.5 + 0.5, coord.z);
    coord.z = (dist - shadowNear) / (shadowFar - shadowNear);

    return textureSampleCompare(shadowAtlas, shadowSampler, coord.xy, index, coord.z - shadowBias);
}

fn selectCascade(shadow: i32, w: f32) -> i32 {
    let count: i32 = i32(shadows.parameters[shadow].w);
    let comparison = vec4<f32>(vec4<f32>(w) > shadows.splits[shadow]);
    let findex: f32 = dot(vec4<f32>(f32(count > 0), f32(count > 1), f32(count > 2), f32(count > 3)), comparison);
    let cascade: i32 = i32(findex);
    return select(cascade, -1, cascade > (count - 1));
}
#endif
