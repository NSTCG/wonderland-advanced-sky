/**
 * /!\ Registered components for Wonderland Engine application
 */

/* wle:auto-imports:start */
import {FixedFoveation} from '@wonderlandengine/components';
import {OrbitalCamera} from '@wonderlandengine/components';
import {WasdControlsComponent} from '@wonderlandengine/components';
import {StatsHtmlComponent} from 'wle-stats';
import {DayNightCycleComponent} from './day-night-cycle.js';
/* wle:auto-imports:end */

export default function(engine) {
/* wle:auto-register:start */
engine.registerComponent(FixedFoveation);
engine.registerComponent(OrbitalCamera);
engine.registerComponent(WasdControlsComponent);
engine.registerComponent(StatsHtmlComponent);
engine.registerComponent(DayNightCycleComponent);
/* wle:auto-register:end */
}
