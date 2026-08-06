/**
 * Ultra-Stylized Sky Procedural Library (WGSL)
 */

fn skyHash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn skyNoise2D(p: vec2<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    let a = skyHash12(i);
    let b = skyHash12(i + vec2<f32>(1.0, 0.0));
    let c = skyHash12(i + vec2<f32>(0.0, 1.0));
    let d = skyHash12(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn skyFbm2D(p_in: vec2<f32>) -> f32 {
    var v: f32 = 0.0;
    var a: f32 = 0.5;
    var p = p_in;
    let r00: f32 = 0.8;
    let r01: f32 = 0.6;
    let r10: f32 = -0.6;
    let r11: f32 = 0.8;
    for (var i: i32 = 0; i < 4; i++) {
        v += a * skyNoise2D(p);
        p = vec2<f32>(p.x * r00 + p.y * r01, p.x * r10 + p.y * r11) * 2.0;
        a *= 0.5;
    }
    return v;
}

fn evaluateAtmosphericSkyFast(viewDir: vec3<f32>, lightDir: vec3<f32>, lightColor: vec3<f32>, isNight: f32, animTime: f32) -> vec3<f32> {
    let vDir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(viewDir), length(viewDir) > 0.001);
    let lDir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(lightDir), length(lightDir) > 0.001);

    let y = clamp(vDir.y, 0.0001, 1.0);
    let sunCos = clamp(dot(lDir, vec3<f32>(0.0, 1.0, 0.0)), -1.0, 1.0);
    let elev = max(0.0, sunCos);

    var skyZenith: vec3<f32>;
    var skyHorizon: vec3<f32>;

    let twilightZenith  = vec3<f32>(0.16, 0.06, 0.35);
    let twilightHorizon = vec3<f32>(1.0, 0.32, 0.10);

    if (isNight < 0.5) {
        let t = clamp(elev / 0.3, 0.0, 1.0);
        skyZenith  = mix(twilightZenith, vec3<f32>(0.08, 0.35, 0.85), t);
        skyHorizon = mix(twilightHorizon, vec3<f32>(0.45, 0.75, 0.98), t);
    } else {
        let t = clamp(elev / 0.3, 0.0, 1.0);
        skyZenith  = mix(twilightZenith, vec3<f32>(0.02, 0.04, 0.14), t);
        skyHorizon = mix(twilightHorizon, vec3<f32>(0.08, 0.14, 0.35), t);
    }

    let color = mix(skyHorizon, skyZenith, pow(y, 0.7));
    return color * lightColor;
}

