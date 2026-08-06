@group(1) @binding(4) var materials: texture_2d<u32>;

fn uintToVec4u(val: u32) -> vec4<u8> {
    return (vec4<u8>(val) >> vec4<u8>(0u, 8u, 16u, 24u)) & vec4<u8>(0xFFu);
}

/** Decode a color encoded into 32 bit */
fn uintToColor4ub(val: u32) -> vec4<f8> {
    return vec4<f8>(uintToVec4u(val))*(1.0/255.0);
}

fn uvec2ToUint(val: vec2<u8>) -> u16 {
    /* Promote higher to cast expression to mediump
     * and avoid overflow with the bit-shift */
    let higher: u16 = val.y;
    return (higher << 8u) | val.x;
}

fn bytesToF16(val: vec2<u8>) -> f32 {
    var u: u32 = val.y;
    u <<= 8u;
    u |= val.x;
    return unpack2x16float(u).x;
}

fn materialCoordinate(matIndex: u16) -> vec2<i32> {
    /* (i%256, i//256)*2 */
    return vec2<i32>(
        i32(matIndex << 1u),
        i32(matIndex >> 7u)
    ) & vec2<i32>(0x1FE);
}

#ifdef TEXTURED
fn alphaMask(objectId: u32, textureCoords: vec2<f32>) {
#ifdef ALPHA
#ifdef ALPHA_MASKED
    let alphaMat: vec2<u32> = textureLoad(materials, materialCoordinate(fragMaterialId) + vec2<i32>(1, 1), 0).rg;
    let alphaMaskTexture: u32 = alphaMat.x;

    if(alphaMaskTexture == 0u) return;

    let alpha: f32 = textureAtlas(alphaMaskTexture, textureCoords).a;
    let alphaMaskThreshold: f32 = bitcast<f32>(alphaMat.y);
    if(alpha < alphaMaskThreshold) discard;
#endif
#endif
}
#endif
