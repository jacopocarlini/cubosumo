import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {resolve, relative, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {WebSocket, WebSocketServer} from 'ws';
import {initializePhysics, STEP} from './physics.ts';
import {Rooms, type Peer} from './rooms.ts';
import {parseMessage, RateLimit} from './validation.ts';

export interface ServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  maxClients?: number;
  maxRooms?: number;
  dist?: string;
  heartbeatMs?: number;
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

export function originAllowed(request: IncomingMessage, allowedOrigins?: string[]) {
  const origin = request.headers.origin;
  if (!origin) return true; // Non-browser clients still receive the same validation and limits.
  if (allowedOrigins !== undefined) return allowedOrigins.includes(origin);
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
    if (url.host.toLowerCase() === request.headers.host?.toLowerCase()) return true;
    const local = ['localhost', '127.0.0.1', '[::1]'];
    const requestHost = new URL(`http://${request.headers.host}`).hostname;
    if (requestHost === url.hostname) return true;
    return local.includes(requestHost) && local.includes(url.hostname);
  } catch { return false; }
}

export async function startServer(options: ServerOptions = {}) {
  await initializePhysics();
  const rooms = new Rooms(options.maxRooms ?? 100);
  const maxClients = options.maxClients ?? 200;
  const dist = resolve(options.dist ?? fileURLToPath(new URL('../dist', import.meta.url)));
  const peers = new Map<WebSocket, {peer: Peer; alive: boolean}>();

  async function serve(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {Allow: 'GET, HEAD'}).end();
      return;
    }
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://server').pathname); }
    catch { response.writeHead(400).end('Bad URL'); return; }
    if (pathname === '/health') {
      response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({
        status: 'ok', clients: peers.size, rooms: rooms.rooms.size, queued: rooms.queuedCount,
      }));
      return;
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const requested = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    const inside = (root: string, path: string) => {
      const rel = relative(root, path);
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep));
    };
    if (!inside(dist, requested)) { response.writeHead(403).end('Forbidden'); return; }
    try {
      const root = await realpath(dist);
      let path = await realpath(requested).catch(() => '');
      if (!path && extname(pathname) === '') path = await realpath(resolve(dist, 'index.html'));
      if (!path) { response.writeHead(404).end('Not found'); return; }
      if (!inside(root, path)) { response.writeHead(403).end('Forbidden'); return; }
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') response.end();
      else {
        const stream = createReadStream(path);
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      }
    } catch {
      if (!response.headersSent) response.writeHead(404).end('Build the frontend with npm run build first.');
      else response.destroy();
    }
  }
  const server = createServer((request, response) => { void serve(request, response); });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  const wss = new WebSocketServer({noServer: true, maxPayload: 1024, perMessageDeflate: false});
  let closing = false;
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number, message: string) => {
      socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    if (closing) { reject(503, 'Unavailable'); return; }
    if (request.url !== '/ws') { reject(404, 'Not Found'); return; }
    if (!originAllowed(request, options.allowedOrigins)) { reject(403, 'Forbidden'); return; }
    if (peers.size >= maxClients) { reject(503, 'Capacity Reached'); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', ws => {
    const peer: Peer = {send(message) {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 64 * 1024) { ws.terminate(); return; }
      ws.send(JSON.stringify(message));
    }};
    const state = {peer, alive: true};
    peers.set(ws, state);
    const messages = new RateLimit(120, 90);
    const controls = new RateLimit(10, 2);
    let invalid = 0;
    ws.on('pong', () => { state.alive = true; });
    ws.on('message', (data, binary) => {
      if (!messages.take()) { ws.close(1008, 'Message rate exceeded'); return; }
      const message = binary ? null : parseMessage(data.toString());
      if (!message) {
        peer.send({type: 'error', message: 'Invalid message.'});
        if (++invalid >= 3) ws.close(1008, 'Invalid messages');
        return;
      }
      if (message.type !== 'input' && !controls.take()) {
        ws.close(1008, 'Command rate exceeded');
        return;
      }
      rooms.handle(peer, message);
    });
    const remove = () => {
      if (!peers.delete(ws)) return;
      rooms.leave(peer);
    };
    ws.on('close', remove);
    ws.on('error', () => { remove(); ws.terminate(); });
  });

  let previous = performance.now();
  let accumulator = 0;
  let ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    // Bound catch-up after a stalled event loop; never simulate an unbounded backlog.
    accumulator += Math.min(0.1, (now - previous) / 1000);
    previous = now;
    while (accumulator >= STEP) {
      rooms.step();
      accumulator -= STEP;
      if (++ticks % 3 === 0) rooms.snapshots();
    }
  }, 1000 / 60);
  const heartbeat = setInterval(() => {
    peers.forEach((state, ws) => {
      if (!state.alive) { rooms.leave(state.peer); ws.terminate(); return; }
      state.alive = false;
      ws.ping();
    });
  }, options.heartbeatMs ?? 15_000);

  let closePromise: Promise<void> | undefined;
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    rooms.dispose();
    peers.forEach((_, ws) => ws.terminate());
    peers.clear();
    closePromise = new Promise<void>((resolveClose) => {
      wss.close(() => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    });
    return closePromise;
  }
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 3001, options.host ?? '0.0.0.0', () => {
        server.removeListener('error', reject);
        resolveListen();
      });
    });
  } catch (error) {
    await close();
    throw error;
  }
  return {server, rooms, close};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const app = await startServer({
    port,
    host: process.env.HOST ?? '0.0.0.0',
    allowedOrigins: process.env.ALLOWED_ORIGINS === undefined ? undefined :
      process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
  });
  console.log(`CuboSumo server listening on ${process.env.HOST ?? '0.0.0.0'}:${port}`);
  const shutdown = () => { void app.close().catch(error => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
