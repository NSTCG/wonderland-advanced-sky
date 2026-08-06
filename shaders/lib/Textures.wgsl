/* The compressed atlas is either tiled or non-tiled when texture streaming
 * is disabled, so only one of those is bound at any given time as textureAtlasCompressed */
#ifdef UNCOMPRESSED_ATLAS
@group(0) @binding(4) var textureAtlasUncompressed: texture_2d_array<f8>;
#endif
#ifdef COMPRESSED_ATLAS
@group(0) @binding(5) var textureAtlasCompressed: texture_2d_array<f8>;
#endif
@group(0) @binding(6) var textureAtlasSampler: sampler;

#ifdef TEXTURE_STREAMING
@group(0) @binding(7) var indirectionTexture: texture_2d<u16>;
#endif

#define COMPRESSED 0x80u
#define COMPRESSED_TILED 0xFFu

/* Texture streaming tile visualization */
//#define VISUALIZE_TEXTURE_STREAMING

/* Ugly kludge */
#if defined SHADER_TYPE_TILE_FEEDBACK
@group(2) @binding(1) var textureBounds: texture_2d<u32>;
#else
@group(0) @binding(8) var textureBounds: texture_2d<u32>;
#endif

#ifdef VISUALIZE_TEXTURE_STREAMING
fn randomColor(id: u32) -> vec4<f8> {
    var c: vec4<f8>;
    let fid = f32(id);
    c.r = (fid*2.4 % 33.0)/33.0;
    c.g = (fid*7.0 % 17.0)/17.0;
    c.b = (fid*13.0 % 21.0)/21.0;
    c.a = 1.0;
    return c;
}
const BLACK = vec4<f32>(0, 0, 0, 1.0);
const WHITE = vec4<f32>(1.0);
const PINK = vec4<f32>(1.0, 0.0, 1.0, 1.0);
#endif

fn fastInv2Exp(exp: u8) -> f32 {
    let exponent: u8 = u8(127 - i8(exp)) & 0xFFu;
    return bitcast<f32>(exponent << 23u);
}

fn fastIntLog2(v: f32) -> i8 {
    let bits: u16 = bitcast<u32>(v) >> 23u;
    return i8(bits & 255u) - 127;
}

/**
 * Compute the maximum LOD of a texture based on its dimensions
 *
 * @param size The dimensions of the texture
 * @returns The maximum lod
 */
fn maxLod(size: vec2<u16>) -> u8 {
    /* The constant `8` is for the minimum tile size: log2(256) = 8. */
    return u8(max(0, fastIntLog2(f32(max(size.x, size.y))) - 8));
}

fn mipMapLevel(pixelCoords: vec2<f32>, maxMip: u8) -> u8 {
    var dx: vec2<f32> = dpdx(pixelCoords);
    let dy: vec2<f32> = dpdy(pixelCoords);

    let d: f32 = max(dot(dx, dx), dot(dy, dy));

    /* Clamp to valid mip range */
    return u8(clamp(fastIntLog2(d) >> 1, 0, i8(maxMip)));
}

/**
 * Compute the mip map level to fetch based on the UV derivative
 *
 * @param uv The equirectangular phi and theta values, in the range [-0.5, 0.5]
 * @param size The size of the texture to fetch
 * @param maxMip The maximum (inclusive) mip level
 */
fn mipMapLevelEquirectangular(uv: vec2<f32>, size: vec2<f32>, maxMip: u8) -> u8 {
    /* If we compute the mip level using the `mipMapLevel` function, we will
     * end up with a seam because equirectangular uvs will have a sudden
     * jump between two texels (0.5 to -0.5), making the classic mip map
     * selection choose the highest possible lod.
     *
     * Fix from Ben Golus:
     * https://bgolus.medium.com/distinctive-derivative-differences-cce38d36797b#3fda */

    /* Second channel to use when the derivate of the first one is too big. */
    let uvB: vec2<f32> = vec2<f32>(fract(uv.x), uv.y);
    return min(mipMapLevel(uv*size, maxMip), mipMapLevel(uvB*size, maxMip));
}

