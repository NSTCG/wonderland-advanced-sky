import { Component, property, LightComponent } from '@wonderlandengine/api';
import { quat } from 'gl-matrix';

/**
 * DayNightCycleComponent (TypeScript with @property decorators)
 *
 * Manages celestial trajectory and state:
 * - Default 30° Y/Z tilt
 * - Day cycle: 90° (Sunrise) -> -90° (Sunset) around X-axis
 * - Night cycle: -90° (Moonrise) -> 90° (Moonset) around X-axis
 * - Seamless light color and intensity blending at horizon transition points
 */
export class DayNightCycleComponent extends Component {
    static TypeName = 'day-night-cycle';

    /** Duration in seconds of a full day/night cycle */
    @property.float(60.0)
    dayDuration: number = 60.0;

    /** Y-tilt angle in degrees (default 30°) */
    @property.float(30.0)
    tiltAngleDeg: number = 30.0;

    time: number = 0;
    loopTime: number = -5.0;
    lightComp: LightComponent | null = null;

    init(): void {
        this.time = 0;
        this.loopTime = -5.0;
        this.lightComp = null;
    }

    start(): void {
        this.lightComp = this.object.getComponent('light') as LightComponent | null;
    }

    update(dt: number): void {
        this.time += dt;
        const totalDuration = Math.max(1.0, this.dayDuration);
        const cycleProgress = (this.time % totalDuration) / totalDuration;
        const isNight = cycleProgress >= 0.5;

        let xDeg = 0.0;
        if (!isNight) {
            // DAY CYCLE: 90° (Sunrise) to -90° (Sunset)
            const tDay = cycleProgress / 0.5;
            xDeg = 90.0 - tDay * 180.0;
        } else {
            // NIGHT CYCLE: -90° (Moonrise) to 90° (Moonset)
            const tNight = (cycleProgress - 0.5) / 0.5;
            xDeg = -90.0 + tNight * 180.0;
        }

        const xRad = (xDeg * Math.PI) / 180.0;
        const yRad = (this.tiltAngleDeg * Math.PI) / 180.0;

        const q = quat.create();
        quat.rotateY(q, q, yRad);
        quat.rotateX(q, q, xRad);
        this.object.setRotationLocal(q);

        this.loopTime = this.time;
        const elevation = Math.cos(xRad);

        const posX = isNight ? 1.0 : 0.0;
        const posY = this.loopTime;
        const posZ = elevation;
        this.object.setPositionLocal([posX, posY, posZ]);

        if (this.lightComp) {
            if (!isNight) {
                if (elevation < 0.25) {
                    const t = elevation / 0.25;
                    const r = 1.0;
                    const g = 0.35 + 0.57 * t;
                    const b = 0.15 + 0.65 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.6 + 0.6 * t;
                } else {
                    const t = (elevation - 0.25) / 0.75;
                    const r = 1.0 - 0.05 * t;
                    const g = 0.92 + 0.05 * t;
                    const b = 0.80 + 0.18 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 1.2 + 0.3 * t;
                }
            } else {
                if (elevation < 0.25) {
                    const t = elevation / 0.25;
                    const r = 1.0 - 0.85 * t;
                    const g = 0.35 - 0.10 * t;
                    const b = 0.15 + 0.55 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.6 - 0.25 * t;
                } else {
                    const t = (elevation - 0.25) / 0.75;
                    const r = 0.15 - 0.03 * t;
                    const g = 0.25 + 0.15 * t;
                    const b = 0.70 + 0.25 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.35 + 0.15 * t;
                }
            }
        }
    }
}
