import { Component, Property, Object3D } from '@wonderlandengine/api';
import { vec3 } from 'gl-matrix';
import type { CustomAudioManager } from './custom-audio-manager.ts';

const PANNING_MODELS: DistanceModelType[] = ['HRTF', 'equalpower'] as unknown as DistanceModelType[];
const DISTANCE_MODELS: DistanceModelType[] = ['inverse', 'linear', 'exponential'] as unknown as DistanceModelType[];

/**
 * CustomAudioSource Component (Strict TypeScript)
 *
 * Attaches to any Object3D and continuously streams 3D spatialized audio
 * to the CustomAudioManager using Web Audio API HRTF panner nodes.
 */
export class CustomAudioSource extends Component {
    static TypeName = 'custom-audio-source';
    static Properties = {
        /** Object3D holding the CustomAudioManager component */
        audioManager: Property.object(),
        /** Path/URL to MP3 audio file */
        audioUrl: Property.string(''),
        /** Auto-play on load / unlock */
        autoplay: Property.bool(true),
        /** Loop audio playback */
        loop: Property.bool(true),
        /** Source volume (0.0 to 1.0) */
        volume: Property.float(1.0),
        /** Reference distance for attenuation (meters) */
        refDistance: Property.float(1.0),
        /** Maximum distance for 3D attenuation (meters) */
        maxDistance: Property.float(50.0),
        /** Rolloff factor for attenuation curve */
        rolloffFactor: Property.float(1.0),
        /** Panning algorithm ('HRTF' or 'equalpower') */
        panningModel: Property.enum(['HRTF', 'equalpower'], 'HRTF'),
        /** Distance attenuation model ('inverse', 'linear', 'exponential') */
        distanceModel: Property.enum(['inverse', 'linear', 'exponential'], 'inverse'),
    };

    audioManager!: Object3D | null;
    audioUrl!: string;
    autoplay!: boolean;
    loop!: boolean;
    volume!: number;
    refDistance!: number;
    maxDistance!: number;
    rolloffFactor!: number;
    panningModel!: number;
    distanceModel!: number;

    managerComp: CustomAudioManager | null = null;
    pannerNode: PannerNode | null = null;
    gainNode: GainNode | null = null;
    bufferSource: AudioBufferSourceNode | null = null;
    audioBuffer: AudioBuffer | null = null;
    isPlaying: boolean = false;

    // Pre-allocated static buffers for 0-GC frame updates
    tmpPos: Float32Array = new Float32Array(3);
    tmpQuat: Float32Array = new Float32Array(4);
    tmpForward: Float32Array = new Float32Array(3);

    VEC3_FORWARD: Float32Array = new Float32Array([0, 0, -1]);

    init(): void {
        this.managerComp = null;
        this.pannerNode = null;
        this.gainNode = null;
        this.bufferSource = null;
        this.audioBuffer = null;
        this.isPlaying = false;
    }

    start(): void {
        this._findManager();
        if (this.audioUrl) {
            this.setAudioUrl(this.audioUrl);
        }
    }

    private _findManager(): void {
        if (this.audioManager) {
            this.managerComp = this.audioManager.getComponent(CustomAudioManager as unknown as string) as CustomAudioManager | null;
            if (!this.managerComp) {
                this.managerComp = this.audioManager.getComponent('custom-audio-manager') as CustomAudioManager | null;
            }
        }

        if (!this.managerComp && this.engine.scene) {
            const managerObj: Object3D | undefined = this.engine.scene.findByName('CustomAudioManager')[0];
            if (managerObj) {
                this.managerComp = managerObj.getComponent('custom-audio-manager') as CustomAudioManager | null;
            }
        }

        if (this.managerComp) {
            this.managerComp.registerSource(this);
            this._setupNodes();
        } else {
            console.warn(`CustomAudioSource on '${this.object.name}': CustomAudioManager component not found.`);
        }
    }

