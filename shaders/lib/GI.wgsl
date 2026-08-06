/*
 * Set of functions dedicated to Global Illumination (WGSL)
 */

#include "lib/SkyProcedural.wgsl"

#ifdef PROBE_VOLUME

struct ProbeVolume {
    probeAABB: array<vec4f, 2>,
    probeMetadata: vec4f,
    probeTint: vec4f,
};
@group(0) @binding(12) var<uniform> probeVolume: ProbeVolume;
@group(0) @binding(13) var probeIndirection: texture_3d<u8>;
@group(0) @binding(14) var probeVolumeTexture: texture_3d<f16>;
@group(0) @binding(15) var linearSampler3D: sampler;

#endif

#ifdef GLOBAL_ENVIRONMENT_PROBE

#define MAX_ENV_SPECULAR_MIPS (5.0 - 1.0)

struct EnvironmentProbe {
    sh: array<vec4f, NUM_ENV_BANDS>,
    tint: vec3<f32>,
};
@group(0) @binding(16) var<uniform> environmentProbe: EnvironmentProbe;
@group(0) @binding(17) var specularProbeAtlas: texture_2d_array<f16>;
@group(0) @binding(18) var reflectionProbeSampler: sampler;

fn environmentIrradiance(d: vec3<f32>) -> vec3<f32> {
    var result: vec3<f32> = environmentProbe.sh[0].rgb * (0.282095*3.141593);
    #if NUM_ENV_BANDS >= 4
    result += environmentProbe.sh[1].rgb * ((0.282095*2.094395) * d.y);
    result += environmentProbe.sh[2].rgb * ((0.282095*2.094395) * d.z);
    result += environmentProbe.sh[3].rgb * ((0.282095*2.094395) * d.x);
    #endif
    #if NUM_ENV_BANDS >= 9
    result += environmentProbe.sh[4].rgb * ((1.092548*0.785398) * (d.x*d.y));
    result += environmentProbe.sh[5].rgb * ((1.092548*0.785398) * (d.y*d.z));
    result += environmentProbe.sh[6].rgb * ((0.315392*0.785398) * (3.0*d.z*d.z - 1.0));
    result += environmentProbe.sh[7].rgb * ((1.092548*0.785398) * (d.x*d.z));
    result += environmentProbe.sh[8].rgb * ((0.546274*0.785398) * (d.x*d.x - d.y*d.y));
    #endif
    return result;
}

fn preIntegratedGGX(roughness: f16, NdotV: f16) -> vec2<f16> {
    let c0: vec4<f16> = vec4<f16>(-1, -0.0275, -0.572, 0.022);
    let c1: vec4<f16> = vec4<f16>(1, 0.0425, 1.04, -0.04);
    let r: vec4<f16> = roughness * c0 + c1;
    let a004: f16 = min( r.x * r.x, exp2( -9.28 * NdotV ) ) * r.x + r.y;
    return vec2( -1.04, 1.04 ) * a004 + r.zw;
}
fn EnvBRDFApprox(specularColor: vec3<f32>, roughness: f16, NdotV: f16) -> vec3<f32> {
    let fab: vec2<f16> = preIntegratedGGX(roughness, NdotV);
    return specularColor*fab.x + fab.y;
}

fn prefilteredEnvironmentRadiance(reflected: vec3<f32>, perceptualRoughness: f32) -> vec3<f32> {
    let mip: f32 = perceptualRoughness * MAX_ENV_SPECULAR_MIPS;
    let uvSpecular: vec2<f32> = cartesianToEquirectangular(reflected);
    let prefiltered: vec3<f32> = textureSampleLevel(specularProbeAtlas, reflectionProbeSampler, uvSpecular, 0u, mip).rgb;
    return prefiltered*environmentProbe.tint;
}
#else
fn preIntegratedGGX(roughness: f16, NdotV: f16) -> vec2<f16> {
    let c0: vec4<f16> = vec4<f16>(-1, -0.0275, -0.572, 0.022);
    let c1: vec4<f16> = vec4<f16>(1, 0.0425, 1.04, -0.04);
    let r: vec4<f16> = roughness * c0 + c1;
    let a004: f16 = min( r.x * r.x, exp2( -9.28 * NdotV ) ) * r.x + r.y;
    return vec2( -1.04, 1.04 ) * a004 + r.zw;
}
fn EnvBRDFApprox(specularColor: vec3<f32>, roughness: f16, NdotV: f16) -> vec3<f32> {
    let fab: vec2<f16> = preIntegratedGGX(roughness, NdotV);
    return specularColor*fab.x + fab.y;
}
#endif

