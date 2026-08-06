/*
 * Set of functions you can reuse to work on colors.
 */

/**
 * Create a gradient between four colors
 *
 * @param stop0 The color of the first stop point
 * @param stop1 The color of the second stop point
 * @param stop2 The color of the third stop point
 * @param stop3 The color of the fourth stop point
 *
 * This method assumes the stops are linear and spaced uniformly.
 */
fn gradient4(stop0: vec4<f16>, stop1: vec4<f16>, stop2: vec4<f16>, stop3: vec4<f16>, value: f32) -> vec4<f16> {
    let value2: f32 = value * 2.0;
    let a: vec4<f16> = mix(stop0, stop1, value2);
    let b: vec4<f16> = mix(stop2, stop3, value2 - 1.0);
    return mix(a, b, smoothstep(0.495, 0.505, value));
}

/**
 * Apply the sRGB transfer function to a linear RGB color
 *
 * @param linear Linear RGB color
 * @returns Non-linear sRGB color
 *
 * Uses a 2.2 gamma curve as a fast approximation for the sRGB EOTF. Alpha is
 * unaffected.
 */
fn linearToSrgb4(linear: vec4<f16>) -> vec4<f8> {
    return vec4<f8>(pow(linear.rgb, vec3<f16>(1.0/2.2)), linear.a);
}

/** @overload */
fn linearToSrgb3(linear: vec3<f16>) -> vec3<f8> {
    return pow(linear, vec3<f8>(1.0/2.2));
}

/**
 * Apply the inverse sRGB transfer function to get a linear RGB color
 *
 * @param srgb Non-linear sRGB color
 * @returns Linear RGB color
 *
 * Uses a 2.2 gamma curve as a fast approximation for the sRGB EOTF. Alpha is
 * unaffected.
 */
fn srgbToLinear4(srgb: vec4<f16>) -> vec4<f16> {
    /* Input is mediump to avoid precision issues in pow() */
    return vec4<f16>(pow(srgb.rgb, vec3<f16>(2.2)), srgb.a);
}

/** @overload */
fn srgbToLinear3(srgb: vec3<f16>) -> vec3<f16> {
    return pow(srgb, vec3<f16>(2.2));
}

#ifdef TONEMAPPING_ACES
fn ACESRRTAndODTFit(v: vec3<f16>) -> vec3<f16> {
    let a: vec3<f16> = v*(v + 0.0245786) - 0.000090537;
    let b: vec3<f16> = v*(0.983729*v + 0.4329510) + 0.238081;
    return a/b;
}

/* sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT */
const ACESInputMat = mat3x3<f16>(
    vec3<f16>(0.59719, 0.07600, 0.02840),
    vec3<f16>(0.35458, 0.90834, 0.13383),
    vec3<f16>(0.04823, 0.01566, 0.83777)
);

/* ODT_SAT => XYZ => D60_2_D65 => sRGB */
const ACESOutputMat = mat3x3<f16>(
    vec3<f16>( 1.60475, -0.10208, -0.00327),
    vec3<f16>(-0.53108,  1.10813, -0.07276),
    vec3<f16>(-0.07367, -0.00605,  1.07602)
);

/**
 * ACES Tonemapping, polynomial fit
 * Copyright (c) 2017, Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt.
 * Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.
 * Source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
 */
fn tonemapACESFitted(value: vec3<f16>) -> vec3<f8> {
    var color = ACESInputMat*value;
    color = ACESRRTAndODTFit(color);
    color = ACESOutputMat*color;
    color = clamp(color, vec3<f16>(0.0), vec3<f16>(1.0));
    return color;
}
#endif

#ifdef TONEMAPPING_ACES_APPROXIMATED
/**
 * ACES Tonemapping, luminance-only approximation
 * https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
 */

/* Naga doesn't like const at function scope */
const ACESa: f16 = 2.51*(0.6*0.6);
const ACESb: vec3<f16> = vec3<f16>(0.03*0.6);
const ACESc: f16 = 2.43*(0.6*0.6);
const ACESd: vec3<f16> = vec3<f16>(0.59*0.6);
const ACESe: vec3<f16> = vec3<f16>(0.14);

fn tonemapACESFittedApproximation(color: vec3<f16>) -> vec3<f8> {
    return clamp((color*(ACESa*color + ACESb))/(color*(ACESc*color + ACESd) + ACESe), vec3<f16>(0.0), vec3<f16>(1.0));
}
#endif

#ifdef TONEMAPPING_KHRONOS_PBR_NEUTRAL
/**
 * Khronos PBR Neutral Tone Mapper
 * Copyright (c) 2024, The Khronos Group, Inc.
 * Source: https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/pbrNeutral.glsl
 */
const KPBRStartCompression: f16 = 0.8 - 0.04;
const KPBRDesaturation: f16 = 0.15;
const KPBRd: f16 = 1.0 - KPBRStartCompression;

fn tonemapKhronosPBRNeutral(color: vec3<f16>) -> vec3<f8> {
    let x: f16 = min(color.r, min(color.g, color.b));
    var offset: f16;
    if(x < 0.08) {
        offset = x - 6.25*x*x;
    } else {
        offset = 0.04;
    }
    var out = color;
    out -= offset;

    let peak: f16 = max(out.r, max(out.g, out.b));
    if(peak < KPBRStartCompression) {
        return out;
    }

    let newPeak: f16 = 1.0 - KPBRd*KPBRd/(peak + KPBRd - KPBRStartCompression);
    out *= newPeak/peak;

    let g: f16 = 1.0 - 1.0/(KPBRDesaturation*(peak - newPeak) + 1.0);
    return mix(out, vec3<f32>(newPeak), g);
}
#endif

#ifdef TONEMAPPING_REINHARD
/**
 * Reinhard et al., "Photographic tone reproduction for digital images"
 */
fn tonemapReinhard(color: vec3<f16>) -> vec3<f8> {
    return color/(color + vec3<f8>(1.0));
}
#endif

#ifdef TONEMAPPING_EXPONENTIAL
/**
 * Tonemapping with an exponential curve
 */
fn tonemapExponential(color: vec3<f16>) -> vec3<f8> {
    return vec3<f8>(1.0) - exp(-color);
}
#endif

fn tonemap(color: vec3<f16>) -> vec3<f8> {
    #if defined(TONEMAPPING_ACES)
    return tonemapACESFitted(color);
    #elif defined(TONEMAPPING_ACES_APPROXIMATED)
    return tonemapACESFittedApproximation(color);
    #elif defined(TONEMAPPING_KHRONOS_PBR_NEUTRAL)
    return tonemapKhronosPBRNeutral(color);
    #elif defined(TONEMAPPING_REINHARD)
    return tonemapReinhard(color);
    #elif defined(TONEMAPPING_EXPONENTIAL)
    return tonemapExponential(color);
    #else
    return color;
    #endif
}
