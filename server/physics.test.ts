import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import {getConfig} from '../src/constants.ts';
import {initializePhysics, Match, neutralInput} from './physics.ts';

before(initializePhysics);
const ticks = (match: Match, count: number) => { for (let i = 0; i < count; i++) match.step(); };
function playing() {
  const match = new Match('ABC234');
  match.start();
  ticks(match, 180);
  assert.equal(match.phase, 'playing');
  ticks(match, 60);
  return match;
}

test('countdown, floor support, shrinking dimensions and symmetric movement', () => {
  const m = new Match('ABC234');
  try {
    m.start();
    ticks(m, 179);
    assert.equal(m.phase, 'countdown');
    assert.equal(m.snapshot().countdown, 1);
    m.step();
    assert.equal(m.phase, 'playing');
    assert.equal(m.snapshot().countdown, 0);
    const width = m.width;
    ticks(m, 60);
    assert.ok(Math.abs(m.width - (width - getConfig('shrinkSpeed'))) < 0.00001);
    for (let i = 0; i < 24; i++) {
      m.setInput(0, {...neutralInput(), right: true});
      m.setInput(1, {...neutralInput(), right: true});
      m.step();
    }
    const [a, b] = m.snapshot().players;
    assert.ok(a.position.x > 3);
    assert.ok(Math.abs(a.position.x - b.position.x) < 0.001);
    assert.ok(Math.abs(a.stamina - b.stamina) < 0.001);
    assert.ok(Math.abs(a.position.y) < 0.1);
    assert.equal(a.lives, 3);
  } finally { m.dispose(); }
});

test('idle input becomes neutral, regenerates stamina and brakes motion', () => {
  const m = playing();
  try {
    m.setInput(0, {...neutralInput(), right: true});
    ticks(m, 20);
    const moving = m.fighters[0].body.translation().x;
    ticks(m, 60);
    assert.equal(m.fighters[0].input.right, false);
    assert.ok(m.fighters[0].body.translation().x > moving);
    assert.ok(m.fighters[0].body.linvel().x < 0.1);
    assert.equal(m.snapshot().players[0].stamina, 100);
  } finally { m.dispose(); }
});

test('jump is edge-triggered, allows one air jump but not a third', () => {
  const m = playing();
  try {
    const f = m.fighters[0];
    m.setInput(0, {...neutralInput(), jump: true});
    m.step();
    assert.equal(f.jumps, 1);
    assert.ok(f.body.linvel().y > 17);
    ticks(m, 16);
    assert.equal(f.jumps, 1);
    m.setInput(0, neutralInput());
    m.step();
    m.setInput(0, {...neutralInput(), jump: true});
    m.step();
    assert.equal(f.jumps, 0);
    assert.ok(f.body.linvel().y > 17);
    ticks(m, 16);
    m.setInput(0, neutralInput());
    m.step();
    const vertical = f.body.linvel().y;
    m.setInput(0, {...neutralInput(), jump: true});
    m.step();
    assert.equal(f.jumps, 0);
    assert.ok(f.body.linvel().y < vertical);
  } finally { m.dispose(); }
});

test('press/release taps arriving between ticks still jump and push', () => {
  const m = playing();
  try {
    m.setInput(0, {...neutralInput(), jump: true});
    m.setInput(0, neutralInput());
    m.step();
    assert.equal(m.fighters[0].jumps, 1);
    assert.ok(m.fighters[0].body.linvel().y > 17);
    contact(m);
    m.setInput(0, {...neutralInput(), push: true});
    m.setInput(0, neutralInput());
    m.step();
    assert.ok(m.fighters[1].stun > 0);
  } finally { m.dispose(); }
});

function contact(match: Match) {
  match.fighters[0].body.setTranslation({x: 0, y: 0, z: 0.75}, true);
  match.fighters[1].body.setTranslation({x: 0, y: 0, z: -0.75}, true);
  match.fighters.forEach(f => f.body.setLinvel({x: 0, y: 0, z: 0}, true));
  ticks(match, 5);
}

test('push requires contact and sufficient stamina, stuns opponent and costs stamina', () => {
  const m = playing();
  try {
    m.setInput(0, {...neutralInput(), push: true});
    m.step();
    assert.equal(m.fighters[0].stamina, 100);
    m.setInput(0, neutralInput());
    m.step();
    contact(m);
    m.setInput(0, {...neutralInput(), push: true});
    m.step();
    assert.equal(m.fighters[0].stamina, 60);
    assert.ok(m.fighters[1].stun > 0);
    assert.ok(m.fighters[1].body.linvel().z < -10);
    ticks(m, 2);
    assert.ok(m.fighters[0].stamina > 60);
    assert.ok(m.fighters[0].stamina < 62);
  } finally { m.dispose(); }

  const insufficient = playing();
  try {
    contact(insufficient);
    insufficient.fighters[0].stamina = 10;
    insufficient.setInput(0, {...neutralInput(), push: true});
    insufficient.step();
    assert.equal(insufficient.snapshot().players[0].rejectedActions, 1);
    assert.equal(insufficient.fighters[1].stun, 0);
  } finally { insufficient.dispose(); }
});