fn evaluateEnvironmentBaseLayer(normal: vec3<f32>, view: vec3<f32>, diffuse: vec3<f32>, perceptualRoughness: f16, f0: vec3<f32>) -> vec3<f32> {
    #ifdef GLOBAL_ENVIRONMENT_PROBE
    let NdotV: f16 = max(dot(normal, view), 0.0);
    let reflectWS: vec3<f32> = normalize(reflect(-view, normal));
    let irradiance: vec3<f16> = environmentIrradiance(normal);
    let cosineWeightedIrradiance: vec3<f16> = irradiance*RECIPROCAL_PI;
    let radiance: vec3<f16> = prefilteredEnvironmentRadiance(reflectWS, perceptualRoughness);
    let fab: vec2<f16> = preIntegratedGGX(perceptualRoughness, NdotV);
    let FssEss: vec3<f16> = f0 * fab.x + fab.y;
    let Ess: f16 = fab.x + fab.y;
    let Ems: f16 = 1.0 - Ess;
    let Favg: vec3<f16> = f0 + (1.0 - f0)*0.047619;
    let Fms: vec3<f16> = FssEss*Favg/(1.0 - Ems*Favg);
    let FmsEms: vec3<f16> = Fms*Ems;
    let Edss: vec3<f16> = vec3(1.0) - (FssEss + FmsEms);
    return FssEss*radiance + FmsEms*cosineWeightedIrradiance + diffuse*irradiance*Edss;
    #else
    var lightPos = vec3<f32>(0.0, 1.0, 0.5);
    var lightDir = vec3<f32>(0.0, 1.0, 0.0);
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

    let reflectWS = normalize(reflect(-view, normal));
    let dynamicRadiance = evaluateAtmosphericSkyFast(reflectWS, lightDir, lightCol, isNight, animTime);
    let dynamicIrradiance = evaluateAtmosphericSkyFast(normal, lightDir, lightCol, isNight, animTime);

    let NdotV: f16 = max(dot(normal, view), 0.0);
    let FssEss = EnvBRDFApprox(f0, perceptualRoughness, NdotV);

    return FssEss * dynamicRadiance + (vec3<f32>(1.0) - FssEss) * diffuse * dynamicIrradiance * RECIPROCAL_PI;
    #endif
}

fn evaluateEnvironment(normal: vec3<f32>, view: vec3<f32>, diffuse: vec3<f32>, perceptualRoughness: f16, f0: vec3<f32>, occlusion: f16) -> vec3<f32> {
    return evaluateEnvironmentBaseLayer(normal, view, diffuse, perceptualRoughness, f0)*occlusion;
}

#ifdef CLEARCOAT
fn evaluateEnvironmentClearCoat(normal: vec3<f32>, view: vec3<f32>, diffuse: vec3<f32>, perceptualRoughness: f16, f0: vec3<f32>, occlusion: f16,
    clearCoat: ClearCoatData) -> vec3<f32> {
    var contribution: vec3<f32> = evaluateEnvironmentBaseLayer(normal, view, diffuse, perceptualRoughness, f0);
    if(clearCoat.factor > 0.0) {
        let clearCoatNoV: f16 = max(dot(clearCoat.normal, view), 0.0);
        let reflectWS: vec3<f32> = normalize(reflect(-view, clearCoat.normal));
        let fresnelClearCoat: vec3<f16> = fresnelSchlick(clearCoatNoV, CLEAR_COAT_F0)*clearCoat.factor;

        var lightPos = vec3<f32>(0.0, 1.0, 0.5);
        var lightDir = vec3<f32>(0.0, 1.0, 0.0);
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
        let skyReflect = evaluateAtmosphericSkyFast(reflectWS, lightDir, lightCol, isNight, animTime);
        let kScc: vec3<f16> = EnvBRDFApprox(CLEAR_COAT_F0, clearCoat.perceptualRoughness, clearCoatNoV) * skyReflect;
        contribution = (vec3(1.0) - fresnelClearCoat)*contribution + clearCoat.factor*kScc;
    }
    return occlusion*contribution;
}
#endif

