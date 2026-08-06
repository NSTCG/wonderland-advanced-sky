fn unpackUnorm16X(packed: u32) -> f32 {
    return f32(packed & 0xFFFFu) / 65535.0;
}
fn unpackUnorm16Y(packed: u32) -> f32 {
    return f32((packed >> 16) & 0xFFFFu) / 65535.0;
}
fn unpackUint16X(packed: u32) -> u16 {
    return u16(packed & 0xFFFFu);
}
fn unpackUint16Y(packed: u32) -> u16 {
    return u16((packed >> 16) & 0xFFFFu);
}
fn unpackUint2x16(packed: u32) -> vec2<u32> {
    let x: u16 = u16(packed & 0xFFFFu);
    let y: u16 = u16((packed >> 16) & 0xFFFFu);
    return vec2<u32>(x, y);
}

fn unpackUnormVector(v: vec2<u32>) -> vec4<f16> {
    return vec4<f16>(
        unpack2x16unorm(v.x),
        unpack2x16unorm(v.y)
    );
}

fn unpackSnormVector(v: vec2<u32>) -> vec4<f16> {
    return vec4<f16>(
        unpack2x16snorm(v.x),
        unpack2x16snorm(v.y)
    );
}

fn packUnormVector(v: vec4<f16>) -> vec2<u32> {
    return vec2<u32>(
        pack2x16unorm(v.xy),
        pack2x16unorm(v.zw)
    );
}

fn packSnormVector(v: vec4<f16>) -> vec2<u32> {
    return vec2<u32>(
        pack2x16snorm(v.xy),
        pack2x16snorm(v.zw)
    );
}
