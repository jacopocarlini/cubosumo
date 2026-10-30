# CuboSumo

A 3D sumo game with solo/local play and server-authoritative online multiplayer.
Online players can create a private room and share its six-character code, or
choose automatic matchmaking. Both players have identical controls and physics:
movement, a double jump, contact-only burst pushes, continuous wrestling, and
stamina exhaustion. Each match starts with three lives, a shrinking arena,
countdowns between rounds, and a rematch only when both players vote for it.
Each player sees their own cube in blue on the near side of the camera and
their opponent in red on the far side. WASD and mobile directions are relative
to that view: forward moves toward the opponent for both players.

## Development

Use Node.js 22 or newer:

```sh
npm install
```

Run the backend and frontend **in separate terminals**:

```sh
npm run dev:server
```

```sh
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/ws` to the
backend on port **3001**. For a second player, open another tab/browser or share
the frontend URL on your network. `npm run server` runs the backend without
watch mode. If changing its port during development, also update the Vite proxy
target. Private rooms and matchmaking require the backend to be running.
For a separately hosted frontend, set `VITE_MULTIPLAYER_URL` to the backend's
full `ws://.../ws` or `wss://.../ws` URL before starting Vite/building, and allow
the frontend's origin with `ALLOWED_ORIGINS` on the backend.

## Production

```sh
npm run build
npm start
```

The backend serves the built `dist/` frontend and WebSocket endpoint `/ws` from
the same address, by default `http://localhost:3001`. `npm run preview` previews
the frontend only; it does not replace the multiplayer backend. Keep runtime
dependencies installed: the backend uses `tsx` to execute its TypeScript.

## Docker deployment

Build and start the game and multiplayer server together:

```sh
docker compose up -d --build
```

The service listens on port **3001** by default. Set `PUBLISH_PORT` in the
environment or in a `.env` file to change the NAS host port. To make the game
public, configure the NAS reverse proxy to forward your domain to port 3001,
enable HTTPS, and allow WebSocket upgrades for `/ws`. Forward public web traffic
to the reverse proxy rather than exposing port 3001 directly. The game uses the
same host for its WebSocket connection, so no separate multiplayer URL is
needed.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Backend HTTP/WebSocket port |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` behind a local reverse proxy |
| `ALLOWED_ORIGINS` | Same-host origins and local development origins | Comma-separated exact browser origins, e.g. `https://sumo.example.com` |

```sh
HOST=127.0.0.1 PORT=3001 ALLOWED_ORIGINS=https://sumo.example.com npm start
```

Without `ALLOWED_ORIGINS`, browser origins with the same hostname as the
request are accepted regardless of port, including LAN development with the
frontend on 5173 and backend on 3001. Loopback aliases are also accepted when
the backend is accessed through localhost/loopback. Other browser origins are rejected.
An explicit empty `ALLOWED_ORIGINS` rejects all browser origins. Non-browser
clients without an Origin header are accepted, subject to the same validation
and limits. Behind a reverse proxy, preserve the public `Host` header or set the
public origin explicitly, and forward WebSocket upgrades for `/ws`. Use HTTPS
with WSS for a publicly deployed game.

The server runs authoritative Rapier physics at **60 Hz**, broadcasting state at
**20 Hz**. It validates all messages, limits payloads and message rates, clears
stale movement input after 500 ms, and checks connections with ping/pong.
Default capacity is 200 connections and 100 rooms. Leaving/disconnecting ends
the match, detaches both players, and releases the physics world; the survivor
can immediately join another room or queue. Finished matches remain available
for rematch until someone leaves. SIGINT/SIGTERM shut down connections and worlds.

Rooms and queues live in memory on one server process and do not survive
restarts. Deploy one instance, or add sticky routing and an external room/match
directory before scaling across instances. Codes are shareable room identifiers,
not authentication or access-control credentials.

## Stack NAS Ugreen

I servizi NAS sono separati in tre progetti Compose, indipendenti dal gioco
(`compose.yaml`):

| File | Servizi |
| --- | --- |
| `compose.arr.yaml` | Sonarr, Radarr, Seerr, Tdarr, Prowlarr, Jackett, FlareSolverr e Jellyfin |
| `compose.vpn.yaml` | Gluetun e qBittorrent, che usa esclusivamente la rete di Gluetun |
| `compose.proxy.yaml` | Caddy e DuckDNS |

Sono mantenuti i nomi dei container, le porte, i percorsi su `/volume1` e le
impostazioni originali. Prima della migrazione fai un backup delle configurazioni
e arresta/rimuovi i vecchi container tramite i rispettivi progetti NAS, senza
eliminare i dati su disco. I nuovi progetti riutilizzano gli stessi nomi dei
container: non possono essere avviati insieme ai vecchi. Non usare `down -v` e
non eliminare le cartelle montate.

Tutti i servizi che devono comunicare tra progetti usano la rete esterna
`marvel_net`. Se non esiste, creala una sola volta:

```sh
docker network create marvel_net
```

Copia `.env.example` in `.env` accanto ai file Compose e compila
`WIREGUARD_PRIVATE_KEY` e `DUCKDNS_TOKEN`. Non inserire credenziali nei file YAML
o nel repository. Rigenera la chiave WireGuard e il token DuckDNS precedentemente
presenti in chiaro. Se importi i file come progetti separati nell'interfaccia
Ugreen, configura la variabile corrispondente nel progetto VPN e nel progetto
proxy, tramite il relativo `.env` o le impostazioni del progetto.

Da terminale, nella cartella contenente i file, usa nomi progetto distinti:

```sh
docker compose -p nas-vpn -f compose.vpn.yaml up -d
docker compose -p nas-arr -f compose.arr.yaml up -d
docker compose -p nas-proxy -f compose.proxy.yaml up -d
```

Usa gli stessi `-p` e `-f` anche per aggiornamenti, log e arresto dei singoli
stack. Non unire i tre file con piu opzioni `-f` nello stesso comando.
Sonarr/Radarr devono raggiungere qBittorrent tramite `gluetun:8887`, non tramite
`localhost` o `qbittorrent_vpn`, che non ha una rete propria. Il Caddyfile
esistente puo continuare a usare i nomi dei servizi e le porte interne
(ad esempio `sonarr:8989`, `jellyfin_custom:8096` e `gluetun:8887`).
Le porte Caddy sul NAS restano `7777` per HTTP e `7776` per HTTPS: mantieni
gli inoltri router esistenti dalle porte pubbliche 80/443.

## Checks

```sh
npm run test:server
npm run build
```

The native Node tests cover physics, lives/rematches, private rooms, matchmaking,
real WebSocket connections, message limits, origins, heartbeat cleanup,
shutdown, and safe static serving.

`GET /health` returns JSON with status, connected client count, room count, and
queued player count.
