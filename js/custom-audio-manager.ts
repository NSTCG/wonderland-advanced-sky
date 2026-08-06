import { Component, property, Object3D } from '@wonderlandengine/api';
import { vec3 } from 'gl-matrix';
import type { CustomAudioSource } from './custom-audio-source.ts';

/**
 * CustomAudioManager Component (TypeScript with @property decorators)
 *
 * High-performance, 0-GC Web Audio 3D Spatial Listener & Buffer Manager.
 * Seamlessly tracks Non-VR or WebXR VR camera in 3D space.
 */
export class CustomAudioManager extends Component {
    static TypeName = 'custom-audio-manager';

    /** Non-VR Camera Object3D */
    @property.object()
    nonVRCamera!: Object3D | null;

    /** WebXR VR Camera Object3D */
    @property.object()
    vrCamera!: Object3D | null;

    /** Global Master Volume (0.0 to 1.0) */
    @property.float(1.0)
    masterVolume: number = 1.0;

    audioCtx: AudioContext | null = null;
    masterGain: GainNode | null = null;
    bufferCache: Map<string, AudioBuffer> = new Map();
    pendingRequests: Map<string, Promise<AudioBuffer | null>> = new Map();
    registeredSources: Set<CustomAudioSource> = new Set();
    isUnlocked: boolean = false;

    // Pre-allocated static buffers for 0-GC frame updates
    tmpPos: Float32Array = new Float32Array(3);
    tmpQuat: Float32Array = new Float32Array(4);
    tmpForward: Float32Array = new Float32Array(3);
    tmpUp: Float32Array = new Float32Array(3);

    VEC3_FORWARD: Float32Array = new Float32Array([0, 0, -1]);
    VEC3_UP: Float32Array = new Float32Array([0, 1, 0]);

    init(): void {
        this.audioCtx = null;
        this.masterGain = null;
        this.bufferCache = new Map();
        this.pendingRequests = new Map();
        this.registeredSources = new Set();
        this.isUnlocked = false;

        this._initAudioContext();
    }

    start(): void {
        this._setupAudioUnlockListeners();
    }

    private _initAudioContext(): void {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
            console.warn('CustomAudioManager: Web Audio API is not supported in this browser.');
            return;
        }

        this.audioCtx = new AudioCtx();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume ?? 1.0, this.audioCtx.currentTime);
        this.masterGain.connect(this.audioCtx.destination);
    }

    private _setupAudioUnlockListeners(): void {
        const unlock = () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().then(() => {
                    this.isUnlocked = true;
                    for (const source of this.registeredSources) {
                        if (source.autoplay && !source.isPlaying) {
                            source.play();
                        }
                    }
                });
            } else {
                this.isUnlocked = true;
            }

            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
    }

    /**
     * Load & decode MP3 audio file with automatic caching.
     */
    async loadBuffer(url: string): Promise<AudioBuffer | null> {
        if (!url) return null;
        if (!this.audioCtx) return null;

        if (this.bufferCache.has(url)) {
            return this.bufferCache.get(url)!;
        }

        if (this.pendingRequests.has(url)) {
            return this.pendingRequests.get(url)!;
        }

        const loadPromise = (async (): Promise<AudioBuffer | null> => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioCtx!.decodeAudioData(arrayBuffer);
                this.bufferCache.set(url, audioBuffer);
                this.pendingRequests.delete(url);
                return audioBuffer;
            } catch (err) {
                console.error(`CustomAudioManager: Failed to load audio MP3 from '${url}':`, err);
                this.pendingRequests.delete(url);
                return null;
            }
        })();

        this.pendingRequests.set(url, loadPromise);
        return loadPromise;
    }

    registerSource(source: CustomAudioSource): void {
        this.registeredSources.add(source);
    }

    unregisterSource(source: CustomAudioSource): void {
        this.registeredSources.delete(source);
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain && this.audioCtx) {
            this.masterGain.gain.setTargetAtTime(this.masterVolume, this.audioCtx.currentTime, 0.02);
        }
    }

    update(dt: number): void {
        if (!this.audioCtx || !this.audioCtx.listener) return;

        const isVR = Boolean(this.engine.xr && this.engine.xr.session);
        const activeCamera: Object3D | null = (isVR && this.vrCamera) ? this.vrCamera : (this.nonVRCamera || this.object);

        if (!activeCamera) return;

        activeCamera.getPositionWorld(this.tmpPos);
        activeCamera.getRotationWorld(this.tmpQuat);

        vec3.transformQuat(this.tmpForward, this.VEC3_FORWARD, this.tmpQuat);
        vec3.transformQuat(this.tmpUp, this.VEC3_UP, this.tmpQuat);

        const listener = this.audioCtx.listener;
        const now = this.audioCtx.currentTime;

        if (listener.positionX) {
            listener.positionX.setTargetAtTime(this.tmpPos[0], now, 0.01);
            listener.positionY.setTargetAtTime(this.tmpPos[1], now, 0.01);
            listener.positionZ.setTargetAtTime(this.tmpPos[2], now, 0.01);

            listener.forwardX.setTargetAtTime(this.tmpForward[0], now, 0.01);
            listener.forwardY.setTargetAtTime(this.tmpForward[1], now, 0.01);
            listener.forwardZ.setTargetAtTime(this.tmpForward[2], now, 0.01);

            listener.upX.setTargetAtTime(this.tmpUp[0], now, 0.01);
            listener.upY.setTargetAtTime(this.tmpUp[1], now, 0.01);
            listener.upZ.setTargetAtTime(this.tmpUp[2], now, 0.01);
        } else {
            listener.setPosition(this.tmpPos[0], this.tmpPos[1], this.tmpPos[2]);
            listener.setOrientation(
                this.tmpForward[0], this.tmpForward[1], this.tmpForward[2],
                this.tmpUp[0], this.tmpUp[1], this.tmpUp[2]
            );
        }
    }
}
