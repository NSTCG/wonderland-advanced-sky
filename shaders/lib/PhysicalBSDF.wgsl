/* Assume the clear coat is always made of polyurethane */
#define CLEAR_COAT_F0 vec3<f32>(0.04)

/*
 * Contains pre-computed data used with a Physical BSDF.
 */
struct PhysicalBSDF {
    diffuse: vec3<f16>,
    specular: vec3<f16>,
    perceptualRoughness: f16,
    /** @todo: Pre-compute the data reused in distribution/geometry,
     * such as the roughness^2 */
};

fn clampPerceptuaRoughness(perceptualRougness: f16) -> f16 {
    /* Clamp input roughness such that r^2 and r^4 end up above fp16 positive minimum */
    return clamp(perceptualRougness, 0.089, 1.0);
}

fn clearCoatBaseLayerUpdatedF0(f0: vec3<f16>) -> vec3<f16> {
    /* Based on code from Google Filament (Apache License, Version 2.0).
     * Original source: https://github.com/google/filament
     * Modifications: none
     * Copyright 2018 Google Inc. */

    /* https://google.github.io/filament/Filament.md.html#materialsystem/clearcoatmodel
     * Approximation of newF0 = (1 - 5 * sqrt(f0))^2 / (5 - sqrt(f0))^2 */
    return clamp(f0*(f0*0.526868 + 0.529324) - 0.0482256, vec3<f16>(0.0), vec3<f16>(1.0));
}

/**
 * Create the BSDF data used with physical lighting equations
 *
 * @param albedo Surface albedo. Shouldn't be premultiplied
 *     by (1 - reflectivty)
 * @param metallic Surface metallic, in [0; 1]
 * @param roughness Surface **perceptual** roughness, in [0; 1]
 * @returns A structure containing BSDF pre-computed data
 */
fn createPhysicalBSDF(albedo: vec3<f32>, metallic: f32, roughness: f32, layerFactor: f16) -> PhysicalBSDF {
    var data: PhysicalBSDF;
    data.diffuse = (1.0 - metallic)*RECIPROCAL_PI*albedo;
    data.specular = mix(vec3<f32>(0.04), albedo.rgb, metallic);
    data.perceptualRoughness = clampPerceptuaRoughness(roughness);

    #ifdef CLEARCOAT
    /* Clear coat base layer iOR correction */
    data.specular = mix(data.specular, clearCoatBaseLayerUpdatedF0(data.specular), layerFactor);
    #endif

    return data;
}

#ifdef CLEARCOAT
struct ClearCoatData {
    normal: vec3<f32>,
    perceptualRoughness: f16,
    factor: f8,
};

fn createClearCoatData(normal: vec3<f32>, intensity: f8, roughness: f16) -> ClearCoatData {
    var data: ClearCoatData;
    data.normal = normal;
    data.factor = intensity;
    data.perceptualRoughness = clampPerceptuaRoughness(roughness);
    return data;
}
#endif

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (vec3<f32>(1.0) - F0)*pow(1.0 - cosTheta, 5.0);
}

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a: f32 = roughness*roughness;
    let a2: f32 = a*a;
    let NdotH: f32 = max(dot(N, H), 0.0);
    let NdotH2: f32 = NdotH*NdotH;

    let num: f32 = a2;
    var denom: f32 = (NdotH2*(a2 - 1.0) + 1.0);
    denom = PI*denom*denom;

    return num/denom;
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let a: f32 = roughness*roughness;
    let r: f32 = (a + 1.0);
    let k: f32 = (r*r) / 8.0;

    let num: f32 = NdotV;
    let denom: f32 = NdotV*(1.0 - k) + k;

    return num/denom;
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV: f32 = max(dot(N, V), 0.0);
    let NdotL: f32 = max(dot(N, L), 0.0);
    let ggx2: f32 = geometrySchlickGGX(NdotV, roughness);
    let ggx1: f32 = geometrySchlickGGX(NdotL, roughness);

    return ggx1*ggx2;
}

