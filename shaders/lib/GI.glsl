/*
 * Set of functions dedicated to Global Illumination.
 *
 * Dependencies:
 *     - Textures.glsl
 *     - CoordinateSystems.glsl
 */

#define MAX_ENV_SPECULAR_MIPS (5.0 - 1.0)

#if NUM_ENV_BANDS > 0
#define GLOBAL_ENVIRONMENT_PROBE
#endif

#ifdef PROBE_VOLUME

uniform mediump sampler3D probeVolume;
uniform mediump usampler3D probeIndirection;
uniform ProbeVolumeData {
    highp vec4 probeAABB[2];
    mediump vec4 probeMetadata; /* vec4(baseVoxelSize, 0, 0, 0) */
    mediump vec4 probeTint;
};

#endif

#ifdef GLOBAL_ENVIRONMENT_PROBE

uniform Probes {
    mediump vec4 environmentSH[NUM_ENV_BANDS];
    vec3 environmentTint;
};

uniform mediump sampler2DArray specularProbeAtlas;

/**
 * Fetch the environment spherical harmonic.
 *
 * @note This is **not** pre-multiplied with the BRDF.
 *
 * @param d The normal, in **world space**
 */
vec3 environmentIrradiance(vec3 d) {
    vec3 result = environmentSH[0].rgb * (0.282095*3.141593);
    #if NUM_ENV_BANDS >= 4
    result += environmentSH[1].rgb * ((0.282095*2.094395) * d.y);
    result += environmentSH[2].rgb * ((0.282095*2.094395) * d.z);
    result += environmentSH[3].rgb * ((0.282095*2.094395) * d.x);
    #endif
    #if NUM_ENV_BANDS >= 9
    result += environmentSH[4].rgb * ((1.092548*0.785398) * (d.x*d.y));
    result += environmentSH[5].rgb * ((1.092548*0.785398) * (d.y*d.z));
    result += environmentSH[6].rgb * ((0.315392*0.785398) * (3.0*d.z*d.z - 1.0));
    result += environmentSH[7].rgb * ((1.092548*0.785398) * (d.x*d.z));
    result += environmentSH[8].rgb * ((0.546274*0.785398) * (d.x*d.x - d.y*d.y));
    #endif
    /* `environmentTint` is pre-baked in SH, no need to multiply it in the shader */
    return result;
}

/**
 * Raw prefiltered environment
 *
 * @note This is **not** pre-multiplied with the BRDF.
 *
 * Usage:
 *
 * @code{.glsl}
 * vec3 kS = EnvBRDFApprox(f0, roughness, max(dot(normal, view), 0.0));
 * vec3 color = prefilteredEnvironmentRadiance(texture, ray, roughness);
 * vec3 specular = kS*color;
 * @endcode
 *
 * @param reflected The reflected vector, in **world space**, used to fetch the environment
 * @param perceptualRoughness The perceptual roughness
 */
vec3 prefilteredEnvironmentRadiance(vec3 reflected, float perceptualRoughness) {
    float mip = perceptualRoughness * MAX_ENV_SPECULAR_MIPS;
    vec3 uvSpecular = vec3(cartesianToEquirectangular(reflected), 0.0);
    vec3 prefiltered = textureLod(specularProbeAtlas, uvSpecular, mip).rgb;
    return prefiltered*environmentTint;
}
/** @overload */
vec3 prefilteredEnvironmentRadiance(vec3 normal, vec3 view, float perceptualRoughness) {
    vec3 reflectWS = normalize(reflect(- view, normal));
    return prefilteredEnvironmentRadiance(reflectWS, perceptualRoughness);
}
#endif

mediump vec2 preIntegratedGGX(mediump float roughness, mediump float NdotV) {
    const lowp vec4 c0 = vec4(-1, -0.0275, -0.572, 0.022);
    const lowp vec4 c1 = vec4(1, 0.0425, 1.04, -0.04);
    lowp vec4 r = roughness * c0 + c1;
    lowp float a004 = min( r.x * r.x, exp2( -9.28 * NdotV ) ) * r.x + r.y;
    return vec2( -1.04, 1.04 ) * a004 + r.zw;
}

/**
 * Taken from: https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
 */
vec3 EnvBRDFApprox(vec3 specularColor, mediump float roughness, mediump float NdotV) {
    vec2 fab = preIntegratedGGX(roughness, NdotV);
    return specularColor * fab.x + fab.y;
}

/**
 * At the opposite of @ref environmentIrradiance, this method applies the Lambert brdf.
 *
 * @param d The normal, in **world space**
 */
vec3 evaluateEnvironmentIrradiance(vec3 d) {
    #ifdef GLOBAL_ENVIRONMENT_PROBE
    /** @todo: BRDF could be baked into the spherical harmonics, but then the same
     * environment isn't easily usable in a Phong shader. */
    return environmentIrradiance(d)*RECIPROCAL_PI;
    #else
    return vec3(0.0);
    #endif
}

/**
 * Evaluate the entire environment contribution, i.e., diffuse and specular.
 *
 * @note This method computes the energy conservation ratio between the diffuse
 * and specular components using @ref EnvBRDFApprox.
 *
 * @param normal The normal, in **world space**
 * @param view The view, in **world space**
 * @param diffuse Surface diffuse component
 * @param perceptualRoughness Perceptual roughness
 * @param f0 Specular f0
 * @param clearCoatRoughness Roughness of the clear coat
 * @param clearCoatFactor Factor of the clear coat
 */
