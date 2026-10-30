import RAPIER from '@dimforge/rapier3d-compat';
import {getConfig} from '../src/constants.ts';
import type {FighterSnapshot, MatchSnapshot, OnlineInput} from '../src/multiplayer/protocol.ts';

export const STEP = 1 / 60;
export const INPUT_TIMEOUT = 0.5;
export const neutralInput = (): OnlineInput => ({
  left: false, right: false, up: false, down: false, jump: false, push: false,
});

interface Fighter {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  stamina: number;
  exhaustion: number;
  stun: number;
  rejectedActions: number;
  jumps: number;
  jumpCooldown: number;
  input: OnlineInput;
  inputAge: number;
  jumpQueued: boolean;
  pushQueued: boolean;
  lives: number;
}

let initialization: Promise<void> | undefined;
export function initializePhysics() {
  return initialization ??= RAPIER.init();
}

export class Match {
  readonly world: RAPIER.World;
  readonly fighters: [Fighter, Fighter];
  private floor: RAPIER.Collider;
  private floorActive = true;
  private disposed = false;
  phase: MatchSnapshot['phase'] = 'waiting';
  width = getConfig('initialRingWidth');
  length = getConfig('initialRingLength');
  round = 1;
  winner: 0 | 1 | null = null;
  rematch: [boolean, boolean] = [false, false];
  private remaining = 0;

