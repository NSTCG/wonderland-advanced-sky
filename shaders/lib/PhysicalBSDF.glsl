/* Assume the clear coat is always made of polyurethane */
#define CLEAR_COAT_F0 vec3(0.04)

/*
 * Contains pre-computed data used with a Physical BSDF.
 */
struct PhysicalBSDF {
    mediump vec3 diffuse;
    mediump vec3 specular;
    mediump vec3 kD;
    mediump vec3 kDDiff;
    mediump float perceptualRoughness;

    highp float roughnessSq;
    highp float roughnessSqSq;
};

vec3 clearCoatBaseLayerUpdatedF0(vec3 f0) {
    /* Based on code from Google Filament (Apache License, Version 2.0).
     * Original source: https://github.com/google/filament
     * Modifications: none
     * Copyright 2018 Google Inc. */

    /* https://google.github.io/filament/Filament.md.html#materialsystem/clearcoatmodel
     * Approximation of newF0 = (1 - 5 * sqrt(f0))^2 / (5 - sqrt(f0))^2 */
    return clamp(f0*(f0*0.526868 + 0.529324) - 0.0482256, 0.0, 1.0);
}

mediump float clampPerceptuaRoughness(mediump float perceptualRougness) {
    /* Clamp input roughness such that r^2 and r^4 end up above fp16 positive minimum */
    return clamp(perceptualRougness, 0.089, 1.0);
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
PhysicalBSDF createPhysicalBSDF(vec3 albedo, float metallic, float roughness, float layerFactor) {
    PhysicalBSDF bsdf;
    bsdf.diffuse = (1.0 - metallic)*RECIPROCAL_PI*albedo;
    bsdf.specular = mix(vec3(0.04), albedo.rgb, metallic);
    /* Clamp input roughness such that r^2 and r^4 end up above fp16 positive minimum */
    bsdf.perceptualRoughness = clampPerceptuaRoughness(roughness);
    bsdf.roughnessSq = bsdf.perceptualRoughness*bsdf.perceptualRoughness;
    bsdf.roughnessSqSq = bsdf.roughnessSq*bsdf.roughnessSq;

    #ifdef CLEARCOAT
    /* Clear coat base layer iOR correction */
    bsdf.specular = mix(bsdf.specular, clearCoatBaseLayerUpdatedF0(bsdf.specular), layerFactor);
    #endif

    bsdf.kD = vec3(1.0) - bsdf.specular;
    bsdf.kDDiff = bsdf.kD*bsdf.diffuse;

    return bsdf;
}
/** @overload */
PhysicalBSDF createPhysicalBSDF(vec3 albedo, float metallic, float roughness) {
    return createPhysicalBSDF(albedo, metallic, roughness, 0.0);
}

#ifdef CLEARCOAT
struct ClearCoatData {
    highp vec3 normal;
    lowp float factor;
    lowp float perceptualRoughness;
};

ClearCoatData createClearCoatData(highp vec3 normal, lowp float intensity, lowp float roughness) {
    ClearCoatData data;
    data.normal = normal;
    data.factor = intensity;
    data.perceptualRoughness = clampPerceptuaRoughness(roughness);
    return data;
}
#endif

/** Assumes a f90 of `vec3(1.0)` */
mediump vec3 fresnelSchlick(mediump vec3 f0, mediump float cosTheta) {
    return f0 + (vec3(1.0) - f0)*pow(1.0 - cosTheta, 5.0);
}

mediump vec3 fresnelSchlick(inout PhysicalBSDF bsdf, mediump float cosTheta) {
    return bsdf.specular + bsdf.kD*pow(1.0 - cosTheta, 5.0);
}

mediump float distributionGGX(mediump float NdotH, float roughnessSqSq) {
    mediump float NdotH2 = NdotH*NdotH;

    mediump float denom = NdotH2*(roughnessSqSq - 1.0) + 1.0;
    /* Ensure we stay above 0 for the division next */
    denom = max(PI*denom*denom, MEDIUMP_FLT_POSMIN);

    return roughnessSqSq/denom;
}

mediump float distributionGGX(inout PhysicalBSDF bsdf, mediump float NdotH) {
    mediump float NdotH2 = NdotH*NdotH;

    mediump float denom = NdotH2*(bsdf.roughnessSqSq - 1.0) + 1.0;
    /* Ensure we stay above 0 for the division next */
    denom = max(PI*denom*denom, MEDIUMP_FLT_POSMIN);

    return bsdf.roughnessSqSq/denom;
}

mediump vec2 geometrySchlickGGX(inout PhysicalBSDF bsdf, mediump vec2 NdotX) {
    mediump float r = (bsdf.roughnessSq + 1.0);
    mediump float k = (r*r) / 8.0;

    mediump vec2 denom = NdotX*(1.0 - k) + k;
    return NdotX/denom;
}

/**
 * Geometry smith.
 * @param bsdf The precomputed PhysicalBSDF
 * @param NdotV Normal dot view direction, required to be > 0.0.
 * @param NdotL Normal dot light direction, required to be > 0.0.
 */
mediump float geometrySmith(inout PhysicalBSDF bsdf, mediump float NdotV, mediump float NdotL) {
    mediump vec2 ggx = geometrySchlickGGX(bsdf, vec2(NdotV, NdotL));
    /* "saturate" mediump to avoid Inf */
    return min(ggx.x*ggx.y, MEDIUMP_FLT_MAX);
}

/**
 * Physical BRDF computation.
 * @param bsdf The precomputed PhysicalBSDF
 * @param NdotL Normal dot light direction, required to be > 0.0.
 * @param L light vector
 * @param normal Surface normal
 * @param view View vector
 */
vec3 physicalBrdf(inout PhysicalBSDF bsdf, float NdotL, mediump vec3 L, mediump vec3 normal, mediump vec3 view) {
    mediump float NdotV = dot(normal, view);
    if(NdotV <= 0.0) {
        /* Diffuse only, no specular component.
         * FIXME: Would this surface even be visible? */
        return bsdf.kDDiff*NdotL;
    }

    mediump vec3 halfVec = normalize(view + L);
    /* We can assume HdotV is > 0, because NdotL and NdotV are > 0 */
    mediump float HdotV = dot(halfVec, view);

    /* We can assume NdotH is > 0, because NdotL and NdotV are > 0 */
    mediump float NdotH = dot(normal, halfVec);
    mediump float NDF = distributionGGX(bsdf, NdotH);

    mediump float G = geometrySmith(bsdf, NdotV, NdotL);

    mediump vec3 f = fresnelSchlick(bsdf, HdotV);

    mediump vec3 numerator = NDF*G*f;
    mediump float denominator = max(4.0*NdotV*NdotL, MEDIUMP_FLT_POSMIN);
    mediump vec3 specular = numerator/denominator;

    return (bsdf.kDDiff + specular)*NdotL;
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
vec3 evaluateDirectLights(inout PhysicalBSDF bsdf, mediump vec3 view, mediump vec3 normal) {
    vec3 col = vec3(0.0);

    /** @todo: Add support for ponctual lights clear coat */

    #if NUM_LIGHTS > 0

    for(lowp uint i = 0u; i < pointLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];
        /* dot product of mediump vec3 can be NaN for distances > 128 */
        highp vec3 lightPos = lightPositionsWorld[i];
        highp vec3 lightDirAccurate = lightPos - fragPositionWorld;
        mediump float distSq = dot(lightDirAccurate, lightDirAccurate);
        mediump float attenuation = distanceAttenuation(distSq, lightData.a);
        if(attenuation < 0.001) continue;

        mediump vec3 lightDir = lightDirAccurate*inversesqrt(distSq);
        float NdotL = dot(normal, lightDir);
        if(NdotL <= 0.0) continue;

        mediump vec3 value = physicalBrdf(bsdf, NdotL, lightDir, normal, view);

        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w) + int(dot(lightDir, lightDirectionsWorld[i]) < 0.0);
            shadow = sampleShadowParaboloid(shadowIndex, fragPositionWorld);
        }
        #endif

        col += shadow*attenuation*value*lightData.rgb;
    }

    for(lowp uint i = pointLightCount; i < pointLightCount + spotLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];
        /* dot product of mediump vec3 can be NaN for distances > 128 */
        highp vec3 lightPos = lightPositionsWorld[i];
        highp vec3 lightDirAccurate = lightPos - fragPositionWorld;
        mediump float distSq = dot(lightDirAccurate, lightDirAccurate);
        mediump float attenuation = distanceAttenuation(distSq, lightData.a);

        if(attenuation < 0.001)
            continue;

        mediump vec3 lightDir = lightDirAccurate*inversesqrt(distSq);
        float NdotL = dot(normal, lightDir);
        if(NdotL <= 0.0) continue;

        highp vec3 spotDir = lightDirectionsWorld[i];
        attenuation *= spotAttenuation(lightDir, spotDir, lightParameters[i].x, lightParameters[i].y);

        if(attenuation < 0.001)
            continue;

        mediump vec3 value = physicalBrdf(bsdf, NdotL, lightDir, normal, view);

        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w);
            shadow = sampleShadowPerspective(shadowIndex, fragPositionWorld, normal, lightDir);
        }
        #endif

        col += shadow*attenuation*value*lightData.rgb;
    }

    for(lowp uint i = pointLightCount + spotLightCount; i < pointLightCount + spotLightCount + sunLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];
        mediump vec3 lightDir = lightDirectionsWorld[i];

        float NdotL = dot(normal, lightDir);
        if(NdotL <= 0.0) continue;

        mediump vec3 value = physicalBrdf(bsdf, NdotL, lightDir, normal, view);

        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w);
            float depth = -fragPositionView.z;
            int cascade = selectCascade(shadowIndex, depth);
            if(cascade != -1)
                shadow = sampleShadowOrtho(shadowIndex + cascade, fragPositionWorld, normal, lightDir);
        }
        #endif

        col += shadow*lightData.a*value*lightData.rgb;
    }

    #endif

    return col;
}
#endif
