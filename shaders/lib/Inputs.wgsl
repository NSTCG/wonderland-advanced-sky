#ifdef USE_POSITION_WORLD
@location(0) fragPositionWorld: vec3<f32>,
#endif
#ifdef USE_POSITION_VIEW
@location(1) fragPositionView: vec3<f32>,
#endif
#ifdef USE_TEXTURE_COORDS
@location(2) fragTextureCoords: vec2<f32>,
#endif
#ifdef USE_TEXTURE_COORDS_1
@location(3) fragTextureCoords1: vec2<f32>,
#endif
#ifdef USE_COLOR
@location(4) fragColor: vec4<f32>,
#endif
#ifdef USE_TANGENT
@location(5) fragTangent: vec4<f32>, /* world space */
#endif
#ifdef USE_OBJECT_ID
@location(6) @interpolate(flat) fragObjectId: u32,
#endif
#ifdef USE_MATERIAL_ID
@location(7) @interpolate(flat) fragMaterialId: u32,
#endif
#ifdef USE_NORMAL
@location(8) fragNormal: vec3<f32>, /* world space */
#endif
#ifdef USE_BARYCENTRIC
@location(9) fragBarycentric: vec3<f32>,
#endif
#ifdef USE_PARTICLE_INSTANCE_DATA
@location(10) @interpolate(flat) fragParticleInstanceData: vec4<f32>,
#endif
#ifdef USE_PARTICLE_LIFETIME
@location(11) @interpolate(flat) fragParticleLifetime: vec2<f32>,
#endif
#ifdef MESHLETS
@location(12) @interpolate(flat) fragMeshletId: u32,
#endif