fn physicalBrdf(bsdf: PhysicalBSDF , L: vec3<f16>, normal: vec3<f16>, view: vec3<f16>) -> vec3<f32> {
    let halfVec: vec3<f32> = normalize(view + L);

    let NDF: f32 = distributionGGX(normal, halfVec, bsdf.perceptualRoughness);
    let G: f32 = geometrySmith(normal, view, L, bsdf.perceptualRoughness);
    let f: vec3<f32> = fresnelSchlick(max(dot(halfVec, view), 0.0), bsdf.specular);

    let kD: vec3<f32> = (vec3<f32>(1.0) - f);

    let numerator: vec3<f32> = NDF*G*f;
    let NdotL: f32 = max(dot(normal, L), 0.0);
    let denominator: f32 = 4.0*max(dot(normal, view), 0.0)*NdotL;
    let specular: vec3<f32> = numerator/max(denominator, 0.001);

    return (kD*bsdf.diffuse + specular)*NdotL;
}

#ifdef USE_LIGHTS
/**
 * Evaluate the diffuse and specular contributions of ponctual lights
 *
 * @param bsdf BSDF data, created via @ref createPhysicalBSDF()
 * @param view The view vector, in **world space**
 * @param normal The normal vector, in **world space**
 * @returns The diffuse and specular contribution
 */
fn evaluateDirectLights(bsdf: PhysicalBSDF, view: vec3<f16>, normal: vec3<f16>, positionWorld: vec3<f32>) -> vec3<f32> {
    var col: vec3<f32> = vec3<f32>(0.0);

    #if NUM_LIGHTS > 0

    var i: u8 = 0u;
    for(; i < pointLightCount; i++) {
        let lightData: vec4<f16> = lights.colors[i];
        /* dot product of mediump vec3 can be NaN for distances > 128 */
        let lightPos: vec3<f32> = lights.positionsWorld[i];
        let lightDirAccurate: vec3<f32> = lightPos - positionWorld;
        let distSq: f32 = dot(lightDirAccurate, lightDirAccurate);
        let attenuation: f32 = distanceAttenuation(distSq, lightData.a);
        // if(attenuation < 0.001) {
        //     continue;
        // }

        var lightDir: vec3<f16> = lightDirAccurate;
        lightDir *= inversesqrt(distSq);

        let value: vec3<f16> = physicalBrdf(bsdf, lightDir, normal, view);

        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w) + i32(dot(lightDir, lights.directionsWorld[i]) < 0.0);
            shadow = sampleShadowParaboloid(shadowIndex, positionWorld);
        }
        #endif

        col += shadow*attenuation*value*lightData.rgb;
    }

    let endSpotLights: u8 = numPointLights + spotLightCount;
    for(; i < endSpotLights; i++) {
        let lightData: vec4<f16> = lights.colors[i];
        /* dot product of mediump vec3 can be NaN for distances > 128 */
        let lightPos: vec3<f32> = lights.positionsWorld[i];
        let lightDirAccurate: vec3<f32> = lightPos - positionWorld;
        let distSq: f16 = dot(lightDirAccurate, lightDirAccurate);
        var attenuation: f16 = distanceAttenuation(distSq, lightData.a);

        // if(attenuation < 0.001) {
        //     continue;
        // }

        var lightDir: vec3<f16> = lightDirAccurate;
        lightDir *= inversesqrt(distSq);

        let spotDir: vec3<f32> = lights.directionsWorld[i];
        attenuation *= spotAttenuation(lightDir, spotDir, lights.parameters[i].x, lights.parameters[i].y);

        // if(attenuation < 0.001) {
        //     continue;
        // }

        let value: vec3<f16> = physicalBrdf(bsdf, lightDir, normal, view);

        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w);
            shadow = sampleShadowPerspective(shadowIndex, positionWorld, normal, lightDir);
        }
        #endif

        col += shadow*attenuation*value*lightData.rgb;
    }

    let endSunLights: u8 = numPointLights + spotLightCount + sunLightCount;
    for(; i < endSunLights; i++) {
        let lightData: vec4<f16> = lights.colors[i];

        let lightDir: vec3<f32> = lights.directionsWorld[i];
        let value: vec3<f16> = physicalBrdf(bsdf, lightDir, normal, view);

        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w);
            let depth: f32 = -view.z;
            let cascade: i32 = selectCascade(shadowIndex, depth);
            shadow = sampleShadowOrtho(shadowIndex + cascade, positionWorld, normal, lightDir);
        }
        #endif

        col += shadow*lightData.a*value*lightData.rgb;
    }

    #endif

    return col;
}
#endif
