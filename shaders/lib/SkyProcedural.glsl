/**
 * Ultra-Stylized Sky Procedural Library (GLSL)
 */

#ifndef SKY_PROCEDURAL_GLSL
#define SKY_PROCEDURAL_GLSL

/* Noise & Hash Utilities */
float skyHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float skyNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = skyHash12(i);
    float b = skyHash12(i + vec2(1.0, 0.0));
    float c = skyHash12(i + vec2(0.0, 1.0));
    float d = skyHash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float skyFbm2D(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; ++i) {
        v += a * skyNoise2D(p);
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

/**
 * Fast dynamic sky evaluation for environment reflection & ambient lighting
 */
vec3 evaluateAtmosphericSkyFast(vec3 viewDir, vec3 lightDir, vec3 lightColor, float isNight, float animTime) {
    vec3 vDir = length(viewDir) > 0.001 ? normalize(viewDir) : vec3(0.0, 1.0, 0.0);
    vec3 lDir = length(lightDir) > 0.001 ? normalize(lightDir) : vec3(0.0, 1.0, 0.0);

    float y = clamp(vDir.y, 0.0001, 1.0);
    float sunCos = clamp(dot(lDir, vec3(0.0, 1.0, 0.0)), -1.0, 1.0);

    vec3 skyZenith;
    vec3 skyHorizon;

    if (isNight < 0.5) {
        // DAY
        if (sunCos < 0.25) {
            // Sunset / Sunrise
            float t = clamp(sunCos / 0.25, 0.0, 1.0);
            skyZenith = mix(vec3(0.12, 0.08, 0.32), vec3(0.08, 0.35, 0.85), t);
            skyHorizon = mix(vec3(1.0, 0.32, 0.10), vec3(0.45, 0.75, 0.98), t);
        } else {
            // Bright Day
            skyZenith = vec3(0.08, 0.35, 0.85);
            skyHorizon = vec3(0.45, 0.75, 0.98);
        }
    } else {
        // NIGHT
        skyZenith = vec3(0.02, 0.04, 0.14);
        skyHorizon = vec3(0.08, 0.14, 0.35);
    }

    vec3 color = mix(skyHorizon, skyZenith, pow(y, 0.7));
    return color * lightColor;
}

/**
 * Full Ultra-Stylized Sky Shader evaluation
 */
vec3 evaluateUltraStylizedSky(
    vec3 viewDir,
    vec3 lightDir,
    vec3 lightColor,
    float isNight,
    float animTime
) {
    vec3 dir = length(viewDir) > 0.001 ? normalize(viewDir) : vec3(0.0, 1.0, 0.0);
    vec3 lDir = length(lightDir) > 0.001 ? normalize(lightDir) : vec3(0.0, 1.0, 0.0);

    float viewY = clamp(dir.y, -0.1, 1.0);
    float skyHeight = clamp(max(0.0001, viewY), 0.0001, 1.0);

    float sunCosZenith = clamp(dot(lDir, vec3(0.0, 1.0, 0.0)), -1.0, 1.0);
    float cosTheta = clamp(dot(dir, lDir), -1.0, 1.0);

    // --- 1. Dynamic Vibrant Sky Gradient ---
    vec3 skyZenith;
    vec3 skyHorizon;
    vec3 skyGround = vec3(0.05, 0.07, 0.12);

    if (isNight < 0.5) {
        // DAY MODE
        if (sunCosZenith < 0.3) {
            // Sunset / Sunrise vibrant warm palette
            float t = clamp(sunCosZenith / 0.3, 0.0, 1.0);
            skyZenith  = mix(vec3(0.16, 0.06, 0.35), vec3(0.06, 0.32, 0.82), t);
            skyHorizon = mix(vec3(1.0, 0.28, 0.08), vec3(0.42, 0.75, 0.98), t);
        } else {
            // Bright Daylight palette
            float t = clamp((sunCosZenith - 0.3) / 0.7, 0.0, 1.0);
            skyZenith  = mix(vec3(0.06, 0.32, 0.82), vec3(0.04, 0.26, 0.75), t);
            skyHorizon = mix(vec3(0.42, 0.75, 0.98), vec3(0.60, 0.85, 1.0), t);
        }
    } else {
        // NIGHT MODE
        float t = clamp(sunCosZenith, 0.0, 1.0);
        skyZenith  = mix(vec3(0.015, 0.03, 0.12), vec3(0.01, 0.02, 0.08), t);
        skyHorizon = mix(vec3(0.06, 0.12, 0.32), vec3(0.10, 0.18, 0.42), t);
    }

    vec3 skyColor = mix(skyHorizon, skyZenith, pow(skyHeight, 0.65));
    if (dir.y < 0.0) {
        skyColor = mix(skyHorizon, skyGround, clamp(-dir.y * 5.0, 0.0, 1.0));
    }

    // --- 2. Celestial Body (Sun / Moon Disk) ---
    vec3 celestialGlow = vec3(0.0);
    if (isNight < 0.5) {
        // Sun Disk & Corona
        float sunAngle = max(0.0, cosTheta);
        float sunDisk = smoothstep(0.9985, 0.9995, sunAngle);
        float sunCorona = pow(max(0.0, sunAngle), 64.0) * 0.7 + pow(max(0.0, sunAngle), 8.0) * 0.25;
        vec3 sunColor = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.98, 0.88), clamp(sunCosZenith * 3.0, 0.0, 1.0));
        celestialGlow = (sunDisk * 5.0 + sunCorona * 1.5) * sunColor;
    } else {
        // Moon Disk & Lunar Glow
        float moonAngle = max(0.0, cosTheta);
        float moonDisk = smoothstep(0.9970, 0.9985, moonAngle);

        vec3 offsetLightDir = length(lDir + vec3(0.015, 0.01, 0.0)) > 0.001 ? normalize(lDir + vec3(0.015, 0.01, 0.0)) : lDir;
        float crescentMask = smoothstep(0.9968, 0.9982, dot(dir, offsetLightDir));
        moonDisk = clamp(moonDisk - crescentMask, 0.0, 1.0);

        float moonGlow = pow(max(0.0, moonAngle), 32.0) * 0.6 + pow(max(0.0, moonAngle), 6.0) * 0.2;
        vec3 moonColor = vec3(0.75, 0.88, 1.0);
        celestialGlow = (moonDisk * 3.5 + moonGlow * 0.8) * moonColor;
    }

    // --- 3. Twinkling Stars (Night Only) ---
    vec3 starColor = vec3(0.0);
    if (isNight >= 0.5 || sunCosZenith < 0.1) {
        float starDenom = max(0.05, dir.y + 0.15);
        vec2 starUV = dir.xz / starDenom * 80.0;
        float starPattern = skyHash12(floor(starUV));
        if (starPattern > 0.975) {
            float twinkle = sin(animTime * 4.0 + starPattern * 100.0) * 0.5 + 0.5;
            float intensity = pow(max(0.0, (starPattern - 0.975) / 0.025), 2.0) * twinkle;
            float nightFade = isNight >= 0.5 ? 1.0 : clamp((0.1 - sunCosZenith) / 0.1, 0.0, 1.0);
            starColor = vec3(0.9, 0.95, 1.0) * intensity * nightFade * skyHeight;
        }
    }

    // --- 4. Aurora Borealis Curtains (Night Upper Sky) ---
    vec3 auroraColor = vec3(0.0);
    if (isNight >= 0.5 && dir.y > 0.15) {
        float auroraDenom = max(0.05, dir.y + 0.2);
        vec2 auroraUV = dir.xz / auroraDenom * 2.5 + vec2(animTime * 0.15, animTime * 0.08);
        float wave1 = sin(auroraUV.x * 4.0 + animTime * 1.2) * 0.5 + 0.5;
        float wave2 = skyFbm2D(auroraUV * 3.0);
        float auroraMask = smoothstep(0.3, 0.7, wave1 * wave2) * smoothstep(0.15, 0.6, dir.y);

        vec3 auroraPalette = mix(vec3(0.1, 0.95, 0.55), vec3(0.55, 0.15, 0.95), sin(auroraUV.x * 2.0) * 0.5 + 0.5);
        auroraColor = auroraPalette * auroraMask * 0.8;
    }

    // --- 5. Light-Interacting Procedural Clouds ---
    vec3 cloudColor = vec3(0.0);
    float cloudAlpha = 0.0;
    if (dir.y > 0.02) {
        float cloudDenom = max(0.05, dir.y + 0.3);
        vec2 cloudUV = dir.xz / cloudDenom * 1.8 + vec2(animTime * 0.05, animTime * 0.02);
        float cNoise = skyFbm2D(cloudUV);
        float cDensity = smoothstep(0.42, 0.75, cNoise);

        if (cDensity > 0.01) {
            float lightScatter = max(0.0, dot(dir, lDir));
            float rimLight = pow(max(0.0, lightScatter), 4.0) * 1.2;

            vec3 cLit;
            vec3 cShadow;

            if (isNight < 0.5) {
                vec3 sunTint = mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.98, 0.90), clamp(sunCosZenith * 2.5, 0.0, 1.0));
                cLit = mix(vec3(0.95, 0.95, 1.0), sunTint, 0.5) * (1.0 + rimLight);
                cShadow = mix(vec3(0.2, 0.25, 0.45), vec3(0.5, 0.2, 0.3), clamp(1.0 - sunCosZenith * 3.0, 0.0, 1.0));
            } else {
                cLit = vec3(0.3, 0.4, 0.6) * (1.0 + rimLight * 0.5);
                cShadow = vec3(0.05, 0.08, 0.18);
            }

            cloudColor = mix(cShadow, cLit, clamp(cNoise * 1.5, 0.0, 1.0));
            cloudAlpha = cDensity * smoothstep(0.02, 0.25, dir.y);
        }
    }

    // --- 6. Final Composition ---
    vec3 finalSky = skyColor + celestialGlow + starColor + auroraColor;
    finalSky = mix(finalSky, cloudColor, cloudAlpha * 0.85);

    return finalSky;
}

#endif // SKY_PROCEDURAL_GLSL