    private _setupNodes(): void {
        if (!this.managerComp || !this.managerComp.audioCtx || !this.managerComp.masterGain) return;
        const ctx: AudioContext = this.managerComp.audioCtx;

        this.pannerNode = ctx.createPanner();
        const panningName: PanningModelType = (['HRTF', 'equalpower'][this.panningModel] || 'HRTF') as PanningModelType;
        const distanceName: DistanceModelType = (['inverse', 'linear', 'exponential'][this.distanceModel] || 'inverse') as DistanceModelType;

        this.pannerNode.panningModel = panningName;
        this.pannerNode.distanceModel = distanceName;
        this.pannerNode.refDistance = Math.max(0.01, this.refDistance ?? 1.0);
        this.pannerNode.maxDistance = Math.max(1.0, this.maxDistance ?? 50.0);
        this.pannerNode.rolloffFactor = Math.max(0, this.rolloffFactor ?? 1.0);

        this.gainNode = ctx.createGain();
        this.gainNode.gain.setValueAtTime(this.volume ?? 1.0, ctx.currentTime);

        this.gainNode.connect(this.pannerNode);
        this.pannerNode.connect(this.managerComp.masterGain);
    }

    async setAudioUrl(url: string): Promise<void> {
        this.audioUrl = url;
        if (!url || !this.managerComp) return;

        const buffer: AudioBuffer | null = await this.managerComp.loadBuffer(url);
        if (buffer) {
            this.audioBuffer = buffer;
            if (this.autoplay && (this.managerComp.isUnlocked || this.managerComp.audioCtx?.state === 'running')) {
                this.play();
            }
        }
    }

    play(): void {
        if (!this.audioBuffer || !this.managerComp || !this.managerComp.audioCtx || !this.gainNode) return;
        if (this.isPlaying) this.stop();

        const ctx: AudioContext = this.managerComp.audioCtx;
        this.bufferSource = ctx.createBufferSource();
        this.bufferSource.buffer = this.audioBuffer;
        this.bufferSource.loop = Boolean(this.loop);

        this.bufferSource.connect(this.gainNode);
        this.bufferSource.start(0);
        this.isPlaying = true;

        this.bufferSource.onended = () => {
            if (!this.loop) {
                this.isPlaying = false;
            }
        };
    }

    pause(): void {
        if (this.isPlaying && this.bufferSource) {
            try {
                this.bufferSource.stop();
            } catch (e) {}
            this.isPlaying = false;
        }
    }

    stop(): void {
        if (this.bufferSource) {
            try {
                this.bufferSource.stop();
                this.bufferSource.disconnect();
            } catch (e) {}
            this.bufferSource = null;
        }
        this.isPlaying = false;
    }

    setVolume(vol: number): void {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.gainNode && this.managerComp?.audioCtx) {
            this.gainNode.gain.setTargetAtTime(this.volume, this.managerComp.audioCtx.currentTime, 0.02);
        }
    }

    update(dt: number): void {
        if (!this.pannerNode || !this.managerComp?.audioCtx) return;

        const ctx: AudioContext = this.managerComp.audioCtx;
        const now: number = ctx.currentTime;

        this.object.getPositionWorld(this.tmpPos);
        this.object.getRotationWorld(this.tmpQuat);
        vec3.transformQuat(this.tmpForward, this.VEC3_FORWARD, this.tmpQuat);

        if (this.pannerNode.positionX) {
            this.pannerNode.positionX.setTargetAtTime(this.tmpPos[0], now, 0.01);
            this.pannerNode.positionY.setTargetAtTime(this.tmpPos[1], now, 0.01);
            this.pannerNode.positionZ.setTargetAtTime(this.tmpPos[2], now, 0.01);

            this.pannerNode.orientationX.setTargetAtTime(this.tmpForward[0], now, 0.01);
            this.pannerNode.orientationY.setTargetAtTime(this.tmpForward[1], now, 0.01);
            this.pannerNode.orientationZ.setTargetAtTime(this.tmpForward[2], now, 0.01);
        } else {
            this.pannerNode.setPosition(this.tmpPos[0], this.tmpPos[1], this.tmpPos[2]);
            this.pannerNode.setOrientation(this.tmpForward[0], this.tmpForward[1], this.tmpForward[2]);
        }
    }

    onDestroy(): void {
        this.stop();
        if (this.managerComp) {
            this.managerComp.unregisterSource(this);
        }
        if (this.pannerNode) {
            try {
                this.pannerNode.disconnect();
            } catch (e) {}
        }
        if (this.gainNode) {
            try {
                this.gainNode.disconnect();
            } catch (e) {}
        }
    }
}
