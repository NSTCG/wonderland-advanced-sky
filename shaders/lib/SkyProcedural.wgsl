/**
 * References:
 *     - https://github.com/mrdoob/three.js/blob/master/examples/jsm/objects/Sky.js
 *     - "A Practical Analytic Model for Daylight", Preetham, A. J., Shirley, P., and Smits, B.
 *     - "An Analytic Model for Full Spectral Sky-Dome Radiance", Hosek, L., and Wilkie, A.
 *     - "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", Hillaire, S.
 */

/* 3.0 / (16.0*PI) */
#define THREE_OVER_SIXTEENPI 0.05968310365946075
/* 1.0 / (4.0 * PI) */
#define RECIPROCAL_PI4 0.07957747154594767
#define HORIZON_CUTOFF vec3(0.3, 0.3, 0.3)

/**
 * Input for @ref evaluateAthmosphericSky()
 */
struct AtmosphericParams {
    turbidity: f16,
    rayleigh: f16,
    mieCoefficient: f16,
    mieDirectionalG: f16,
};

/*
 * @todo: Pass the entire Rayleigh coefficient as a uniform.
 *
 * Pre-calculation of the total Rayleigh scattering coefficients Beta_r variable:
 *
 * (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
 *
 * - n: Air refractive index (1.0003)
 * - N: Number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius) (2.545e25)
 * - Lambda: Wavelength of used primaries, according to preetham vec3( 680E-9, 550E-9, 450E-9 )
 *
 * From: "A Practical Analytic Model for Dayligh", page 98
 */
const PrecomputedBetaR: vec3<f32> = vec3<f32>(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);

/**
 * @todo: Pass the entire Mie coefficient as a uniform.
 *
 * Pre-calculation of part of the total Mie scattering coefficient:
 * pi * pow((2.0 * pi) / lambda, vec3(v - 2.0)) * K
 *
 * - lambda: Wavelength
 * - v: Junge's exponent (4)
 * - K: coefficient for the primaries vec3(0.686, 0.678, 0.666)
 */
const PrecomputedBetaM: vec3<f32> = vec3<f32>(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);

/**
 * Compute the Mie total scattering coefficient as described in:
 * "A Practical Analytic Model for Dayligh", page 98
 *
 * , with "turbidity" the measure of haze.
 * Example: with 1 being pure air, and ~64 thin fog.
 *
 * @param T The turbidity
 */
fn totalMieScattering(T: f32) -> vec3<f32> {
    let c: f32 = 0.2*T*10E-18;
    return 0.434*c*PrecomputedBetaM;
}

/**
 * Rayleigh phase function
 *
 * 3 / 16π * (1 + cos(θ)^2)
 *
 * References:
 *     - From "An Analytic Model for Full Spectral Sky-Dome Radiance", page 3.
 *
 * @param cosTheta Cosinus of the angle between the (in/out)-scattering directions
 */
fn rayleighPhase(cosTheta: f16) -> f32 {
    let cosTheta2: f16 = cosTheta*cosTheta;
    return THREE_OVER_SIXTEENPI*(1.0 + cosTheta2);
}

/**
 * Mie-scattering phase, also known as haze "aerosol" scattering,
 * approximated by the Henyey-Greenstein phase function.
 *
 *
 *                   1 - g^2
 * -------------------------------------------
 *        4*PI*(1 + g^2 - 2g*cos(θ))^1.5
 *
 * References:
 *     - https://pbr-book.org/3ed-2018/Volume_Scattering/Phase_Functions
 *
 * @param cosTheta Cosinus of the angle between the (in/out)-scattering directions
 */
fn hgPhase(cosTheta: f16, g: f16) -> f16 {
    let g2: f16 = g*g;
    let inverse: f16 = 1.0/pow(1.0 - 2.0*g*cosTheta + g2, 1.5);
    return RECIPROCAL_PI4*((1.0 - g2)*inverse);
}

