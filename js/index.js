/**
 * /!\ Registered components for Wonderland Engine application
 */

/* wle:auto-imports:start */
import {FixedFoveation} from '@wonderlandengine/components';
import {OrbitalCamera} from '@wonderlandengine/components';
import {WasdControlsComponent} from '@wonderlandengine/components';
import {StatsHtmlComponent} from 'wle-stats';
import {CustomAudioManager} from './custom-audio-manager.js';
import {CustomAudioSource} from './custom-audio-source.js';
import {DayNightCycleComponent} from './day-night-cycle.js';
import {LodTerrainComponent} from './lod-terrain.js';
/* wle:auto-imports:end */

export default function(engine) {
/* wle:auto-register:start */
engine.registerComponent(FixedFoveation);
engine.registerComponent(OrbitalCamera);
engine.registerComponent(WasdControlsComponent);
engine.registerComponent(StatsHtmlComponent);
engine.registerComponent(CustomAudioManager);
engine.registerComponent(CustomAudioSource);
engine.registerComponent(DayNightCycleComponent);
engine.registerComponent(LodTerrainComponent);
/* wle:auto-register:end */
}
