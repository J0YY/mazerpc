## Labyrinth Racer (MazeRPC)

Fast‑loop, seed‑deterministic FPV maze racer. Monorepo with a Next.js client, a Node Room Authority (WS + event log), shared types/PRNG, a tiny AI helper, and infra bits (Redis, Postgres, Prometheus).

Project repo: [J0YY/mazerpc](https://github.com/J0YY/mazerpc.git)

## The gist

- Deterministic seed → same maze for everyone. Client renders locally using the shared generator; server is authoritative for physics and state.
- Clients send high‑rate inputs with sequence numbers. Authority ticks at 20 Hz, applies inputs, handles pickups/finish, broadcasts `STATE` frames.
- Event sourcing: append significant events to Redis Streams; periodic snapshots to Postgres for restart/replay.
- Observability: Prometheus metrics at `/metrics` (tick duration, WS connects, frame bytes).
- Optional AI: server can request “rival radio” banter or post‑run recaps via OpenAI Responses API (env‑gated, off by default).

## Background / inspo

Speedrunning + distributed systems. The fun part is the feeling of a “live authority” that never lies: inputs are speculative; the server keeps you honest. The maze is verifiable from a signed seed, so runs are shareable and replayable.

---

<img width="1470" height="746" alt="Screenshot 2025-08-16 at 7 28 38 PM" src="https://github.com/user-attachments/assets/4b0d76db-b511-4bae-a009-0aae82ecbd94" />

---

## What’s in the box

- apps/web: Next.js + React Three Fiber client. FPV/Orbit toggle, warm dungeon palette, start/exit beacons, candles, breadcrumb trail, hot/cold proximity panel, local input sampling.
- apps/room-authority: Express + ws authority. Deterministic maze from seed, 20 Hz loop, collision, pickups, Redis Streams logging, metrics, Prisma snapshots.
- packages/shared: zod typed contracts, tiny mulberry32 PRNG, seed/hash utilities.
- packages/sim: maze generation (recursive backtracker + loop carving), path metric, simple physics with sub‑stepped per‑axis sweeps (anti‑tunneling).
- packages/ai: minimal OpenAI Responses API wrapper (rival banter / coach recap), env‑gated.
- infra/compose: docker‑compose for Redis + Postgres.

## Controls (client)

- F: Toggle FPV (pointer‑lock) / Orbit (peek, limited). Esc unlocks in FPV.
- WASD (view‑relative), Shift to sprint.
- Left panel: escape proximity meter (hot/cold). Right panel: rival radio (frequent, unhinged, sometimes misleading).
- Settings (bottom‑left): FOV, brightness, grid toggle, candle density, speed.

## How it works (high‑level)

1) Seed notarization: client calls `GET /seed/:mode` → `{ seed, roomId, ws }`. Seed is `sha256(mode|salt|roomUUID)`. Everyone can recompute/verify.
2) WS connect: `/ws?room=<roomId>&player=<uuid>`. The first client to a room instantiates the authority with that seed.
3) INIT: server sends `{ kind: "INIT", seed, layoutHash, tickRate, ... }`. Client creates the same maze locally from the seed.
4) Inputs: every frame the client sends `InputMsg { t_client, seq, move, action }`. The server applies inputs at 20 Hz (sub‑steps internally to avoid tunneling), updates state, logs events.
5) Broadcast: server emits `STATE` frames (~10–15 Hz). Client can reconcile / show breadcrumb trail and panels.
6) Finish: reaching exit emits a `Finish` event; client may `POST /poe` for a signed receipt (seed, timeMs, path hash).

## Messages (zod‑typed)

- `InputMsg`: `{ t_client, seq, move:[fwd,right,up], action }`.
- `InitMsg`, `StateFrame`, `EventRecord` — see `packages/shared/src/messages.ts`.

## Determinism and fairness

- Maze = f(seed). Seed is announced before you connect and used on both client/server — verifiable runs.
- Physics: authority resolves collisions. Client is free to predict (simple in this MVP), but server state wins.

## Event log and snapshots

- Append events to Redis Streams `match:<roomId>:events` (fast path). Snapshots every ~5s to Postgres via Prisma for quick recovery.
- Replay plan: load latest snapshot, apply events since offset.

## Observability

- `/metrics` exposes Prometheus counters/histograms (tick duration, frame bytes, WS connects, etc.).
- Health: `/healthz`, Readiness: `/readyz` (checks Redis + DB).
- SSE event stream: `/events/:roomId/stream` for real‑time log consumption.
- Optional OpenTelemetry traces (env‑gated):
  - Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` to export to an OTEL Collector.

### One‑liner local stack (Prometheus + OTEL Collector + Grafana)

```
pnpm infra:up
# This starts Redis, Postgres, Prometheus (:9090), Grafana (:3001), and an OTEL Collector (:4317/4318).
```

Prometheus scrapes `host.docker.internal:8080/metrics` by default (Docker Desktop Mac). Visit:

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)


## AI hooks (optional)

- Rival banter: low‑frequency calls to OpenAI Responses API with persona + proximity context; can be truthful or deceptive.
- Coach recap: brief post‑run feedback (fork bias, optimality). Both behind env flags; off by default.

## Repo layout

```
apps/
  room-authority/   # Node 20 authority (Express + ws + Redis + Prisma)
  web/              # Next.js + R3F client
packages/
  shared/           # zod contracts, PRNG, seed utils
  sim/              # maze gen, path metric, physics
  ai/               # OpenAI helpers (Responses API)
infra/
  compose/          # docker-compose for Redis + Postgres
```

## Run locally

```bash
pnpm install

# infra: Redis + Postgres
pnpm infra:up

# Prisma
cd apps/room-authority
pnpm prisma:gen
pnpm prisma:migrate   # optional for local dev; snapshots/receipts tables
cd ../../

# envs
cp .env.example .env
cp apps/web/env.local.example apps/web/.env.local

# dev
pnpm dev
# web → http://localhost:3010
# server → http://localhost:8080, metrics → /metrics
```

## Troubleshooting

- Redis refused / noisy logs: the authority tolerates Redis down (events are best‑effort). Start infra with `pnpm infra:up` to silence errors.
- Prisma `@prisma/client did not initialize`: run `pnpm --filter @app/room-authority prisma:gen`.
- Next stale chunks: delete `apps/web/.next` and restart `pnpm --filter @app/web dev`.
- Can’t move: press F to enter FPV; adjust Speed in Settings; ensure server is running (web queries `/seed`).
- Wall clipping: server uses sub‑step per‑axis sweeps; if needed, increase sub‑steps or capsule collider in `packages/sim/src/physics.ts`.

## Production notes

- Pin Node 20 and pnpm in CI. Build with `pnpm -r build`.
- Expose `/metrics` to Prometheus; add OTEL (Node SDK) if needed.
- Scale authorities horizontally behind a simple room registry (Redis) or a small matchmaker.

## Roadmap

- Client prediction + reconciliation ring buffer (rewind ~200ms on authoritative frames).
- Worker for NPC pathing (A*/JPS), plus light bandit logic for forks.
- Spectator/replay route that rehydrates from snapshots + events.
- Proper capsule collider, jump, and slope handling.
- Structured AI outputs and cadence/quotas.

## License

MIT for the code in this repo.

