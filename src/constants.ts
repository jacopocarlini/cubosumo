import {MusicTrack} from './utils/helper';

/** Game configuration schema. */
export const CONFIG = {
  // --- Game ---
  title: {
    value: 'Sumo Cubes 3D',
    type: 'string',
    label: 'Game Title',
    group: 'Game',
  },
  baseCanvasWidth: {
    value: 1280,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'Game',
  },
  baseCanvasHeight: {
    value: 720,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'Game',
  },

  // --- Arena & Shrinking Mechanics ---
  initialRingWidth: {
    value: 20,
    type: 'number',
    label: 'Initial Ring Width',
    group: 'Arena',
    min: 14,
    max: 28,
    step: 1,
  },
  initialRingLength: {
    value: 26,
    type: 'number',
    label: 'Initial Ring Length',
    group: 'Arena',
    min: 18,
    max: 36,
    step: 1,
  },
  minRingSize: {
    value: 0,
    type: 'number',
    label: 'Minimum Ring Size',
    group: 'Arena',
    min: 0,
    max: 8,
    step: 0.5,
  },
  shrinkSpeed: {
    value: 0.32,
    type: 'number',
    label: 'Ring Shrink Speed',
    group: 'Arena',
    min: 0.1,
    max: 1.0,
    step: 0.05,
  },

  // --- Player & Movement ---
  playerSpeed: {
    value: 9.5,
    type: 'number',
    label: 'Player Speed',
    group: 'Physics',
    min: 5,
    max: 15,
    step: 0.5,
  },
  jumpVelocity: {
    value: 18.5,
    type: 'number',
    label: 'Jump Velocity',
    group: 'Physics',
    min: 6,
    max: 22,
    step: 0.5,
  },

  // --- Stamina & Exhaustion ---
  maxStamina: {
    value: 100,
    type: 'number',
    label: 'Max Stamina',
    group: 'Rules',
  },
  staminaJumpCost: {
    value: 18,
    type: 'number',
    label: 'Jump Stamina Cost',
    group: 'Rules',
  },
  staminaSumoPushCost: {
    value: 40,
    type: 'number',
    label: 'Sumo Push Stamina Cost',
    group: 'Rules',
  },
  staminaMoveDrainPerSec: {
    value: 8,
    type: 'number',
    label: 'Move Drain / Sec',
    group: 'Rules',
  },
  staminaRegenPerSec: {
    value: 30,
    type: 'number',
    label: 'Stamina Regen / Sec',
    group: 'Rules',
  },
  exhaustionDuration: {
    value: 2.0,
    type: 'number',
    label: 'Exhaustion Duration (s)',
    group: 'Rules',
    min: 0.5,
    max: 5.0,
    step: 0.1,
  },
  exhaustionSpeedMultiplier: {
    value: 0.2,
    type: 'number',
    label: 'Exhaustion Speed Multiplier',
    group: 'Rules',
  },
  normalMaxPushSpeed: {
    value: 18,
    type: 'number',
    label: 'Normal Max Push Speed (m/s)',
    group: 'Rules',
  },
  exhaustedPushSpeed: {
    value: 26,
    type: 'number',
    label: 'Exhausted Push Speed (m/s)',
    group: 'Rules',
  },

  // --- AI Tuning (Slightly Slower / Nerfed) ---
  aiSpeedRatio: {
    value: 0.48,
    type: 'number',
    label: 'AI Speed Relative to Player',
    group: 'Rules',
  },

  // --- Camera ---
  fov: {
    value: 55,
    type: 'number',
    label: 'Field of View',
    group: 'Camera',
    min: 35,
    max: 85,
    step: 5,
  },
  cameraX: {
    value: 0,
    type: 'number',
    label: 'Camera X',
    group: 'Camera',
  },
  cameraY: {
    value: 20,
    type: 'number',
    label: 'Camera Y',
    group: 'Camera',
  },
  cameraZ: {
    value: 20,
    type: 'number',
    label: 'Camera Z',
    group: 'Camera',
  },

  // --- Visuals & Lighting ---
  backgroundColor: {
    value: '#120d1c',
    type: 'color',
    label: 'Background Color',
    group: 'Visuals',
  },
  ambientColor: {
    value: '#eeddff',
    type: 'color',
    label: 'Ambient Light Color',
    group: 'Visuals',
  },
  ambientIntensity: {
    value: 1.6,
    type: 'number',
    label: 'Ambient Intensity',
    group: 'Visuals',
    min: 0,
    max: 5,
    step: 0.1,
  },
  sunColor: {
    value: '#fff5ea',
    type: 'color',
    label: 'Sun Color',
    group: 'Visuals',
  },
  sunIntensity: {
    value: 3.6,
    type: 'number',
    label: 'Sun Intensity',
    group: 'Visuals',
    min: 0,
    max: 10,
    step: 0.1,
  },
  hemiSkyColor: {
    value: '#f59e0b',
    type: 'color',
    label: 'Hemisphere Sky Color',
    group: 'Visuals',
  },
  hemiGroundColor: {
    value: '#581c87',
    type: 'color',
    label: 'Hemisphere Ground Color',
    group: 'Visuals',
  },
  hemiIntensity: {
    value: 0.7,
    type: 'number',
    label: 'Hemisphere Intensity',
    group: 'Visuals',
    min: 0,
    max: 2,
    step: 0.1,
  },

  // --- Physics System ---
  gravity: {
    value: -32,
    type: 'number',
    label: 'Gravity',
    group: 'Physics',
    min: -40,
    max: -5,
    step: 1,
  },
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'System',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'System',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'System',
  },

  // --- Audio ---
  backgroundMusicUrl: {
    value: 'https://storage.googleapis.com/assets-gen-playground/musiclibrary/stadium_rush.mp3',
    type: 'string',
    label: 'Background Music URL',
    group: 'Audio',
  },
};

// Merge customized config values if present (injected by Playground)
const {playgroundConfig} = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/** Type helper for reading values in game code. */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}

/** Optional presets for the game. */
export const PRESETS = {};

/** Background music tracks available for the game to use. */
export const AVAILABLE_MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    name: 'stadium_rush',
    url: 'https://storage.googleapis.com/assets-gen-playground/musiclibrary/stadium_rush.mp3',
    description: 'High-energy stadium anthem with stomp-claps, guitar and brass, 140 BPM. Perfect for sumo combat.',
  },
  {
    name: 'titan_clash',
    url: 'https://storage.googleapis.com/assets-gen-playground/musiclibrary/titan_clash.mp3',
    description: 'Epic orchestral battle music with war drums and brass.',
  },
  {
    name: 'zen_garden',
    url: 'https://storage.googleapis.com/assets-gen-playground/musiclibrary/zen_garden.mp3',
    description: 'Tranquil koto, bamboo flute and bells.',
  },
];