vec3 evaluateEnvironment(vec3 normal, vec3 view, vec3 diffuse, float perceptualRoughness, vec3 f0) {
    #ifdef GLOBAL_ENVIRONMENT_PROBE

    mediump float NdotV = max(dot(normal, view), 0.0);

    mediump vec3 irradiance = environmentIrradiance(normal);
    mediump vec3 cosineWeightedIrradiance = irradiance*RECIPROCAL_PI;
    mediump vec3 radiance = prefilteredEnvironmentRadiance(normal, view, perceptualRoughness);

    /* Multiple scattering approximation from:
     * "A Multiple-Scattering Microfacet Model for Real-Time Image-based Lighting" */
    mediump vec2 fab = preIntegratedGGX(perceptualRoughness, NdotV);

    mediump vec3 FssEss = f0 * fab.x + fab.y;
    mediump float Ess = fab.x + fab.y;
    mediump float Ems = 1.0 - Ess;
    /* `1/21` replaced by `0.047619` */
    mediump vec3 Favg = f0 + (1.0 - f0) * 0.047619;
    /* `1 - Ess` replaced by `Ems` */
    mediump vec3 Fms = FssEss*Favg/(1.0 - Ems*Favg);
    mediump vec3 FmsEms = Fms*Ems;
    mediump vec3 Edss = vec3(1.0) - (FssEss + FmsEms);

    /* `diffuse` is already cosine-weighted */
    return FssEss*radiance + FmsEms*cosineWeightedIrradiance + diffuse*irradiance*Edss;
    #else
    return vec3(0.0);
    #endif
}

#ifdef CLEARCOAT
vec3 evaluateEnvironmentClearCoat(vec3 normal, vec3 view, vec3 diffuse, float perceptualRoughness, vec3 f0, float occlusion, ClearCoatData clearCoat) {
    #ifdef GLOBAL_ENVIRONMENT_PROBE
    vec3 contribution = evaluateEnvironment(normal, view, diffuse, perceptualRoughness, f0);
    if(clearCoat.factor > 0.0) {
        mediump float clearCoatNoV = max(dot(clearCoat.normal, view), 0.0);
        mediump vec3 fresnelClearCoat = fresnelSchlick(CLEAR_COAT_F0, clearCoatNoV) * clearCoat.factor;

        mediump vec3 kScc = EnvBRDFApprox(CLEAR_COAT_F0, clearCoat.perceptualRoughness, clearCoatNoV)
            * prefilteredEnvironmentRadiance(clearCoat.normal, view, clearCoat.perceptualRoughness);

        contribution = (vec3(1.0) - fresnelClearCoat)*contribution + clearCoat.factor*kScc;
    }
    return occlusion*contribution;
    #else
    return vec3(0.0);
    #endif
}
#endif

/** @overload */
vec3 evaluateEnvironment(vec3 normal, vec3 view, vec3 diffuse, float perceptualRoughness, vec3 f0, float occlusion) {
    vec3 contribution = evaluateEnvironment(normal, view, diffuse, perceptualRoughness, f0);
    return occlusion*contribution;
}

#ifdef PROBE_VOLUME

vec3 mainProbeVolume(vec3 position, vec3 d) {
    if(any(lessThan(position, probeAABB[0].xyz))) return vec3(0.0);
    if(any(greaterThan(position, probeAABB[1].xyz))) return vec3(0.0);
    position -= probeAABB[0].xyz;

    float irradianceBrickSizeWorld = probeMetadata.x;
    /* Read indirection based on position inside the volume */
    ivec3 index3d = ivec3(position/vec3(irradianceBrickSizeWorld));
    uvec4 posAndLod = texelFetch(probeIndirection, index3d, 0);

    /* Use indirection to retrieve the brick SH */
    float lodSizeWorld = pow(3.0, float(posAndLod.w))*irradianceBrickSizeWorld;

    /* [0..1] in the current brick space */
    vec3 offset = fract(position/lodSizeWorld);
    /* Probe location, in texel space */
    vec3 physicalLoc = vec3(4u*posAndLod.xyz) + 3.0*offset;

    vec3 physicalTexSize = vec3(textureSize(probeVolume, 0));
    vec3 channelOffset = vec3(0.0, 0.0, physicalTexSize.z/3.0);
    vec3 uvwRed = (vec3(0.5) + physicalLoc)/physicalTexSize;
    vec3 uvwGreen = (vec3(0.5) + channelOffset + physicalLoc)/physicalTexSize;
    vec3 uvwBlue = (vec3(0.5) + 2.0*channelOffset + physicalLoc)/physicalTexSize;

    vec4 rSample = texture(probeVolume, uvwRed);
    vec4 gSample = texture(probeVolume, uvwGreen);
    vec4 bSample = texture(probeVolume, uvwBlue);

    vec3 sh0 = vec3(rSample.r, gSample.r, bSample.r);
    vec3 sh1 = vec3(rSample.g, gSample.g, bSample.g);
    vec3 sh2 = vec3(rSample.b, gSample.b, bSample.b);
    vec3 sh3 = vec3(rSample.a, gSample.a, bSample.a);

    /** @todo: Use matrix for simd. */
    vec3 result = sh0 * (0.282095*3.141593);
    result += sh1 * (0.282095*2.094395) * d.y;
    result += sh2 * (0.282095*2.094395) * d.z;
    result += sh3 * (0.282095*2.094395) * d.x;

    return result;
}
#endif

vec3 evaluateProbeVolume(vec3 position, vec3 normal) {
    #ifdef PROBE_VOLUME
    vec3 irradiance = mainProbeVolume(position, normal);
    return irradiance*probeTint.rgb;
    #else
    return vec3(0.0);
    #endif
}

vec3 evaluateProbeVolume(vec3 position, vec3 normal, vec3 diffuse) {
    return diffuse*evaluateProbeVolume(position, normal);
}
