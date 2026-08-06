import {Component, Property} from '@wonderlandengine/api';
import {quat} from 'gl-matrix';

/**
 * DayNightCycleComponent
 * 
 * Controls orbital rotation, day/night state, animation time loop,
 * and dynamic light color/intensity changes for Wonderland Engine.
 */
export class DayNightCycleComponent extends Component {
    static TypeName = 'day-night-cycle';
    static Properties = {
        dayDuration: Property.float(60.0),   /* Duration in seconds of a full day/night cycle */
        tiltAngleDeg: Property.float(50.0),  /* Z-axis tilt angle in degrees to avoid top-down shadows */
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

        // Angle for celestial rotation around X-axis (0 to PI for Day, 0 to PI for Night)
        let angleRad = 0;
        if (!isNight) {
            // Day cycle: 0 to 180 degrees (0 to PI)
            angleRad = (cycleProgress / 0.5) * Math.PI;
        } else {
            // Night cycle: rotates back 0 to 180 degrees (0 to PI)
            angleRad = ((cycleProgress - 0.5) / 0.5) * Math.PI;
        }

        // Apply 50 deg tilt on Z-axis + orbital rotation around X-axis
        const tiltRad = (this.tiltAngleDeg * Math.PI) / 180.0;
        const q = quat.create();
        quat.rotateZ(q, q, tiltRad);
        quat.rotateX(q, q, isNight ? -angleRad : angleRad);
        this.object.setRotationLocal(q);

        // Smooth time loop between -5.0 and 5.0 for shader animation (waves/clouds/stars)
        const timeSpeed = 1.0;
        const loopSpan = 10.0; // range from -5.0 to 5.0
        this.loopTime = -5.0 + ((this.time * timeSpeed) % loopSpan);

        // Encode state into object's position (fetched in shaders via lightPositionsWorld[0]):
        // x: 0.0 = Day, 1.0 = Night
        // y: loopTime (-5.0 to 5.0)
        // z: elevation parameter sin(angleRad)
        const posX = isNight ? 1.0 : 0.0;
        const posY = this.loopTime;
        const posZ = Math.sin(angleRad);
        this.object.setPositionLocal([posX, posY, posZ]);

        // Dynamically update attached Light component color & intensity
        if (this.lightComp) {
            const elevation = Math.sin(angleRad); // 0 at horizon, 1 at zenith
            if (!isNight) {
                // DAY CYCLE
                if (elevation < 0.3) {
                    // Sunset / Sunrise: warm red / coral / golden amber
                    const t = elevation / 0.3;
                    const r = 1.0;
                    const g = 0.35 + 0.55 * t;
                    const b = 0.15 + 0.65 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 0.6 + 0.6 * t;
                } else {
                    // Noon / Bright Day: bright warm white / light blue sky light
                    const t = (elevation - 0.3) / 0.7;
                    const r = 1.0 - 0.05 * t;
                    const g = 0.92 + 0.05 * t;
                    const b = 0.8 + 0.18 * t;
                    this.lightComp.color = [r, g, b];
                    this.lightComp.intensity = 1.2 + 0.3 * t;
                }
            } else {
                // NIGHT CYCLE: Midnight blueish moon color palette
                const t = elevation;
                const r = 0.12 + 0.08 * (1.0 - t);
                const g = 0.22 + 0.18 * t;
                const b = 0.60 + 0.35 * t;
                this.lightComp.color = [r, g, b];
                this.lightComp.intensity = 0.3 + 0.2 * t;
            }
        }
    }
}