  constructor(readonly code: string) {
    this.world = new RAPIER.World({x: 0, y: getConfig('gravity'), z: 0});
    this.world.timestep = STEP;
    const floorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.floor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.width / 2, 0.5, this.length / 2)
        .setTranslation(0, -0.5, 0).setFriction(0.6).setRestitution(0.1),
      floorBody,
    );
    this.fighters = [this.createFighter(0), this.createFighter(1)];
  }

  private createFighter(seat: 0 | 1): Fighter {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.5, seat === 0 ? 6 : -6)
        .lockRotations().setCcdEnabled(true),
    );
    // Render coordinates are the feet/origin, with the cube centered 0.75m above them.
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.75, 0.75, 0.75)
        .setTranslation(0, 0.75, 0).setMass(2.2).setFriction(0.4).setRestitution(0.2),
      body,
    );
    body.setRotation({x: 0, y: seat === 0 ? 0 : 1, z: 0, w: seat === 0 ? 1 : 0}, true);
    return {
      body, collider, stamina: getConfig('maxStamina'), exhaustion: 0,
      stun: 0, rejectedActions: 0, jumps: 2, jumpCooldown: 0, input: neutralInput(),
      inputAge: Infinity, jumpQueued: false, pushQueued: false, lives: 3,
    };
  }

  start() {
    this.resetRound();
    this.phase = 'countdown';
    this.remaining = 3;
  }

  setInput(seat: 0 | 1, input: OnlineInput) {
    if (this.phase !== 'playing') return;
    const fighter = this.fighters[seat];
    // Latch taps even if a press and release arrive between two simulation ticks.
    fighter.jumpQueued ||= input.jump && !fighter.input.jump;
    fighter.pushQueued ||= input.push && !fighter.input.push;
    fighter.input = {...input};
    fighter.inputAge = 0;
  }

  voteRematch(seat: 0 | 1) {
    if (this.phase !== 'finished') return false;
    this.rematch[seat] = true;
    if (this.rematch.every(Boolean)) {
      this.fighters.forEach(f => { f.lives = 3; });
      this.round = 1;
      this.rematch = [false, false];
      this.start();
    }
    return true;
  }

  private resetRound() {
    this.width = getConfig('initialRingWidth');
    this.length = getConfig('initialRingLength');
    this.floor.setShape(new RAPIER.Cuboid(this.width / 2, 0.5, this.length / 2));
    this.floor.setEnabled(true);
    this.floorActive = true;
    this.winner = null;
    this.fighters.forEach((f, seat) => {
      f.body.setTranslation({x: 0, y: 1.5, z: seat === 0 ? 6 : -6}, true);
      f.body.setLinvel({x: 0, y: 0, z: 0}, true);
      f.body.setAngvel({x: 0, y: 0, z: 0}, true);
      f.body.setRotation({x: 0, y: seat === 0 ? 0 : 1, z: 0, w: seat === 0 ? 1 : 0}, true);
      f.stamina = getConfig('maxStamina');
      f.exhaustion = f.stun = f.jumpCooldown = 0;
      f.rejectedActions = 0;
      f.jumps = 2;
      f.input = neutralInput();
      f.inputAge = Infinity;
      f.jumpQueued = f.pushQueued = false;
    });
  }

  private spend(f: Fighter, cost: number) {
    if (f.exhaustion > 0 || f.stamina < cost) return false;
    f.stamina = Math.max(0, f.stamina - cost);
    if (f.stamina <= 0) f.exhaustion = getConfig('exhaustionDuration');
    return true;
  }

  step() {
    if (this.disposed || this.phase === 'waiting' || this.phase === 'finished') return;
    if (this.phase === 'countdown' || this.phase === 'round-over') {
      this.remaining = Math.max(0, this.remaining - STEP);
      if (this.remaining < 1e-8) {
        if (this.phase === 'round-over') {
          this.round++;
          this.start();
        } else {
          this.phase = 'playing';
          this.remaining = 0;
        }
      }
      return;
    }

    const shrink = getConfig('shrinkSpeed') * (1 + (this.round - 1) * 0.08) * STEP;
    this.width = Math.max(getConfig('minRingSize'), this.width - shrink);
    this.length = Math.max(getConfig('minRingSize'), this.length - shrink);
    if (this.width <= 0.1 || this.length <= 0.1) {
      if (this.floorActive) this.floor.setEnabled(false);
      this.floorActive = false;
    } else {
      this.floor.setShape(new RAPIER.Cuboid(this.width / 2, 0.5, this.length / 2));
    }

    const positions = this.fighters.map(f => f.body.translation());
    let contact = false;
    this.world.contactPair(this.fighters[0].collider, this.fighters[1].collider, manifold => {
      if (manifold.numSolverContacts() > 0) contact = true;
    });
    const directions = this.fighters.map((f, seat) => {
      f.inputAge += STEP;
      if (f.inputAge > INPUT_TIMEOUT) f.input = neutralInput();
      f.stun = Math.max(0, f.stun - STEP);
      f.jumpCooldown = Math.max(0, f.jumpCooldown - STEP);
      if (f.exhaustion > 0) {
        f.exhaustion = Math.max(0, f.exhaustion - STEP);
        f.stamina = f.exhaustion > 0 ? 0 : getConfig('maxStamina');
      }
      const x = Number(f.input.right) - Number(f.input.left);
      const z = Number(f.input.down) - Number(f.input.up);
      const magnitude = Math.hypot(x, z);
      const dir = {x: magnitude ? x / magnitude : 0, z: magnitude ? z / magnitude : 0};
      if (f.exhaustion <= 0) {
        if (magnitude) {
          f.stamina = Math.max(0, f.stamina - getConfig('staminaMoveDrainPerSec') * STEP);
          if (f.stamina === 0) f.exhaustion = getConfig('exhaustionDuration');
        } else {
          f.stamina = Math.min(getConfig('maxStamina'), f.stamina + getConfig('staminaRegenPerSec') * STEP);
        }
      }
      const velocity = f.body.linvel();
      const position = positions[seat];
      const other = positions[1 - seat];
      const onFloor = this.floorActive && position.y > -0.1 && position.y < 0.12 &&
        Math.abs(velocity.y) < 1.5 &&
        Math.abs(position.x) < this.width / 2 + 0.5 &&
        Math.abs(position.z) < this.length / 2 + 0.5;
      const onOpponent = contact && position.y > other.y + 1.25 &&
        Math.abs(velocity.y - this.fighters[1 - seat].body.linvel().y) < 0.5;
      if (onFloor || onOpponent) f.jumps = 2;
      const speed = this.speed(f);
      if (f.stun <= 0) {
        f.body.setLinvel({
          x: magnitude ? dir.x * speed : velocity.x * 0.88,
          y: velocity.y,
          z: magnitude ? dir.z * speed : velocity.z * 0.88,
        }, true);
        if (magnitude) {
          const angle = Math.atan2(dir.x, dir.z) + Math.PI;
          f.body.setRotation({x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2)}, true);
        }
      }
      if (f.jumpQueued && f.jumps > 0 && f.jumpCooldown <= 0 && f.stun <= 0) {
        if (this.spend(f, getConfig('staminaJumpCost'))) {
          f.jumps--;
          f.jumpCooldown = 0.25;
          f.body.setLinvel({...f.body.linvel(), y: getConfig('jumpVelocity')}, true);
        } else {
          f.rejectedActions++;
        }
      }
      return dir;
    });

    // Evaluate both attacks before applying them, so simultaneous input does not favor seat zero.
    const attacks = this.fighters.map((f, seat) => {
      const attempt = f.pushQueued && contact &&
        Math.abs(positions[0].y - positions[1].y) < 0.9 && f.stun <= 0;
      const difference = f.stamina - this.fighters[1 - seat].stamina;
      return attempt ? {difference, eligible: f.exhaustion <= 0 && f.stamina >= getConfig('staminaSumoPushCost')} : null;
    });
    attacks.forEach((attack, seat) => {
      if (!attack) return;
      const f = this.fighters[seat];
      if (!attack.eligible) { f.rejectedActions++; return; }
      this.spend(f, getConfig('staminaSumoPushCost'));
    });
    attacks.forEach((attack, seat) => {
      if (!attack?.eligible) return;
      const target = this.fighters[1 - seat];
      let dir = directions[seat];
      if (!dir.x && !dir.z) {
        const x = positions[1 - seat].x - positions[seat].x;
        const z = positions[1 - seat].z - positions[seat].z;
        const distance = Math.hypot(x, z) || 1;
        dir = {x: x / distance, z: z / distance};
      }
      const cap = getConfig(target.exhaustion > 0 ? 'exhaustedPushSpeed' : 'normalMaxPushSpeed');
      const force = Math.min(cap, 16 + Math.max(0, attack.difference / 100) * 10);
      target.stun = 0.5;
      target.body.setLinvel({x: dir.x * force, y: 3.2, z: dir.z * force}, true);
    });

    if (contact && Math.abs(positions[0].y - positions[1].y) < 0.9 &&
        this.fighters.every(f => f.stun <= 0)) {
      const dx = positions[1].x - positions[0].x;
      const dz = positions[1].z - positions[0].z;
      const distance = Math.hypot(dx, dz) || 1;
      const nx = dx / distance, nz = dz / distance;
      const intent0 = Math.max(0, directions[0].x * nx + directions[0].z * nz);
      const intent1 = Math.max(0, -directions[1].x * nx - directions[1].z * nz);
      const a = this.fighters[0], b = this.fighters[1];
      let speed = 0;
      if (intent0 > 0.3 && intent1 <= 0.3) speed = this.speed(a) * 0.75 * intent0;
      else if (intent1 > 0.3 && intent0 <= 0.3) speed = -this.speed(b) * 0.75 * intent1;
      else if (intent0 > 0.3 && intent1 > 0.3) {
        if ((a.exhaustion > 0) !== (b.exhaustion > 0)) {
          speed = a.exhaustion > 0 ? -this.speed(b) * 0.5 : this.speed(a) * 0.5;
        } else {
          const difference = a.stamina - b.stamina;
          speed = Math.abs(difference) < 3 ? 0 :
            Math.sign(difference) * Math.min(3, 1 + Math.abs(difference) / 100 * 4);
        }
      }
      if (intent0 > 0.3 || intent1 > 0.3) {
        this.fighters.forEach(f => f.body.setLinvel({x: nx * speed, y: f.body.linvel().y, z: nz * speed}, true));
      }
    }
    this.fighters.forEach(f => {
      f.jumpQueued = f.pushQueued = false;
    });
    this.world.step();
    const fallen = this.fighters.map(f => f.body.translation().y < -3.5);
    if (fallen.some(Boolean)) {
      this.fighters.forEach((f, seat) => { if (fallen[seat]) f.lives--; });
      const dead = this.fighters.map(f => f.lives === 0);
      this.winner = fallen[0] === fallen[1] ? null : fallen[0] ? 1 : 0;
      if (dead.some(Boolean)) {
        this.phase = 'finished';
        this.winner = dead[0] === dead[1] ? null : dead[0] ? 1 : 0;
        this.remaining = 0;
      } else {
        this.phase = 'round-over';
        this.remaining = 2;
      }
    }
  }

  private speed(f: Fighter) {
    return getConfig('playerSpeed') * (f.exhaustion > 0 ? getConfig('exhaustionSpeedMultiplier') : 1);
  }

  snapshot(): MatchSnapshot {
    const players = this.fighters.map((f): FighterSnapshot => ({
      position: {...f.body.translation()}, rotation: {...f.body.rotation()},
      stamina: f.stamina, exhausted: f.exhaustion > 0, stunned: f.stun > 0,
      rejectedActions: f.rejectedActions, lives: f.lives,
    })) as [FighterSnapshot, FighterSnapshot];
    return {
      type: 'snapshot', roomCode: this.code, phase: this.phase, players,
      width: this.width, length: this.length, round: this.round, winner: this.winner,
      countdown: Math.ceil(this.remaining), rematch: [...this.rematch],
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }
}
