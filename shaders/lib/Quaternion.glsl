struct Quat2 {
    vec4 rot;
    vec4 loc;
};

vec4 conjugated(vec4 q) {
    return vec4(-q.xyz, q.w);
}

Quat2 conjugated(Quat2 q) {
    return Quat2(conjugated(q.rot), vec4(q.loc.xyz, -q.loc.w));
}

vec4 quat_mult(vec4 q1, vec4 q2) {
    return vec4(q1.w*q2.xyz + q2.w*q1.xyz + cross(q1.xyz, q2.xyz),
                /* dot(q1, conjugated(q2)) */
                q1.w*q2.w - dot(q1.xyz, q2.xyz));
}

Quat2 quat_scale(float f, Quat2 q) {
    return Quat2(f*q.rot, f*q.loc);
}

Quat2 quat2_mult(vec3 p, Quat2 q) {
    return Quat2(q.rot, q.loc + quat_mult(vec4(p, 0.0f), q.rot));
}

Quat2 quat2_mult(Quat2 a, Quat2 b) {
    return Quat2(quat_mult(a.rot, b.rot), quat_mult(a.rot, b.loc) + quat_mult(a.loc, b.rot));
}

vec3 quat_transformVector(vec4 q, vec3 v) {
    vec3 a = cross(q.xyz, v);
    vec3 b = q.w*a + cross(q.xyz, a);
    return v + 2.0*b;
}

vec3 quat2_transformPoint(Quat2 q, vec3 p) {
    vec3 qrv = q.rot.xyz;
    float qrw = q.rot.w;

    vec3 blv = qrw*p + cross(qrv, p) + 2.0*q.loc.xyz;
    return (dot(p, qrv) - 2.0*q.loc.w)*qrv
        + qrw*blv
        + cross(qrv, blv);
}

vec3 quat_translation(Quat2 q) {
    return quat_mult(q.loc, conjugated(q.rot)).xyz*2.0;
}

mat3 quat_toMatrix(vec4 q) {
    /* Multiply by sqrt(2) to avoid factors of two in the matrix */
    q *= 1.414214;

    float xx = q.x*q.x;
    float xy = q.x*q.y;
    float xz = q.x*q.z;
    float xw = q.x*q.w;

    float yy = q.y*q.y;
    float yz = q.y*q.z;
    float yw = q.y*q.w;

    float zz = q.z*q.z;
    float zw = q.z*q.w;

    return mat3(
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
