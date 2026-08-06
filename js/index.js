/**
 * /!\ Registered components for Wonderland Engine application
 */

/* wle:auto-imports:start */
import {MouseLookComponent} from '@wonderlandengine/components';
import {WasdControlsComponent} from '@wonderlandengine/components';
import {DayNightCycleComponent} from './day-night-cycle.js';
/* wle:auto-imports:end */

export default function(engine) {
/* wle:auto-register:start */
engine.registerComponent(MouseLookComponent);
engine.registerComponent(WasdControlsComponent);
engine.registerComponent(DayNightCycleComponent);
/* wle:auto-register:end */
}