#ifdef TEXTURE_STREAMING
fn tileST(lod: u8, offset: vec2<u16>, wrappedSt: vec2<f32>) -> vec2<i16> {
    let toIndirection: f32 = fastInv2Exp(lod + 8u);

    let offs: vec2<f32> = ceil(vec2<f32>(offset)*toIndirection);

    /* @todo casting to i16/i8 for Naga but no reason to in theory */
    let indirectionSt: vec2<i16> = vec2<i16>(offs + wrappedSt*toIndirection);
    return indirectionSt;
}

fn sampleTile(lod: u8, offset: vec2<u16>, wrappedSt: vec2<f32>) -> u16 {
    return textureLoad(indirectionTexture, tileST(lod, offset, wrappedSt), i8(lod)).r;
}

const tileTwoPixels: f32 = 2.0/260.0;
const tileRescale: f32 = 256.0/260.0;

fn tileStackLevel(stack: texture_2d_array<f8>, offset: vec2<u16>, size: vec2<u16>, uv: vec2<f32>, lod: u8) -> vec4<f32> {
    /* Texture coordinates on virtual texture atlas */
    let wrappedSt: vec2<f32> = min(fract(uv), vec2<f32>(0.99999))*vec2<f32>(size);

    var tile: u16 = sampleTile(lod, offset, wrappedSt);

    let tileLod: u8 = u8(tile >> 11u);
    /* Max tile cache is 2048 tiles */
    tile = tile & 0x7FFu;

    /* Compute UVs relative to the tile */
    let ti: f32 = fastInv2Exp(8u + lod + tileLod);
    let tileUV: vec2<f32> = min(fract(wrappedSt * ti), vec2<f32>(0.99999));

    /* Bilinear filtering */
    let c: vec4<f8> = textureSampleLevel(stack, textureAtlasSampler, vec2<f32>(tileUV*tileRescale + tileTwoPixels), tile, 0.0);

#ifdef VISUALIZE_TEXTURE_STREAMING
#define LINE_WIDTH 2.0*tileTwoPixels
#define PAD tileTwoPixels
    if(tileUV.x < PAD + LINE_WIDTH || tileUV.x > 1.0 - PAD - LINE_WIDTH
        || tileUV.y < PAD + LINE_WIDTH || tileUV.y > 1.0 - PAD - LINE_WIDTH)
        return vec4<f32>(randomColor(tile).rgb, 0.4);
#endif
    return c;
}

fn tileStack(stack: texture_2d_array<f8>, offset: vec2<u16>, size: vec2<u16>, uv: vec2<f32>) -> vec4<f32> {
    let st: vec2<f32> = uv*vec2<f32>(size);
    let lod: u8 = mipMapLevel(st, maxLod(size));
    return tileStackLevel(stack, offset, size, uv, lod);
}
#endif

