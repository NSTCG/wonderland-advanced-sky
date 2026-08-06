uniform highp usampler2D materials;

lowp uvec4 uintToVec4u(highp uint val) {
    return (uvec4(val) >> uvec4(0u, 8u, 16u, 24u)) & uvec4(0xFFu);
}

/** Decode a color encoded into 32 bit */
lowp vec4 uintToColor4ub(highp uint val) {
    return vec4(uintToVec4u(val))*(1.0/255.0);
}

mediump float bytesToF16(lowp uvec2 val) {
    highp uint u = val.y;
    u <<= 8u;
    u |= val.x;
#ifdef EMULATE_PACKING
    /* This function is used for emulating packing functions */
    return unpackHalf(u);
#else
    return unpackHalf2x16(u).x;
#endif
}

mediump uint uvec2ToUint(lowp uvec2 val) {
    /* Promote higher to cast expression to mediump
     * and avoid overflow with the bit-shift */
    mediump uint higher = val.y;
    return (higher << 8u) | val.x;
}

mediump ivec2 materialCoordinate(mediump uint matIndex) {
    /* (i%256, i//256)*2 */
    return ivec2(
        int(matIndex) << 1,
        int(matIndex) >> 7
    ) & 0x1FE;
}

#ifdef TEXTURED
void alphaMask(uint objectId, vec2 textureCoords) {
#ifdef ALPHA_MASKED
    highp uvec2 alphaMat = texelFetchOffset(materials, materialCoordinate(fragMaterialId), 0, ivec2(1, 1)).rg;
    uint alphaMaskTexture = alphaMat.x;

    if(alphaMaskTexture == 0u) return;

    float alpha = textureAtlas(alphaMaskTexture, textureCoords).a;
    float alphaMaskThreshold = uintBitsToFloat(alphaMat.y);
    if(alpha < alphaMaskThreshold) discard;
#endif
}
#endif