fn evaluateEnvironmentIrradiance(d: vec3<f32>) -> vec3<f32> {
    #ifdef GLOBAL_ENVIRONMENT_PROBE
    return environmentIrradiance(d)*RECIPROCAL_PI;
    #else
    var lightPos = vec3<f32>(0.0, 1.0, 0.5);
    var lightDir = vec3<f32>(0.0, 1.0, 0.0);
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
    return evaluateAtmosphericSkyFast(d, lightDir, lightCol, isNight, animTime) * RECIPROCAL_PI;
    #endif
}

#ifdef PROBE_VOLUME

fn mainProbeVolume(worldPos: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    if(any(worldPos < probeVolume.probeAABB[0].xyz)) {
        return vec3(0.0);
    }
    if(any(worldPos > probeVolume.probeAABB[1].xyz)) {
        return vec3(0.0);
    }
    let position: vec3<f32> = worldPos - probeVolume.probeAABB[0].xyz;

    let irradianceBrickSizeWorld: f32 = probeVolume.probeMetadata.x;
    let index3d: vec3<i32> = vec3<i32>(position/vec3(irradianceBrickSizeWorld));
    let posAndLod: vec4<u8> = textureLoad(probeIndirection, index3d, 0);

    let lodSizeWorld: f32 = pow(3.0, f32(posAndLod.w))*irradianceBrickSizeWorld;

    let offset: vec3<f32> = fract(position/lodSizeWorld);
    let physicalLoc: vec3<f32> = vec3<f32>(4u*posAndLod.xyz) + 3.0*offset;

    let physicalTexSize: vec3<f32> = vec3<f32>(textureDimensions(probeVolumeTexture, 0));
    let channelOffset: vec3<f32> = vec3(0.0, 0.0, physicalTexSize.z/3.0);
    let uvwRed: vec3<f32> = (vec3(0.5) + physicalLoc)/physicalTexSize;
    let uvwGreen: vec3<f32> = (vec3(0.5) + channelOffset + physicalLoc)/physicalTexSize;
    let uvwBlue: vec3<f32> = (vec3(0.5) + 2.0*channelOffset + physicalLoc)/physicalTexSize;

    let rSample: vec4<f16> = textureSample(probeVolumeTexture, linearSampler3D, uvwRed);
    let gSample: vec4<f16> = textureSample(probeVolumeTexture, linearSampler3D, uvwGreen);
    let bSample: vec4<f16> = textureSample(probeVolumeTexture, linearSampler3D, uvwBlue);

    let sh0: vec3<f16> = vec3<f16>(rSample.r, gSample.r, bSample.r);
    let sh1: vec3<f16> = vec3<f16>(rSample.g, gSample.g, bSample.g);
    let sh2: vec3<f16> = vec3<f16>(rSample.b, gSample.b, bSample.b);
    let sh3: vec3<f16> = vec3<f16>(rSample.a, gSample.a, bSample.a);

    var result: vec3<f32> = sh0 * (0.282095*3.141593);
    result += sh1 * (0.282095*2.094395) * d.y;
    result += sh2 * (0.282095*2.094395) * d.z;
    result += sh3 * (0.282095*2.094395) * d.x;

    return result;
}
#endif

fn evaluateProbeVolume(position: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    #ifdef PROBE_VOLUME
    let irradiance: vec3<f32> = mainProbeVolume(position, normal);
    return irradiance*probeVolume.probeTint.rgb;
    #else
    return vec3<f32>(0.0);
    #endif
}