test('continuous wrestling is symmetric and greater stamina wins head-on', () => {
  const m = playing();
  try {
    contact(m);
    m.setInput(0, {...neutralInput(), up: true});
    m.setInput(1, {...neutralInput(), down: true});
    m.step();
    assert.ok(Math.abs(m.fighters[0].body.linvel().z) < 0.1);
    assert.ok(Math.abs(m.fighters[1].body.linvel().z) < 0.1);
    m.fighters[1].stamina = 50;
    m.step();
    assert.ok(m.fighters[0].body.linvel().z < -1);
    assert.ok(m.fighters[1].body.linvel().z < -1);
  } finally { m.dispose(); }
});

test('simultaneous jumps and pushes affect both seats without first-seat precedence', () => {
  const m = playing();
  try {
    contact(m);
    m.fighters.forEach(f => { f.stamina = 57.5; });
    for (const seat of [0, 1] as const) {
      m.setInput(seat, {...neutralInput(), jump: true, push: true});
    }
    m.step();
    const [a, b] = m.fighters;
    assert.equal(a.jumps, 1);
    assert.equal(b.jumps, 1);
    assert.equal(a.stamina, 0);
    assert.equal(b.stamina, 0);
    assert.equal(a.exhaustion, b.exhaustion);
    assert.equal(a.stun, 0.5);
    assert.equal(b.stun, 0.5);
    assert.ok(Math.abs(a.body.linvel().z + b.body.linvel().z) < 0.001);
    assert.ok(Math.abs(a.body.linvel().y - b.body.linvel().y) < 0.001);
  } finally { m.dispose(); }
});

test('stamina locks at zero during exhaustion, reduces speed and recovers after two seconds', () => {
  const m = playing();
  try {
    const f = m.fighters[0];
    f.stamina = 0.01;
    m.setInput(0, {...neutralInput(), right: true});
    m.step();
    assert.ok(f.exhaustion > 0);
    assert.equal(f.stamina, 0);
    assert.ok(f.body.linvel().x < 2.1);
    m.setInput(0, {...neutralInput(), jump: true});
    m.step();
    assert.equal(f.jumps, 2);
    assert.equal(m.snapshot().players[0].rejectedActions, 1);
    ticks(m, 90);
    assert.equal(f.stamina, 0);
    ticks(m, 32);
    assert.equal(f.exhaustion, 0);
    assert.equal(f.stamina, 100);
  } finally { m.dispose(); }
});

test('three lives, round delay, winner and both-player rematch', () => {
  const m = playing();
  try {
    for (let loss = 1; loss <= 3; loss++) {
      m.fighters[0].body.setTranslation({x: 30, y: -4, z: 0}, true);
      m.step();
      assert.equal(m.fighters[0].lives, 3 - loss);
      assert.equal(m.winner, 1);
      if (loss < 3) {
        assert.equal(m.phase, 'round-over');
        assert.equal(m.snapshot().countdown, 2);
        ticks(m, 120);
        assert.equal(m.phase, 'countdown');
        assert.equal(m.round, loss + 1);
        assert.equal(m.width, getConfig('initialRingWidth'));
        ticks(m, 180);
        assert.equal(m.phase, 'playing');
      }
    }
    assert.equal(m.phase, 'finished');
    assert.ok(m.voteRematch(0));
    assert.equal(m.phase, 'finished');
    assert.deepEqual(m.rematch, [true, false]);
    m.voteRematch(1);
    assert.equal(m.phase, 'countdown');
    assert.equal(m.round, 1);
    assert.equal(m.winner, null);
    assert.deepEqual(m.rematch, [false, false]);
    assert.deepEqual(m.fighters.map(f => f.lives), [3, 3]);
    m.dispose();
    m.dispose();
  } finally { m.dispose(); }
});

test('simultaneous falls cost both lives and can finish in a draw', () => {
  const m = playing();
  try {
    m.fighters.forEach(f => {
      f.lives = 1;
      f.body.setTranslation({x: 30, y: -4, z: 0}, true);
    });
    m.step();
    assert.equal(m.phase, 'finished');
    assert.equal(m.winner, null);
    assert.deepEqual(m.snapshot().players.map(p => p.lives), [0, 0]);
  } finally { m.dispose(); }
});
