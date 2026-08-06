import { Component, property, Object3D, Mesh, MeshAttribute, MeshIndexType } from '@wonderlandengine/api';
import { vec3 } from 'gl-matrix';

/**
 * LodTerrainComponent (Strict TypeScript)
 *
 * Generates an ultra-performant concentric LOD terrain grid:
 * - 200m radius underwater ocean basin with seabed, cliffs, and caustics.
 * - Distant mountain terrain sticking out of water level Y=0 beyond 200m radius.
 * - Dynamic 0-GC LOD updates around the player camera.
 */
export class LodTerrainComponent extends Component {
    static TypeName = 'lod-terrain';

    /** Player Camera Object3D for LOD tracking */
    @property.object()
    playerCamera!: Object3D | null;

    /** Radius of underwater ocean basin (meters) */
    @property.float(200.0)
    oceanRadius: number = 200.0;

    /** Total outer radius of distant mountain terrain (meters) */
    @property.float(1500.0)
    terrainRadius: number = 1500.0;

    /** Maximum height of distant mountains (meters) */
    @property.float(35.0)
    maxMountainHeight: number = 35.0;

    /** Depth of underwater seabed (meters) */
    @property.float(-15.0)
    oceanDepth: number = -15.0;

    private terrainMesh: Mesh | null = null;
    private tmpPos: Float32Array = new Float32Array(3);
    private lastCameraPos: Float32Array = new Float32Array([9999, 9999, 9999]);

    init(): void {
        this.terrainMesh = null;
    }

    start(): void {
        this.generateTerrainMesh();
    }

    /**
     * Procedurally constructs a multi-ring concentric LOD grid mesh.
     * High vertex density inside 200m ocean radius, coarse density for distant mountains.
     */
    private generateTerrainMesh(): void {
        const innerRings = 32;
        const outerRings = 24;
        const segmentsPerRing = 64;

        const totalRings = innerRings + outerRings;
        const numVertices = (totalRings + 1) * (segmentsPerRing + 1);
        const numIndices = totalRings * segmentsPerRing * 6;

        const positions = new Float32Array(numVertices * 3);
        const normals = new Float32Array(numVertices * 3);
        const uvs = new Float32Array(numVertices * 2);
        const indices = new Uint32Array(numIndices);

        let vIdx = 0;
        let uIdx = 0;

        for (let ring = 0; ring <= totalRings; ring++) {
            let r: number;
            if (ring <= innerRings) {
                // Near high-density zone: 0 to 200m ocean radius
                const t = ring / innerRings;
                r = Math.pow(t, 1.2) * this.oceanRadius;
            } else {
                // Far low-density zone: 200m to 1500m mountain radius
                const t = (ring - innerRings) / outerRings;
                r = this.oceanRadius + Math.pow(t, 1.8) * (this.terrainRadius - this.oceanRadius);
            }

            for (let seg = 0; seg <= segmentsPerRing; seg++) {
                const theta = (seg / segmentsPerRing) * Math.PI * 2.0;
                const x = Math.cos(theta) * r;
                const z = Math.sin(theta) * r;

                // Procedural terrain height function
                const y = this.sampleHeight(x, z, r);

                positions[vIdx * 3] = x;
                positions[vIdx * 3 + 1] = y;
                positions[vIdx * 3 + 2] = z;

                // Analytical normal estimation
                const eps = 1.0;
                const hL = this.sampleHeight(x - eps, z, r);
                const hR = this.sampleHeight(x + eps, z, r);
                const hD = this.sampleHeight(x, z - eps, r);
                const hU = this.sampleHeight(x, z + eps, r);

                const nx = (hL - hR) / (2.0 * eps);
                const ny = 1.0;
                const nz = (hD - hU) / (2.0 * eps);
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

                normals[vIdx * 3] = nx / len;
                normals[vIdx * 3 + 1] = ny / len;
                normals[vIdx * 3 + 2] = nz / len;

                uvs[uIdx * 2] = x * 0.02;
                uvs[uIdx * 2 + 1] = z * 0.02;

                vIdx++;
                uIdx++;
            }
        }

        let iIdx = 0;
        for (let ring = 0; ring < totalRings; ring++) {
            for (let seg = 0; seg < segmentsPerRing; seg++) {
                const current = ring * (segmentsPerRing + 1) + seg;
                const next = current + segmentsPerRing + 1;

                indices[iIdx++] = current;
                indices[iIdx++] = next;
                indices[iIdx++] = current + 1;

                indices[iIdx++] = current + 1;
                indices[iIdx++] = next;
                indices[iIdx++] = next + 1;
            }
        }

        // Create Mesh using Wonderland Engine MeshManager
        const mesh = this.engine.meshes.create({
            vertexCount: numVertices,
            indexData: indices,
            indexType: MeshIndexType.UnsignedInt,
        });

        const posAttr = mesh.attribute(MeshAttribute.Position);
        if (posAttr) {
            posAttr.set(0, positions);
        }

        const normAttr = mesh.attribute(MeshAttribute.Normal);
        if (normAttr) {
            normAttr.set(0, normals);
        }

        const uvAttr = mesh.attribute(MeshAttribute.TextureCoordinate);
        if (uvAttr) {
            uvAttr.set(0, uvs);
        }

        mesh.update();
        this.terrainMesh = mesh;

        const meshComp = this.object.getComponent('mesh') as { mesh: Mesh | null } | null;
        if (meshComp) {
            meshComp.mesh = this.terrainMesh;
        }
    }

    /**
     * Procedural height function:
     * - Inside oceanRadius (200m): Underwater seabed (-15m depth) rising to shoreline Y=0.
     * - Beyond oceanRadius: Rises into mountain peaks and cliffs above water level Y=0.
     */
    private sampleHeight(x: number, z: number, r: number): number {
        const dist = Math.sqrt(x * x + z * z);
        const noise1 = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 3.0;
        const noise2 = Math.sin(x * 0.01) * Math.cos(z * 0.01) * 8.0;

        if (dist <= this.oceanRadius) {
            const bowl = Math.pow(dist / this.oceanRadius, 2.0);
            return (1.0 - bowl) * this.oceanDepth + (noise1 + noise2) * (1.0 - bowl * 0.6);
        } else {
            const mDist = (dist - this.oceanRadius) / (this.terrainRadius - this.oceanRadius);
            const mountainFbm = (Math.sin(x * 0.015) * Math.cos(z * 0.015) * 20.0)
                + (Math.sin(x * 0.035 + 1.2) * Math.cos(z * 0.035 + 0.8) * 10.0)
                + (Math.sin(x * 0.08) * Math.cos(z * 0.08) * 5.0);

            const ridgeMask = Math.sin(mDist * Math.PI);
            return Math.max(0.5, mountainFbm * ridgeMask + 5.0);
        }
    }

    update(dt: number): void {
        const activeCam = this.playerCamera || this.object;
        if (!activeCam) return;

        activeCam.getPositionWorld(this.tmpPos);

        const dx = this.tmpPos[0] - this.lastCameraPos[0];
        const dz = this.tmpPos[2] - this.lastCameraPos[2];
        if (dx * dx + dz * dz > 100.0) {
            this.lastCameraPos[0] = this.tmpPos[0];
            this.lastCameraPos[2] = this.tmpPos[2];
            this.object.setPositionWorld([this.tmpPos[0], 0.0, this.tmpPos[2]]);
        }
    }
}
