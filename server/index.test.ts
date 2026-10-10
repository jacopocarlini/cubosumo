import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {request, type IncomingMessage} from 'node:http';
import {WebSocket} from 'ws';
import type {ClientMessage, MatchSnapshot, ServerMessage} from '../src/multiplayer/protocol.ts';
import {startServer, originAllowed} from './index.ts';

async function connect(url: string, options: ConstructorParameters<typeof WebSocket>[2] = {}) {
  const ws = new WebSocket(url, options);
  const inbox: ServerMessage[] = [];
  let wake: (() => void) | undefined;
  ws.on('message', data => { inbox.push(JSON.parse(data.toString())); wake?.(); });
  await once(ws, 'open');
  return {
    ws,
    send: (message: ClientMessage) => ws.send(JSON.stringify(message)),
    async next(type: ServerMessage['type']): Promise<ServerMessage> {
      const deadline = Date.now() + 3000;
      while (true) {
        const index = inbox.findIndex(message => message.type === type);
        if (index !== -1) return inbox.splice(index, 1)[0];
        const remaining = deadline - Date.now();
        assert.ok(remaining > 0, `Timed out waiting for ${type}`);
        await new Promise<void>((resolveWake, reject) => {
          const timer = setTimeout(() => {
            wake = undefined;
            reject(new Error(`Timed out waiting for ${type}`));
          }, remaining);
          wake = () => { clearTimeout(timer); wake = undefined; resolveWake(); };
        });
      }
    },
  };
}

async function app(options: Parameters<typeof startServer>[0] = {}) {
  const running = await startServer({host: '127.0.0.1', port: 0, ...options});
  const address = running.server.address();
  assert.ok(address && typeof address === 'object');
  return {
    ...running,
    http: `http://127.0.0.1:${address.port}`,
    ws: `ws://127.0.0.1:${address.port}/ws`,
  };
}

async function rejection(url: string, options = {}) {
  const ws = new WebSocket(url, options);
  const [error] = await once(ws, 'error');
  ws.terminate();
  return String(error);
}

test('real sockets queue, receive seats before countdown snapshots, disconnect and requeue', async () => {
  const running = await app();
  const a = await connect(running.ws);
  const b = await connect(running.ws);
  try {
    a.send({type: 'queue'});
    await a.next('queued');
    b.send({type: 'queue'});
    const roomA = await a.next('room');
    const roomB = await b.next('room');
    assert.ok(roomA.type === 'room' && roomB.type === 'room');
    assert.equal(roomA.code, roomB.code);
    assert.equal(roomA.seat, 0);
    assert.equal(roomB.seat, 1);
    const snapshot = await b.next('snapshot') as MatchSnapshot;
    assert.equal(snapshot.phase, 'countdown');
    assert.equal(snapshot.countdown, 3);
    const health = await (await fetch(`${running.http}/health`)).json();
    assert.equal(health.clients, 2);
    assert.equal(health.rooms, 1);
    a.ws.close();
    await b.next('opponent-left');
    assert.equal(running.rooms.rooms.size, 0);
    b.send({type: 'queue'});
    await b.next('queued');
    b.send({type: 'leave'});
    await b.next('left');
    assert.equal(running.rooms.queuedCount, 0);
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await running.close();
  }
});

test('real sockets create and join private rooms, submit rematch votes and leave', async () => {
  const running = await app();
  const a = await connect(running.ws);
  const b = await connect(running.ws);
  try {
    a.send({type: 'create'});
    const room = await a.next('room');
    assert.ok(room.type === 'room');
    b.send({type: 'join', code: room.code});
    await b.next('room');
    const match = running.rooms.rooms.get(room.code)!.match;
    match.phase = 'finished';
    match.fighters[1].lives = 0;
    match.winner = 0;
    a.send({type: 'rematch'});
    let snapshot: MatchSnapshot;
    do { snapshot = await a.next('snapshot') as MatchSnapshot; }
    while (!snapshot.rematch[0]);
    assert.equal(snapshot.phase, 'finished');
    b.send({type: 'rematch'});
    do { snapshot = await b.next('snapshot') as MatchSnapshot; }
    while (snapshot.phase !== 'countdown' || snapshot.players[1].lives !== 3);
    assert.deepEqual(snapshot.rematch, [false, false]);
    b.send({type: 'leave'});
    await b.next('left');
    await a.next('opponent-left');
    assert.equal(running.rooms.rooms.size, 0);
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await running.close();
  }
});

