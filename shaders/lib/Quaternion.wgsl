struct Quat2 {
    rot: vec4<f32>,
    loc: vec4<f32>,
}

fn quat_conjugated(q: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(-q.xyz, q.w);
}

fn quat2_conjugated(q: Quat2) -> Quat2 {
    return Quat2(quat_conjugated(q.rot), vec4<f32>(q.loc.xyz, -q.loc.w));
}

fn quat_mult(q1: vec4<f32>, q2: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(q1.w*q2.xyz + q2.w*q1.xyz + cross(q1.xyz, q2.xyz),
                     q1.w*q2.w - dot(q1.xyz, q2.xyz));
}

fn quat_scale(f: f32, q: Quat2) -> Quat2 {
    return Quat2(f*q.rot, f*q.loc);
}

fn quat2_vecMult(p: vec3<f32>, q: Quat2) -> Quat2 {
    return Quat2(q.rot, q.loc + quat_mult(vec4<f32>(p, 0.0f), q.rot));
}

fn quat2_mult(a: Quat2, b: Quat2) -> Quat2 {
    return Quat2(quat_mult(a.rot, b.rot), quat_mult(a.rot, b.loc) + quat_mult(a.loc, b.rot));
}

fn quat_transformVector(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
    let a = cross(q.xyz, v);
    let b = q.w*a + cross(q.xyz, a);
    return v + 2.0*b;
}

fn quat2_transformPoint(q: Quat2, p: vec3<f32>) -> vec3<f32> {
    let qrv = q.rot.xyz;
    let qrw = q.rot.w;

    let blv = qrw*p + cross(qrv, p) + 2.0*q.loc.xyz;
    return (dot(p, qrv) - 2.0*q.loc.w)*qrv
        + qrw*blv
        + cross(qrv, blv);
}

fn quat_translation(q: Quat2) -> vec3<f32> {
    return quat_mult(q.loc, quat_conjugated(q.rot)).xyz*2.0;
}

fn quat_toMatrix(qq: vec4<f32>) -> mat3x3<f32> {
    /* Multiply by sqrt(2) to avoid factors of two in the matrix */
    let q = qq * 1.414214;

    let xx: f32 = q.x*q.x;
    let xy: f32 = q.x*q.y;
    let xz: f32 = q.x*q.z;
    let xw: f32 = q.x*q.w;

    let yy: f32 = q.y*q.y;
    let yz: f32 = q.y*q.z;
    let yw: f32 = q.y*q.w;

    let zz: f32 = q.z*q.z;
    let zw: f32 = q.z*q.w;

    return mat3x3<f32>(
        1.0 - yy - zz,
        xy + zw,
        xz - yw,

        xy - zw,
        1.0 - xx - zz,
        yz + xw,

        xz + yw,
        yz - xw,
        1.0 - xx - yy);
}

fn quat_toMatrix_4x4(qq: vec4<f32>) -> mat4x4<f32> {
    let m = quat_toMatrix(qq);
    return mat4x4<f32>(
        vec4<f32>(m[0], 0.0),
        vec4<f32>(m[1], 0.0),
        vec4<f32>(m[2], 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}
