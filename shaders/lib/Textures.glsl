/* The compressed atlas is either tiled or non-tiled when texture streaming
 * is disabled, so only one of those is bound at any given time as textureAtlasCompressed */
uniform lowp sampler2DArray textureAtlasUncompressed;
uniform lowp sampler2DArray textureAtlasCompressed;

#ifdef TEXTURE_STREAMING
uniform mediump usampler2D indirectionTexture;
#endif

#define COMPRESSED 0x80u
#define COMPRESSED_TILED 0xFFu

/* Texture streaming tile visualization */
//#define VISUALIZE_TEXTURE_STREAMING

uniform highp usampler2D textureBounds;

#ifdef VISUALIZE_TEXTURE_STREAMING
lowp vec4 randomColor(highp uint id) {
    lowp vec4 c;
    highp float fid = float(id);
    c.r = mod(fid*2.4, 33.0)/33.0;
    c.g = mod(fid*7.0, 17.0)/17.0;
    c.b = mod(fid*13.0, 21.0)/21.0;
    c.a = 1.0;
    return c;
}
const vec4 BLACK = vec4(0, 0, 0, 1.0);
const vec4 WHITE = vec4(1.0);
const vec4 PINK = vec4(1.0, 0.0, 1.0, 1.0);
#endif

highp float fastInv2Exp(lowp int exp) {
    highp uint exponent = uint(127 - exp) & 0xFFu;
    return uintBitsToFloat(exponent << 23u);
}

lowp int fastIntLog2(highp float v) {
    lowp uint bits = floatBitsToUint(v) >> 23u;
    return int(bits & 255u) - 127;
}

/**
 * Compute the maximum LOD of a texture based on its dimensions
 *
 * @param size The dimensions of the texture
 * @returns The maximum lod
 */
lowp int maxLod(mediump uvec2 size) {
    /* The constant `8` is for the minimum tile size: log2(256) = 8. */
    return max(0, fastIntLog2(float(max(size.x, size.y))) - 8);
}

lowp int mipMapLevel(vec2 pixelCoords) {
    highp vec2 dx = dFdx(pixelCoords);
    highp vec2 dy = dFdy(pixelCoords);

    highp float d = max(dot(dx, dx), dot(dy, dy));
    return fastIntLog2(d) >> 1;
}

lowp int mipMapLevel(vec2 pixelCoords, lowp int maxMip) {
    lowp int lod = mipMapLevel(pixelCoords);
    /* Clamp to valid mip range */
    return clamp(lod, 0, maxMip);
}

/**
 * Compute the mip map level to fetch based on the UV derivative
 *
 * @param uv The equirectangular phi and theta values, in the range [-0.5, 0.5]
 * @param size The size of the texture to fetch
 * @param maxMip The maximum (inclusive) mip level
 */
lowp int mipMapLevelEquirectangular(vec2 uv, vec2 size, lowp int maxMip) {
    /* If we compute the mip level using the `mipMapLevel` function, we will
     * end up with a seam because equirectangular uvs will have a sudden
     * jump between two texels (0.5 to -0.5), making the classic mip map
     * selection choose the highest possible lod.
     *
     * Fix from Ben Golus:
     * https://bgolus.medium.com/distinctive-derivative-differences-cce38d36797b#3fda */

    /* Second channel to use when the derivate of the first one is too big. */
    vec2 uvB = vec2(fract(uv.x), uv.y);
    return min(mipMapLevel(uv*size, maxMip), mipMapLevel(uvB*size, maxMip));
}

#ifdef TEXTURE_STREAMING
ivec2 tileST(lowp int lod, mediump uvec2 offset, vec2 wrappedSt) {
    float toIndirection = fastInv2Exp(lod + 8);
    vec2 offs = ceil(vec2(offset)*toIndirection);
    mediump ivec2 indirectionSt = ivec2(offs + wrappedSt*toIndirection);
    return indirectionSt;
}

mediump uint sampleTile(lowp int lod, mediump uvec2 offset, vec2 wrappedSt) {
    return texelFetch(indirectionTexture, tileST(lod, offset, wrappedSt), lod).r;
}

vec4 tileStackLod(lowp sampler2DArray stack, mediump uvec2 offset, mediump uvec2 size, vec2 uv, lowp int lod) {
    /* Texture coordinates on virtual texture atlas. */
    vec2 wrappedSt = min(fract(uv), 0.99999)*vec2(size);

    mediump uint tile = sampleTile(lod, offset, wrappedSt);

    lowp int tileLod = int(tile >> 11u);
    /* Max tile cache is 2048 tiles */
    tile = tile & 0x7FFu;

    /* Compute UVs relative to the tile */
    highp float ti = fastInv2Exp(8 + lod + tileLod);
    highp vec2 tileUV = min(fract(wrappedSt*ti), 0.99999);

    const float twoPixels = 2.0/260.0;
    const float rescale = 256.0/260.0;
    lowp vec4 c = textureLod(stack, vec3(tileUV*rescale + twoPixels, float(tile)), 0.0);

#ifdef VISUALIZE_TEXTURE_STREAMING
#define LINE_WIDTH 2.0*twoPixels
#define PAD twoPixels
    if(tileUV.x < PAD + LINE_WIDTH || tileUV.x > 1.0 - PAD - LINE_WIDTH
        || tileUV.y < PAD + LINE_WIDTH || tileUV.y > 1.0 - PAD - LINE_WIDTH)
        c = vec4(randomColor(tile).rgb, 0.4);
#endif
    return c;
}