test('browser origin policy, websocket path and connection cap', async () => {
  const running = await app({maxClients: 1});
  let good: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    assert.match(await rejection(running.ws, {origin: 'https://evil.example'}), /403/);
    assert.match(await rejection(running.ws.replace('/ws', '/wrong')), /404/);
    good = await connect(running.ws, {origin: 'http://localhost:5173'});
    assert.match(await rejection(running.ws), /503/);
    const req = (host: string, origin: string) => ({headers: {host, origin}}) as IncomingMessage;
    assert.ok(originAllowed(req('game.example', 'https://game.example')));
    assert.ok(originAllowed(req('localhost:3001', 'http://localhost:5173')));
    assert.ok(originAllowed(req('192.168.1.42:3001', 'http://192.168.1.42:5173')));
    assert.ok(originAllowed(req('sumo.local:3001', 'http://sumo.local:5173')));
    assert.ok(originAllowed(req('192.168.1.42:5173', 'http://192.168.1.42:5173')));
    assert.equal(originAllowed(req('192.168.1.42:3001', 'http://192.168.1.43:5173')), false);
    assert.equal(originAllowed(req('sumo.local:3001', 'http://other.local:5173')), false);
    assert.equal(originAllowed(req('game.example', 'http://localhost:5173')), false);
    assert.equal(originAllowed(req('localhost:3001', 'https://evil.example')), false);
    assert.equal(originAllowed(req('game.example', 'null')), false);
    assert.ok(originAllowed(req('game.example', 'https://frontend.example'), ['https://frontend.example']));
    assert.equal(originAllowed(req('game.example', 'https://game.example'), []), false);
    assert.equal(originAllowed(req('sumo.local:3001', 'http://sumo.local:5173'), ['https://game.example']), false);
  } finally {
    good?.ws.terminate();
    await running.close();
  }
});

test('payload, binary, malformed and flooding messages are bounded', async () => {
  const running = await app();
  try {
    const invalid = await connect(running.ws);
    const invalidClosed = once(invalid.ws, 'close');
    invalid.ws.send(Buffer.from('binary'));
    await invalid.next('error');
    invalid.ws.send('{');
    invalid.ws.send('null');
    assert.equal((await invalidClosed)[0], 1008);
    const oversized = await connect(running.ws);
    const oversizedClosed = once(oversized.ws, 'close');
    oversized.ws.send('x'.repeat(2048));
    assert.equal((await oversizedClosed)[0], 1009);
    const flood = await connect(running.ws);
    const floodClosed = once(flood.ws, 'close');
    for (let i = 0; i < 15; i++) flood.send({type: 'leave'});
    assert.equal((await floodClosed)[0], 1008);
    const inputFlood = await connect(running.ws);
    const inputFloodClosed = once(inputFlood.ws, 'close');
    for (let i = 0; i < 150; i++) inputFlood.send({
      type: 'input', input: {left: false, right: false, up: false, down: false, jump: false, push: false},
    });
    assert.equal((await inputFloodClosed)[0], 1008);
  } finally { await running.close(); }
});

test('heartbeat removes unresponsive players and frees rooms; shutdown closes connected sockets', async () => {
  const running = await app({heartbeatMs: 100});
  const dead = await connect(running.ws, {autoPong: false});
  const live = await connect(running.ws);
  try {
    dead.send({type: 'queue'});
    await dead.next('queued');
    live.send({type: 'queue'});
    await live.next('room');
    await live.next('opponent-left');
    assert.equal(running.rooms.rooms.size, 0);
    assert.equal((await (await fetch(`${running.http}/health`)).json()).clients, 1);
    const closed = once(live.ws, 'close');
    await running.close();
    await closed;
    assert.equal(running.server.listening, false);
    await running.close();
  } finally {
    dead.ws.terminate();
    live.ws.terminate();
    await running.close();
  }
});

function rawGet(url: string, path: string) {
  return new Promise<number>((resolveStatus, reject) => {
    const req = request(url, {path}, response => {
      response.resume();
      resolveStatus(response.statusCode!);
    });
    req.on('error', reject);
    req.end();
  });
}

test('HTTP health and production static assets reject traversal and escaping symlinks', async () => {
  const fixture = resolve('server', `.static-test-${randomUUID()}`);
  const dist = resolve(fixture, 'dist');
  await mkdir(dist, {recursive: true});
  await writeFile(resolve(dist, 'index.html'), '<h1>CuboSumo</h1>');
  await writeFile(resolve(dist, 'app.js'), 'console.log("ok")');
  await writeFile(resolve(fixture, 'outside.txt'), 'outside');
  await symlink(resolve(fixture, 'outside.txt'), resolve(dist, 'escape.txt'));
  const running = await app({dist});
  try {
    assert.equal(await (await fetch(`${running.http}/`)).text(), '<h1>CuboSumo</h1>');
    assert.equal(await (await fetch(`${running.http}/online`)).text(), '<h1>CuboSumo</h1>');
    const js = await fetch(`${running.http}/app.js`);
    assert.match(js.headers.get('content-type')!, /javascript/);
    assert.equal(await js.text(), 'console.log("ok")');
    const head = await fetch(`${running.http}/app.js`, {method: 'HEAD'});
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), '17');
    assert.equal((await fetch(`${running.http}/missing.js`)).status, 404);
    assert.equal((await fetch(`${running.http}/escape.txt`)).status, 403);
    assert.equal(await rawGet(running.http, '/%2e%2e%2foutside.txt'), 403);
    assert.equal(await rawGet(running.http, '/%5c..%5coutside.txt'), 403);
    assert.equal(await rawGet(running.http, '/%00'), 403);
    assert.equal(await rawGet(running.http, '/%zz'), 400);
    assert.equal((await fetch(`${running.http}/health`, {method: 'POST'})).status, 405);
  } finally {
    await running.close();
    await rm(fixture, {recursive: true, force: true});
  }
});
