import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion, Vector3} from 'three';
import {getViewFighters, toServerInput} from '../src/multiplayer/perspective.ts';
import {initializePhysics, Match, neutralInput} from './physics.ts';

before(initializePhysics);

test('both players see their own fighter near the camera facing the opponent', () => {
  const match = new Match('VIEW01');
  try {
    const raw = match.snapshot();
    const original = structuredClone(raw);
    for (const seat of [0, 1] as const) {
      const [local, opponent] = getViewFighters(raw, seat);
      assert.equal(local.position.z, 6);
      assert.equal(opponent.position.z, -6);
      const forward = new Vector3(0, 0, -1).applyQuaternion(
        new Quaternion(local.rotation.x, local.rotation.y, local.rotation.z, local.rotation.w),
      );
      assert.ok(forward.z < -0.99);
    }
    assert.deepEqual(raw, original);
  } finally { match.dispose(); }
});

test('local HUD and visual states follow the correct fighter without changing results or votes', () => {
  const match = new Match('VIEW02');
  try {
    const raw = match.snapshot();
    raw.players[0].stamina = 0;
    raw.players[0].exhausted = true;
    raw.players[0].lives = 1;
    raw.players[1].stamina = 62;
    raw.players[1].stunned = true;
    raw.players[1].sweating = true;
    raw.players[1].lives = 2;
    raw.winner = 1;
    raw.rematch = [false, true];
    const original = structuredClone(raw);
    for (const seat of [0, 1] as const) {
      const [local, opponent] = getViewFighters(raw, seat);
      for (const key of ['stamina', 'exhausted', 'stunned', 'sweating', 'lives'] as const) {
        assert.equal(local[key], raw.players[seat][key]);
        assert.equal(opponent[key], raw.players[seat === 0 ? 1 : 0][key]);
      }
    }
    assert.deepEqual(raw, original);
  } finally { match.dispose(); }
});

test('seat-one rotation is a proper Y rotation for arbitrary fighter headings', () => {
  const match = new Match('VIEW03');
  try {
    const raw = match.snapshot();
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 0.7);
    raw.players[1].rotation = {x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w};
    raw.players[1].position = {x: 3, y: 2, z: -4};
    const [local] = getViewFighters(raw, 1);
    const expected = new Quaternion(0, 1, 0, 0).multiply(rotation);
    assert.deepEqual(local.rotation, {x: expected.x, y: expected.y, z: expected.z, w: expected.w});
    assert.deepEqual(local.position, {x: -3, y: 2, z: 4});
  } finally { match.dispose(); }
});

test('directional inputs map back to world coordinates without altering actions', () => {
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    const input = {...neutralInput(), [direction]: true, jump: true, push: true};
    const original = {...input};
    assert.deepEqual(toServerInput(input, 0), original);
    const world = toServerInput(input, 1);
    const opposite = {left: 'right', right: 'left', up: 'down', down: 'up'} as const;
    assert.equal(world[opposite[direction]], true);
    assert.equal(world[direction], false);
    assert.equal(world.jump, true);
    assert.equal(world.push, true);
    assert.deepEqual(toServerInput(world, 1), original);
    assert.deepEqual(input, original);
  }
});

test('both seats move forward and right in their own rendered view', () => {
  const match = new Match('VIEW04');
  try {
    match.start();
    for (let tick = 0; tick < 240; tick++) match.step();
    const start = match.snapshot();
    for (let tick = 0; tick < 15; tick++) {
      for (const seat of [0, 1] as const) {
        match.setInput(seat, toServerInput({...neutralInput(), up: true, right: true}, seat));
      }
      match.step();
    }
    const moved = match.snapshot();
    for (const seat of [0, 1] as const) {
      const [before] = getViewFighters(start, seat);
      const [after] = getViewFighters(moved, seat);
      assert.ok(after.position.x > before.position.x);
      assert.ok(after.position.z < before.position.z);
      const forward = new Vector3(0, 0, -1).applyQuaternion(
        new Quaternion(after.rotation.x, after.rotation.y, after.rotation.z, after.rotation.w),
      );
      assert.ok(forward.x > 0 && forward.z < 0);
    }
  } finally { match.dispose(); }
});
