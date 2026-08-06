#ifdef USE_POSITION_WORLD
in highp vec3 fragPositionWorld;
#endif
#ifdef USE_POSITION_VIEW
in highp vec3 fragPositionView;
#endif
#ifdef USE_TEXTURE_COORDS
in highp vec2 fragTextureCoords;
#endif
#ifdef USE_TEXTURE_COORDS_1
in highp vec2 fragTextureCoords1;
#endif
#ifdef USE_COLOR
in mediump vec4 fragColor;
#endif
#ifdef USE_TANGENT
in mediump vec4 fragTangent; /* world space */
#endif
#ifdef USE_OBJECT_ID
flat in mediump uint fragObjectId;
#endif
#ifdef USE_MATERIAL_ID
flat in mediump uint fragMaterialId;
#endif
#ifdef USE_NORMAL
in mediump vec3 fragNormal; /* world space */
#endif
#ifdef USE_NORMAL_VIEW
in mediump vec3 fragNormalView;
#endif
#ifdef USE_PARTICLE_INSTANCE_DATA
flat in highp vec4 fragParticleInstanceData;
#endif
#ifdef USE_PARTICLE_LIFETIME
flat in highp vec2 fragParticleLifetime;
#endif
#ifdef USE_BARYCENTRIC
in mediump vec3 fragBarycentric;
#endif
#ifdef MESHLETS
flat in highp uint fragMeshletId;
#endif