struct Bounds {
  layer: u8,
  bounds: vec4<u16>,
}
fn unpackBounds(t: u16) -> Bounds {
    let boundsPacked: vec4<u32> = textureLoad(textureBounds,
        vec2<i32>(i32(t & 0x3FFu), i32(t >> 10u)), 0);
    let layer: u8 = boundsPacked.x >> 8u;
    #ifdef TEXTURE_STREAMING
    if(layer == COMPRESSED_TILED) {
        /* Compressed image bounds */
        let bounds = vec4<u16>(
            (boundsPacked.y & 0xFFu) << 8u,
            boundsPacked.y & 0xFF00u,
            boundsPacked.z,
            boundsPacked.w
        );
        return Bounds(layer, bounds);
    }
    #endif
    /* Uncompressed image bounds */
    let bounds = vec4<u16>(
        boundsPacked.z,
        boundsPacked.w,
        (boundsPacked.y & 0xFFFu) + 1u,
        (((boundsPacked.x & 0xFFu) << 4u) | (boundsPacked.y >> 12u)) + 1u
    );
    return Bounds(layer, bounds);
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
fn textureAtlasFlat(atlas: texture_2d_array<f8>, uv: vec2<f32>, bounds: vec4<u16>, layer: u8) -> vec4<f32> {
    var pixelUV = vec2<f32>(bounds.xy) + fract(uv)*vec2<f32>(bounds.zw);
    pixelUV = pixelUV/vec2<f32>(textureDimensions(atlas, 0).xy);
    return textureSample(atlas, textureAtlasSampler, pixelUV, layer);
}

fn textureAtlasFlatLevel(atlas: texture_2d_array<f8>, uv: vec2<f32>, bounds: vec4<u16>, layer: u8, mip: u8) -> vec4<f32> {
    var pixelUV = vec2<f32>(bounds.xy) + fract(uv)*vec2<f32>(bounds.zw);
    pixelUV = pixelUV/vec2<f32>(textureDimensions(atlas, 0).xy);
    return textureSampleLevel(atlas, textureAtlasSampler, pixelUV, layer, f32(mip));
}

fn textureAtlasLayer(uv: vec2<f32>, bounds: vec4<u16>, layer: u8) -> vec4<f32> {
    #ifdef COMPRESSED_ATLAS
    if(bool(layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        return tileStack(textureAtlasCompressed, bounds.xy, bounds.zw, uv);
        #else
        return textureAtlasFlat(textureAtlasCompressed, uv, bounds, layer & 0x7Fu);
        #endif
    }
    #endif
    #ifdef UNCOMPRESSED_ATLAS
    return textureAtlasFlat(textureAtlasUncompressed, uv, bounds, layer);
    #else
    /* Shouldn't happen, return debug pink */
    return vec4<f32>(1.0, 0.0, 1.0, 1.0);
    #endif
}

fn textureAtlas(t: u16, uv: vec2<f32>) -> vec4<f32> {
    let b: Bounds = unpackBounds(t);
    return textureAtlasLayer(uv, b.bounds, b.layer);
}

fn textureAtlasLevel(t: u16, uv: vec2<f32>, mip: u8) -> vec4<f32> {
    let b: Bounds = unpackBounds(t);
    #ifdef COMPRESSED_ATLAS
    if(bool(b.layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        return tileStackLevel(textureAtlasCompressed, b.bounds.xy, b.bounds.zw, uv, mip);
        #else
        return textureAtlasFlatLevel(textureAtlasCompressed, uv, b.bounds, b.layer & 0x7Fu, mip);
        #endif
    }
    #endif
    #ifdef UNCOMPRESSED_ATLAS
    return textureAtlasFlatLevel(textureAtlasUncompressed, uv, b.bounds, b.layer, mip);
    #else
    /* Shouldn't happen, return debug pink */
    return vec4<f32>(1.0, 0.0, 1.0, 1.0);
    #endif
}

fn textureAtlasEquirectangular(t: u16, uv: vec2<f32>) -> vec4<f32> {
    let b: Bounds = unpackBounds(t);

    /* Mip is on purpose computed with un-normalized UVs. */
    let maxMip: u8 = maxLod(b.bounds.zw);
    let mip: u8 = mipMapLevelEquirectangular(uv - vec2<f32>(0.5), vec2<f32>(b.bounds.zw), maxMip);

    #ifdef COMPRESSED_ATLAS
    if(!bool(b.layer & COMPRESSED)) {
        #ifdef TEXTURE_STREAMING
        return tileStackLevel(textureAtlasCompressed, b.bounds.xy, b.bounds.zw, uv, mip);
        #else
        /* The mip is fixed, no need to perform extra computation. */
        return textureAtlasFlatLevel(textureAtlasCompressed, uv, b.bounds, b.layer & 0x7Fu, mip);
        #endif
    }
    #endif
    #ifdef UNCOMPRESSED_ATLAS
    return textureAtlasFlatLevel(textureAtlasUncompressed, uv, b.bounds, b.layer, mip);
    #else
    /* Shouldn't happen, return debug pink */
    return vec4<f32>(1.0, 0.0, 1.0, 1.0);
    #endif
}
