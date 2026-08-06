#ifdef EMULATE_PACKING

/* Input is usually mediump but converted to highp for enough precision up to
 * USHRT_MAX */
highp uint packUnorm2x16(highp vec2 v) {
    highp uvec2 expanded = uvec2(round(clamp(v, 0.0, 1.0)*65535.0));
    return (expanded.x & 0xffffu) | (expanded.y << 16u);
}

highp uint packSnorm2x16(highp vec2 v) {
    /* GLSL int -> uint cast preserves the bit pattern */
    highp uvec2 expanded = uvec2(ivec2(round(clamp(v, -1.0, 1.0)*32767.0)));
    return (expanded.x & 0xffffu) | (expanded.y << 16u);
}

mediump vec2 unpackUnorm2x16(highp uint p) {
    mediump uvec2 extracted = uvec2(p & 0xffffu, p >> 16u);
    return vec2(extracted)/65535.0;
}

mediump vec2 unpackSnorm2x16(highp uint p) {
    /* The double shift makes sure we get sign extension */
    mediump ivec2 extracted = ivec2((int(p) << 16) >> 16, int(p) >> 16);
    return vec2(extracted)/32767.0;
}

/**
 * Unpack an encoded half float into a float.
 *
 * Taken from the Angle codebase.
 */
float unpackHalf(uint val) {
    uint sign = (val & 0x8000u) << 16;
    int exponent = int((val & 0x7C00u) >> 10);
    uint mantissa = val & 0x03FFu;
    float f32 = 0.0;
    if(exponent == 0)
    {
        if (mantissa != 0u)
        {
            const float scale = 1.0 / (1 << 24);
            f32 = scale * mantissa;
        }
    }
    else if (exponent == 31)
    {
        return uintBitsToFloat(sign | 0x7F800000u | mantissa);
    }
    else
    {
        exponent -= 15;
        float scale;
        if(exponent < 0)
        {
            // The negative unary operator is buggy on OSX.
            // Work around this by using abs instead.
            scale = 1.0 / (1 << abs(exponent));
        }
        else
        {
            scale = 1 << exponent;
        }
        float decimal = 1.0 + float(mantissa) / float(1 << 10);
        f32 = scale * decimal;
    }
    if (sign != 0u)
    {
        f32 = -f32;
    }
    return f32;
}

mediump vec2 unpackHalf2x16(highp uint val) {
    return vec2(unpackHalf(val & 0xFFFFu), unpackHalf(val >> 16u));
}

#endif

highp uvec2 packUnormVector(mediump vec4 v) {
    return uvec2(
        packUnorm2x16(v.xy),
        packUnorm2x16(v.zw)
    );
}

highp uvec2 packSnormVector(mediump vec4 v) {
    return uvec2(
        packSnorm2x16(v.xy),
        packSnorm2x16(v.zw)
    );
}

/**
 * Compress a cartesian normal into octahedron form on 32 bits
 *
 * From: https://www.shadertoy.com/view/Mtfyzl
 */
uint packOctahedral(vec3 normal) {
    normal /= (abs(normal.x) + abs(normal.y) + abs(normal.z));
    normal.xy = normal.z >= 0.0 ? normal.xy : sign(normal.xy)*(vec2(1.0) - abs(normal.yx));
    vec2 v = vec2(0.5) + 0.5*normal.xy;
    uvec2 d = uvec2(floor(v*float((1u<<16u) - 1u) + vec2(0.5)));
    return (d.y << 16u)|d.x;
}

/** Unpack normal encoded via @ref packOctahedral() */
vec3 unpackOctahedral(uint enc) {
    uint mu = (1u << 16u) - 1u;
    uvec2 d = uvec2(enc & mu, (enc >> 16u) & mu);
    vec2 p = vec2(d)/float(mu);
    p = vec2(-1.0) + 2.0*p;

    /* Faster version than original paper:
     * https://twitter.com/Stubbesaurus/status/937994790553227264 */
    vec3 n = vec3(p.x, p.y, 1.0 - abs(p.x) - abs(p.y));
    float t = max(0.0, -n.z);
    n.x += n.x > 0.0 ? -t : t;
    n.y += n.y > 0.0 ? -t : t;

    return normalize(n);
}