vec4 tileStack(lowp sampler2DArray stack, mediump uvec2 offset, mediump uvec2 size, vec2 uv) {
    vec2 st = uv*vec2(size);
    lowp int lod = mipMapLevel(st, maxLod(size));
    return tileStackLod(stack, offset, size, uv, lod);
}
#endif

uint unpackBounds(mediump uint t, out mediump uvec4 bounds) {
    highp uvec4 boundsPacked = texelFetch(textureBounds,
        ivec2(int(t & 0x3FFu), int(t >> 10u)), 0);
    lowp uint layer = boundsPacked.x >> 8u;
    #ifdef TEXTURE_STREAMING
    if(layer == COMPRESSED_TILED) {
        /* Compressed image bounds */
        bounds = uvec4(
            (boundsPacked.y & 0xFFu) << 8u,
            boundsPacked.y & 0xFF00u,
            boundsPacked.z,
            boundsPacked.w
        );
    } else
    #endif
    {
        /* Uncompressed image bounds */
        bounds = uvec4(
            boundsPacked.z,
            boundsPacked.w,
            (boundsPacked.y & 0xFFFu) + 1u,
            (((boundsPacked.x & 0xFFu) << 4u) | (boundsPacked.y >> 12u)) + 1u
        );
    }
    return layer;
}

/**
 * Fetch the uncompressed texture atlas.
 *
 * This method automatically wrap uvs and performs the bounds offset
 * to retrieve the appropriate texel to fetch in the texture.
 *
 * @param uv The un-normalized uv
 * @param bounds The bounds of the texture in the atlas
 * @param layer The texture lod
 * @returns The color fetched from the atlas
 */
vec4 textureAtlasFlat(lowp sampler2DArray atlas, vec2 uv, mediump uvec4 bounds, lowp uint layer) {
    vec2 pixelCoord = vec2(bounds.xy) + fract(uv)*vec2(bounds.zw);
    lowp int lod = mipMapLevel(pixelCoord, maxLod(bounds.zw));
    vec2 atlasUV = pixelCoord/vec2(textureSize(atlas, 0).xy);
    return textureLod(atlas, vec3(atlasUV, layer), float(lod));
}

vec4 textureAtlasFlatLod(lowp sampler2DArray atlas, vec2 uv, mediump uvec4 bounds, lowp uint layer, lowp int mip) {
    vec3 pixelUV = vec3(vec2(bounds.xy) + fract(uv)*vec2(bounds.zw), layer);
    pixelUV = pixelUV/vec3(textureSize(atlas, 0).xy, 1);
    return textureLod(atlas, pixelUV, float(mip));
}

vec4 textureAtlasLayer(vec2 uv, mediump uvec4 bounds, lowp uint layer) {
    lowp vec4 c;
    if(bool(layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        c = tileStack(textureAtlasCompressed, bounds.xy, bounds.zw, uv);
        #else
        c = textureAtlasFlat(textureAtlasCompressed, uv, bounds, layer & 0x7Fu);
        #endif
    } else {
        c = textureAtlasFlat(textureAtlasUncompressed, uv, bounds, layer);
    }
    return c;
}

vec4 textureAtlas(mediump uint t, vec2 uv) {
    mediump uvec4 bounds;
    lowp uint layer = unpackBounds(t, bounds);
    return textureAtlasLayer(uv, bounds, layer);
}

vec4 textureAtlasLod(mediump uint t, vec2 uv, lowp int mip) {
    mediump uvec4 bounds;
    lowp uint layer = unpackBounds(t, bounds);
    lowp vec4 c;
    if(bool(layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        c = tileStackLod(textureAtlasCompressed, bounds.xy, bounds.zw, uv, mip);
        #else
        c = textureAtlasFlatLod(textureAtlasCompressed, uv, bounds, layer & 0x7Fu, mip);
        #endif
    } else {
        c = textureAtlasFlatLod(textureAtlasUncompressed, uv, bounds, layer, mip);
    }
    return c;
}

/**
 * Fetch the compressed/uncompressed atlas using
 * a specific equirectangular re-mapping.
 *
 * @param t Texture to read
 * @param uv Equirectangular UV
 */
vec4 textureAtlasEquirectangular(mediump uint t, vec2 uv) {
    mediump uvec4 bounds;
    lowp uint layer = unpackBounds(t, bounds);

    /* Convert UV to [0; 1] and rescale.
     *
     * Rescale and intercept uv to reduce the seam from
     * missing bound and compression error.
     *
     * @todo: Should only be done with non-padded textures.
     */
    mediump vec2 size = vec2(bounds.zw);
    uv = (uv*(size - vec2(1.0)) + vec2(0.5))/size;

    /* Mip is on purpose computed with un-normalized UVs. */
    lowp int maxMip = maxLod(bounds.zw);
    lowp int mip = mipMapLevelEquirectangular(uv - vec2(0.5), size, maxMip);

    if(bool(layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        return tileStackLod(textureAtlasCompressed, bounds.xy, bounds.zw, uv, mip);
        #else
        return textureAtlasFlatLod(textureAtlasCompressed, uv, bounds, layer & 0x7Fu, mip);
        #endif
    } else {
        return textureAtlasFlatLod(textureAtlasUncompressed, uv, bounds, layer, mip);
    }
}