fn evaluateUltraStylizedSky(viewDir: vec3<f32>, lightDir: vec3<f32>, lightColor: vec3<f32>, isNight: f32, animTime: f32) -> vec3<f32> {
    let dir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(viewDir), length(viewDir) > 0.001);
    let lDir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(lightDir), length(lightDir) > 0.001);

    let viewY = clamp(dir.y, -0.1, 1.0);
    let skyHeight = clamp(max(0.0001, viewY), 0.0001, 1.0);

    let sunCosZenith = clamp(dot(lDir, vec3<f32>(0.0, 1.0, 0.0)), -1.0, 1.0);
    let elev = max(0.0, sunCosZenith);
    let cosTheta = clamp(dot(dir, lDir), -1.0, 1.0);

    var skyZenith: vec3<f32>;
    var skyHorizon: vec3<f32>;
    let skyGround = vec3<f32>(0.05, 0.07, 0.12);

    let twilightZenith  = vec3<f32>(0.16, 0.06, 0.35);
    let twilightHorizon = vec3<f32>(1.0, 0.28, 0.08);

    if (isNight < 0.5) {
        let t = clamp(elev / 0.35, 0.0, 1.0);
        skyZenith  = mix(twilightZenith, vec3<f32>(0.04, 0.26, 0.75), t);
        skyHorizon = mix(twilightHorizon, vec3<f32>(0.60, 0.85, 1.0), t);
    } else {
        let t = clamp(elev / 0.35, 0.0, 1.0);
        skyZenith  = mix(twilightZenith, vec3<f32>(0.015, 0.03, 0.12), t);
        skyHorizon = mix(twilightHorizon, vec3<f32>(0.06, 0.12, 0.32), t);
    }

    var skyColor = mix(skyHorizon, skyZenith, pow(skyHeight, 0.65));
    if (dir.y < 0.0) {
        skyColor = mix(skyHorizon, skyGround, clamp(-dir.y * 5.0, 0.0, 1.0));
    }

    var celestialGlow = vec3<f32>(0.0);
    if (isNight < 0.5) {
        let sunAngle = max(0.0, cosTheta);
        let sunDisk = smoothstep(0.9985, 0.9995, sunAngle);
        let sunCorona = pow(max(0.0, sunAngle), 64.0) * 0.7 + pow(max(0.0, sunAngle), 8.0) * 0.25;
        let sunColor = mix(vec3<f32>(1.0, 0.5, 0.2), vec3<f32>(1.0, 0.98, 0.88), clamp(elev * 3.0, 0.0, 1.0));
        celestialGlow = (sunDisk * 5.0 + sunCorona * 1.5) * sunColor;
    } else {
        let moonAngle = max(0.0, cosTheta);
        var moonDisk = smoothstep(0.9970, 0.9985, moonAngle);
        let offsetLightDir = select(lDir, normalize(lDir + vec3<f32>(0.015, 0.01, 0.0)), length(lDir + vec3<f32>(0.015, 0.01, 0.0)) > 0.001);
        let crescentMask = smoothstep(0.9968, 0.9982, dot(dir, offsetLightDir));
        moonDisk = clamp(moonDisk - crescentMask, 0.0, 1.0);

        let moonGlow = pow(max(0.0, moonAngle), 32.0) * 0.6 + pow(max(0.0, moonAngle), 6.0) * 0.2;
        let moonColor = vec3<f32>(0.75, 0.88, 1.0);
        celestialGlow = (moonDisk * 3.5 + moonGlow * 0.8) * moonColor;
    }

    var starColor = vec3<f32>(0.0);
    let starFade = select(select(0.0, clamp((0.05 - elev) / 0.05, 0.0, 1.0), elev < 0.05), smoothstep(0.0, 0.25, elev), isNight >= 0.5);
    if (starFade > 0.001) {
        let starDenom = max(0.05, dir.y + 0.15);
        let starUV = dir.xz / starDenom * 80.0;
        let starPattern = skyHash12(floor(starUV));
        if (starPattern > 0.975) {
            let twinkle = sin(animTime * 4.0 + starPattern * 100.0) * 0.5 + 0.5;
            let intensity = pow(max(0.0, (starPattern - 0.975) / 0.025), 2.0) * twinkle;
            starColor = vec3<f32>(0.9, 0.95, 1.0) * intensity * starFade * skyHeight;
        }
    }

    var auroraColor = vec3<f32>(0.0);
    let auroraFade = select(0.0, smoothstep(0.05, 0.35, elev), isNight >= 0.5);
    if (auroraFade > 0.001 && dir.y > 0.15) {
        let auroraDenom = max(0.05, dir.y + 0.2);
        let auroraUV = dir.xz / auroraDenom * 2.5 + vec2<f32>(animTime * 0.15, animTime * 0.08);
        let wave1 = sin(auroraUV.x * 4.0 + animTime * 1.2) * 0.5 + 0.5;
        let wave2 = skyFbm2D(auroraUV * 3.0);
        let auroraMask = smoothstep(0.3, 0.7, wave1 * wave2) * smoothstep(0.15, 0.6, dir.y);
        let auroraPalette = mix(vec3<f32>(0.1, 0.95, 0.55), vec3<f32>(0.55, 0.15, 0.95), sin(auroraUV.x * 2.0) * 0.5 + 0.5);
        auroraColor = auroraPalette * auroraMask * 0.8 * auroraFade;
    }

    var cloudColor = vec3<f32>(0.0);
    var cloudAlpha: f32 = 0.0;
    if (dir.y > 0.02) {
        let cloudDenom = max(0.05, dir.y + 0.3);
        let cloudUV = dir.xz / cloudDenom * 1.8 + vec2<f32>(animTime * 0.05, animTime * 0.02);
        let cNoise = skyFbm2D(cloudUV);
        let cDensity = smoothstep(0.42, 0.75, cNoise);

        if (cDensity > 0.01) {
            let lightScatter = max(0.0, dot(dir, lDir));
            let rimLight = pow(max(0.0, lightScatter), 4.0) * 1.2;

            var cLit: vec3<f32>;
            var cShadow: vec3<f32>;

            if (isNight < 0.5) {
                let sunTint = mix(vec3<f32>(1.0, 0.45, 0.2), vec3<f32>(1.0, 0.98, 0.90), clamp(elev * 2.5, 0.0, 1.0));
                cLit = mix(vec3<f32>(0.95, 0.95, 1.0), sunTint, 0.5) * (1.0 + rimLight);
                cShadow = mix(vec3<f32>(0.2, 0.25, 0.45), vec3<f32>(0.5, 0.2, 0.3), clamp(1.0 - elev * 3.0, 0.0, 1.0));
            } else {
                cLit = vec3<f32>(0.3, 0.4, 0.6) * (1.0 + rimLight * 0.5);
                cShadow = vec3<f32>(0.05, 0.08, 0.18);
            }

            cloudColor = mix(cShadow, cLit, clamp(cNoise * 1.5, 0.0, 1.0));
            cloudAlpha = cDensity * smoothstep(0.02, 0.25, dir.y);
        }
    }

    var finalSky = skyColor + celestialGlow + starColor + auroraColor;
    finalSky = mix(finalSky, cloudColor, cloudAlpha * 0.85);

    return finalSky;
}
