import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import type {ServerMessage} from '../src/multiplayer/protocol.ts';
import {initializePhysics} from './physics.ts';
import {Rooms, type Peer} from './rooms.ts';

before(initializePhysics);
function peer() {
  const messages: ServerMessage[] = [];
  return {messages, send: (message: ServerMessage) => { messages.push(message); }} satisfies Peer;
}

test('private room seats arrive before snapshots; full and missing rooms are rejected', () => {
  const rooms = new Rooms();
  try {
    const a = peer(), b = peer(), c = peer();
    rooms.handle(a, {type: 'create'});
    const code = [...rooms.rooms.keys()][0];
    assert.deepEqual(a.messages[0], {type: 'room', code, seat: 0});
    assert.equal(a.messages[1].type, 'snapshot');
    rooms.handle(b, {type: 'join', code: code.toLowerCase()});
    assert.deepEqual(b.messages[0], {type: 'room', code, seat: 1});
    assert.equal(b.messages[1].type, 'snapshot');
    assert.equal(rooms.rooms.get(code)!.match.phase, 'countdown');
    rooms.handle(c, {type: 'join', code});
    assert.equal(c.messages.at(-1)!.type, 'error');
    rooms.handle(c, {type: 'join', code: 'ZZZZZZ'});
    assert.equal(c.messages.at(-1)!.type, 'error');
    rooms.handle(a, {type: 'queue'});
    assert.equal(a.messages.at(-1)!.type, 'error');
  } finally { rooms.dispose(); }
});

test('FIFO matchmaking never joins private rooms and queue leave removes player', () => {
  const rooms = new Rooms();
  try {
    const a = peer(), b = peer(), c = peer(), d = peer();
    rooms.handle(a, {type: 'create'});
    rooms.handle(b, {type: 'queue'});
    assert.equal(b.messages[0].type, 'queued');
    rooms.handle(c, {type: 'queue'});
    assert.equal(rooms.queuedCount, 0);
    assert.equal(rooms.rooms.size, 2);
    assert.equal(b.messages[1].type, 'room');
    assert.equal(c.messages[0].type, 'room');
    rooms.handle(d, {type: 'queue'});
    rooms.leave(d);
    assert.equal(rooms.queuedCount, 0);
  } finally { rooms.dispose(); }
});

test('disconnect and explicit leave detach both players, dispose world and permit new rooms', () => {
  const rooms = new Rooms();
  try {
    const a = peer(), b = peer();
    rooms.handle(a, {type: 'queue'});
    rooms.handle(b, {type: 'queue'});
    const world = [...rooms.rooms.values()][0].match.world;
    rooms.leave(a);
    assert.equal(rooms.rooms.size, 0);
    assert.equal(b.messages.at(-1)!.type, 'opponent-left');
    assert.throws(() => world.bodies.len());
    rooms.handle(b, {type: 'create'});
    assert.equal(rooms.rooms.size, 1);
    rooms.handle(b, {type: 'leave'});
    assert.equal(b.messages.at(-1)!.type, 'left');
    assert.equal(rooms.rooms.size, 0);
    rooms.leave(a);
    rooms.dispose();
    rooms.dispose();
  } finally { rooms.dispose(); }
});

test('room cap preserves a queued player when a private room consumes remaining capacity', () => {
  const rooms = new Rooms(1);
  try {
    const a = peer(), b = peer(), c = peer();
    rooms.handle(a, {type: 'queue'});
    rooms.handle(b, {type: 'create'});
    rooms.handle(c, {type: 'queue'});
    assert.equal(c.messages.at(-1)!.type, 'error');
    assert.equal(rooms.queuedCount, 1);
    rooms.leave(b);
    rooms.handle(c, {type: 'queue'});
    assert.equal(rooms.queuedCount, 0);
    assert.equal(rooms.rooms.size, 1);
  } finally { rooms.dispose(); }
});
