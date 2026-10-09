import * as THREE from 'three';

export {
  MenuOverlay,
  Overlay,
  clamp,
  formatTime,
  gameAudio,
  useAutoFocus,
  useIsMobile,
  type GamePhase,
  type GameState,
  type MusicTrack,
} from './utils/helper';

export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function toVec3(v: {x: number; y: number; z: number}): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: v.x,
    y: v.y,
    z: v.z,
  };
}

export function toQuat(q: {x: number; y: number; z: number; w: number}): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return {
    x: q.x,
    y: q.y,
    z: q.z,
    w: q.w,
  };
}

export const tempVec3 = new THREE.Vector3();
export const tempVec3B = new THREE.Vector3();
export const tempQuat = new THREE.Quaternion();
export const tempMatrix = new THREE.Matrix4();
export const tempEuler = new THREE.Euler();
