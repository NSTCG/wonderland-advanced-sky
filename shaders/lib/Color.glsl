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
mediump vec4 gradient4(mediump vec4 stop0, mediump vec4 stop1, mediump vec4 stop2, mediump vec4 stop3, highp float value) {
    highp float value2 = value * 2.0;
    mediump vec4 a = mix(stop0, stop1, value2);
    mediump vec4 b = mix(stop2, stop3, value2 - 1.0);
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
lowp vec4 linearToSrgb(mediump vec4 linear) {
    return vec4(pow(linear.rgb, vec3(1.0/2.2)), linear.a);
}

/** @overload */
lowp vec3 linearToSrgb(mediump vec3 linear) {
    return pow(linear, vec3(1.0/2.2));
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
mediump vec4 srgbToLinear(mediump vec4 srgb) {
    /* Input is mediump to avoid precision issues in pow() */
    return vec4(pow(srgb.rgb, vec3(2.2)), srgb.a);
}

/** @overload */
mediump vec3 srgbToLinear(mediump vec3 srgb) {
    return pow(srgb, vec3(2.2));
}

#ifdef TONEMAPPING_ACES
mediump vec3 ACESRRTAndODTFit(mediump vec3 v) {
    mediump vec3 a = v*(v + 0.0245786) - 0.000090537;
    mediump vec3 b = v*(0.983729*v + 0.4329510) + 0.238081;
    return a/b;
}

/* sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT */
const mediump mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
);

/* ODT_SAT => XYZ => D60_2_D65 => sRGB */
const mediump mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
);

/**
 * ACES Tonemapping, polynomial fit
 * Copyright (c) 2017, Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt.
 * Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.
 * Source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
 */
lowp vec3 tonemapACESFitted(mediump vec3 color) {
    color = ACESInputMat*color;
    color = ACESRRTAndODTFit(color);
    color = ACESOutputMat*color;
    color = clamp(color, 0.0, 1.0);
    return color;
}
#endif

#ifdef TONEMAPPING_ACES_APPROXIMATED
/**
 * ACES Tonemapping, luminance-only approximation
 * https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
 */
lowp vec3 tonemapACESFittedApproximation(mediump vec3 color) {
    const mediump float a = 2.51*(0.6*0.6);
    const mediump float b = 0.03*0.6;
    const mediump float c = 2.43*(0.6*0.6);
    const mediump float d = 0.59*0.6;
    const mediump float e = 0.14;
    return clamp((color*(a*color + b))/(color*(c*color + d) + e), 0.0, 1.0);
}
#endif

#ifdef TONEMAPPING_KHRONOS_PBR_NEUTRAL
/**
 * Khronos PBR Neutral Tone Mapper
 * Copyright (c) 2024, The Khronos Group, Inc.
 * Source: https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/pbrNeutral.glsl
 */
lowp vec3 tonemapKhronosPBRNeutral(mediump vec3 color) {
    const mediump float startCompression = 0.8 - 0.04;
    const mediump float desaturation = 0.15;

    mediump float x = min(color.r, min(color.g, color.b));
    mediump float offset = x < 0.08 ? x - 6.25*x*x : 0.04;
    color -= offset;

    mediump float peak = max(color.r, max(color.g, color.b));
    if(peak < startCompression) return color;

    const mediump float d = 1.0 - startCompression;
    mediump float newPeak = 1.0 - d*d/(peak + d - startCompression);
    color *= newPeak/peak;

    mediump float g = 1.0 - 1.0/(desaturation*(peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
}
#endif

#ifdef TONEMAPPING_REINHARD
/**
 * Reinhard et al., "Photographic tone reproduction for digital images"
 */
lowp vec3 tonemapReinhard(mediump vec3 color) {
    return color/(color + vec3(1.0));
}
#endif

#ifdef TONEMAPPING_EXPONENTIAL
/**
 * Tonemapping with an exponential curve
 */
lowp vec3 tonemapExponential(mediump vec3 color) {
    return vec3(1.0) - exp(-color);
}
#endif

lowp vec3 tonemap(mediump vec3 color) {
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
