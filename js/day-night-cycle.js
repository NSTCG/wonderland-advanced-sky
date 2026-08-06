import {Component, Property} from '@wonderlandengine/api';
import {quat} from 'gl-matrix';

/**
 * DayNightCycleComponent
 * 
 * Manages celestial trajectory and state:
 * - Default 30° Y/Z tilt
 * - Day cycle: 90° (Sunrise) -> -90° (Sunset) around X-axis
 * - Night cycle: -90° (Moonrise) -> 90° (Moonset) around X-axis
 * - Seamless light color and intensity blending at horizon transition points
 */
export class DayNightCycleComponent extends Component {
    static TypeName = 'day-night-cycle';
    static Properties = {
        dayDuration: Property.float(60.0),   /* Duration in seconds of a full day/night cycle */
        tiltAngleDeg: Property.float(30.0),  /* Y-tilt angle in degrees (default 30°) */
    };

    init() {
        this.time = 0;
        this.loopTime = -5.0;
        this.lightComp = null;
    }

    start() {
        this.lightComp = this.object.getComponent('light');
    }

    update(dt) {
        this.time += dt;
        const totalDuration = Math.max(1.0, this.dayDuration);
        const cycleProgress = (this.time % totalDuration) / totalDuration; // 0.0 to 1.0
        const isNight = cycleProgress >= 0.5;

        let xDeg = 0.0;
        if (!isNight) {
            // DAY CYCLE: 90° (Sunrise) to -90° (Sunset)
            const tDay = cycleProgress / 0.5; // 0.0 to 1.0
            xDeg = 90.0 - tDay * 180.0;
        } else {
            // NIGHT CYCLE: -90° (Moonrise) to 90° (Moonset)
            const tNight = (cycleProgress - 0.5) / 0.5; // 0.0 to 1.0
            xDeg = -90.0 + tNight * 180.0;
        }

        // Apply rotation: X = xDeg, Y = 30° tilt, Z = 0
        const xRad = (xDeg * Math.PI) / 180.0;
        const yRad = (this.tiltAngleDeg * Math.PI) / 180.0;

        const q = quat.create();
        quat.rotateY(q, q, yRad);
        quat.rotateX(q, q, xRad);
        this.object.setRotationLocal(q);

        // Smooth time loop between -5.0 and 5.0 for continuous wave/cloud shader animation
        const timeSpeed = 1.0;
        const loopSpan = 10.0;
        this.loopTime = -5.0 + ((this.time * timeSpeed) % loopSpan);

        // Calculate elevation above horizon (0.0 at horizon ±90°, 1.0 at zenith 0°)
        const elevation = Math.cos(xRad);

        // Encode state into object's position (read in shaders via lightPositionsWorld[0]):
        // x: 0.0 = Day, 1.0 = Night
        // y: loopTime (-5.0 to 5.0)
        // z: elevation parameter (0.0 to 1.0)
        const posX = isNight ? 1.0 : 0.0;
        const posY = this.loopTime;
        const posZ = elevation;
        this.object.setPositionLocal([posX, posY, posZ]);

        // Dynamically update attached Light component color & intensity
        if (this.lightComp) {
            if (!isNight) {
                // DAY LIGHT COLOR & INTENSITY
                if (elevation < 0.25) {
                    // Sunset / Sunrise: warm crimson / coral / golden amber
                    const t = elevation / 0.25;
                    const r = 1.0;
                    const g = 0.35 + 0.57 * t;
                    const b = 0.15 + 0.65 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.6 + 0.6 * t;
                } else {
                    // Noon / Bright Day: warm white daylight
                    const t = (elevation - 0.25) / 0.75;
                    const r = 1.0 - 0.05 * t;
                    const g = 0.92 + 0.05 * t;
                    const b = 0.80 + 0.18 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 1.2 + 0.3 * t;
                }
            } else {
                // NIGHT LIGHT COLOR & INTENSITY
                if (elevation < 0.25) {
                    // Moonrise / Moonset horizon: matches sunset coral transition smoothly
                    const t = elevation / 0.25;
                    const r = 1.0 - 0.85 * t;
                    const g = 0.35 - 0.10 * t;
                    const b = 0.15 + 0.55 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.6 - 0.25 * t;
                } else {
                    // Midnight blueish moon color palette
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