/* Naga doesn't like const at function scope */
/** Uniforms. @todo: Expose */
const SkyAmbient: vec3<f16> = vec3(0.0, 0.0003, 0.00075);

const SkyRayleighZenithLength: f32 = 8.4E3;
const SkyMieZenithLength: f32 = 1.25E3;

const SkyEE: f16 = 1000.0; /* Maximum luminance at zenith */
const SkyCutoffAngle: f16 = 1.6110731556870734; /* Earth shadow hack: PI / 1.95 */
const SkySteepness: f16 = 1.5;

/**
 * Analytical computation of the sky
 *
 * @param direction The view direction
 * @param sunDirection Direction toward the sun
 * @param params Set of params to feed to the Preetham model
 */
fn evaluateAthmosphericSky(direction: vec3<f32>, sunDirection: vec3<f32>, params: AtmosphericParams) -> vec3<f32> {
    let sunCosAngle: f16 = dot(sunDirection, vec3<f32>(0.0, 1.0, 0.0));

    /*
     * Optical mass `m`, from "A Practical Analytic Model for Dayligh", page 98:
     *
     *                        1
     * ____________________________________________________________
     * cos(theta_s) + 0.15 * (93.885 - theta_s * 180.0/PI)^(-1.253)
     */
    let zenithAngleCos: f16 = max(0.0, dot(direction, vec3(0.0, 1.0, 0.0)));
    let opticalMass: f16 = 1.0/(zenithAngleCos + 0.15 * pow(93.885 - ((acos(zenithAngleCos)*180.0)/PI), -1.253));

    /* Extinction factor from both types of particles */

    /* Rayleigh coefficient */
    /** @todo: Should be pre-computed as well and passed as a uniform */
    let beta_r: vec3<f32> = PrecomputedBetaR*params.rayleigh;
    /* Mie coefficient */
    /** @todo: Should be pre-computed as well and passed as a uniform */
    let beta_m: vec3<f32> = totalMieScattering(params.turbidity)*params.mieCoefficient;

    let tau: vec3<f32> = exp(-SkyRayleighZenithLength*opticalMass*beta_r - SkyMieZenithLength*opticalMass*beta_m);

    /* `cosTheta` must be a highp for the sun disk equation */
    let cosTheta: f32 = dot(direction, sunDirection);

    /* Sun luminance */
    let luminance: f16 = SkyEE*max(0.0, 1.0 - exp(-(SkyCutoffAngle - acos(sunCosAngle))/SkySteepness));

    /* Direct sun light: Visual sun disk */

    /* Transmittance on disk "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", page 27 */
    /* cos(0.03), 0.03 being the angular diameter */
    let L0: vec3<f32> = smoothstep(-0.01, 0.1, direction.y)* /* Hide disk below horizon line */
        smoothstep(0.99955, 0.99955 + 0.0003, cosTheta)*
        luminance*SkyEE*tau;

    /* In-scattering term */

    let rPhase: f16 = rayleighPhase(cosTheta*0.5 + 0.5); /* Remap cosTheta to prevent back scattering */
    let mPhase: f16 = hgPhase(cosTheta, params.mieDirectionalG);

    let light: vec3<f32> = luminance*(beta_r*rPhase + beta_m*mPhase)/(beta_r + beta_m);

    var Lin: vec3<f32> = pow(light*(1.0 - tau), vec3(1.5));
    Lin *= mix(vec3(1.0), pow(light*tau, vec3(0.5)), clamp(pow(1.0 - sunCosAngle, 5.0), 0.0, 1.0));

    #ifdef HORIZON_CUTOFF
    let horizon: f16 = smoothstep(-0.05, 0.0, dot(direction, vec3(0.0, 1.0, 0.0)));
    Lin *= mix(HORIZON_CUTOFF, vec3(1.0), horizon);
    #endif

    /* `0.04` to apply a default exposure to the in-scattering term to avoid extremely bright environment */
    return SkyAmbient + L0 + Lin*0.04;
}
