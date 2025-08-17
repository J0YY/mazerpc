import "dotenv/config";
import http, { IncomingMessage } from "node:http";
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

import { seedFromHex, prng } from "@shared/core";
import { deriveSeed, hashLayout } from "@shared/seed";
import { InitMsg, StateFrame, InputMsg, ServerMsg } from "@shared/core";
import { generateMaze } from "@sim/core";
import { stepPosition } from "@sim/core";
import { rivalBanter, coachRecap } from "@ai/helpers";

// --- ENV -------------------------------------------------------
const PORT = Number(process.env.SERVER_PORT ?? 8080);
const PUBLIC_WS = process.env.SERVER_PUBLIC_WS ?? `ws://localhost:${PORT}/ws`;
const DAILY_SEED_SALT = process.env.DAILY_SEED_SALT ?? "salt";

// --- INFRA -----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: () => null
});
const prisma = new PrismaClient();
// Swallow Redis connection errors in local dev if Redis is down
redis.on("error", () => {});

// --- METRICS ---------------------------------------------------
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const mWsConnections = new Counter({ name: "ws_connections_total", help: "WS connections", registers:[registry] });
const mTickDuration = new Histogram({ name: "tick_duration_ms", help: "Tick duration", buckets:[1,2,4,8,16,32], registers:[registry] });
const mStateFrameBytes = new Histogram({ name: "state_frame_bytes", help: "STATE frame size bytes", buckets:[256,512,1024,2048,4096,8192], registers:[registry] });
const gPlayers = new Gauge({ name: "players_connected", help: "Players connected per room", labelNames:["room"], registers:[registry] });

app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// health / readiness
app.get("/healthz", (_req: Request, res: Response) => res.json({ ok: true }));
app.get("/readyz", async (_req: Request, res: Response) => {
  try {
    await redis.ping();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err) });
  }
});

// --- SIMPLE MODELS --------------------------------------------
type Player = {
  id: string;
  pos: [number,number,number];
  v: [number,number,number];
  st: "idle"|"walk"|"sprint";
  lastSeq: number;
  lastInputAt: number;
  pathCells: string[]; // for proof/hash
};

type NPC = {
  id: string;
  persona: "Aggro"|"Cautious"|"Gambler";
  pos: [number,number,number];
};

type Consumable = { id: string; x: number; y: number; taken: boolean };

class Room {
  id: string;
  seed: string;
  mapVersion = 1;
  tick = 0;
  tickRate = 20; // Hz
  layoutHash: string;
  maze: ReturnType<typeof generateMaze>;
  players = new Map<string, Player>();
  npcs: NPC[] = [];
  consumables: Consumable[] = [];
  clients = new Map<string, WebSocket>();
  logOffset = 0;
  rng = prng(seedFromHex("deadbeef"));

  interval?: NodeJS.Timeout;

  constructor(id: string, seed: string) {
    this.id = id;
    this.seed = seed;
    this.maze = generateMaze(seed, 31, 31, 0.08);
    this.layoutHash = hashLayout(Buffer.from(JSON.stringify(this.maze)));
    // seed consumables
    for (let i=0;i<8;i++){
      const x = 2 + Math.floor(this.rng()*(this.maze.w-4));
      const y = 2 + Math.floor(this.rng()*(this.maze.h-4));
      this.consumables.push({ id: `c${i}`, x, y, taken: false });
    }
    // simple NPCs
    this.npcs = [
      { id: "n1", persona: "Aggro", pos: [this.maze.start.x, 0, this.maze.start.y] },
      { id: "n2", persona: "Cautious", pos: [this.maze.start.x+1, 0, this.maze.start.y] },
      { id: "n3", persona: "Gambler", pos: [this.maze.start.x, 0, this.maze.start.y+1] }
    ];
  }

  start() {
    if (this.interval) return;
    const dt = 1/this.tickRate;
    this.interval = setInterval(()=>this.onTick(dt), 1000/this.tickRate);
  }
  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  addClient(ws: WebSocket, playerId: string) {
    this.clients.set(playerId, ws);
    mWsConnections.inc();
    const p: Player = {
      id: playerId,
      pos: [this.maze.start.x + 0.5, 0, this.maze.start.y + 0.5],
      v: [0,0,0], st:"idle",
      lastSeq: -1, lastInputAt: Date.now(),
      pathCells: [`${this.maze.start.x},${this.maze.start.y}`]
    };
    this.players.set(playerId, p);
    gPlayers.set({ room: this.id }, this.players.size);

    const init: InitMsg = {
      kind: "INIT",
      seed: this.seed,
      layoutHash: this.layoutHash,
      t0: Date.now(),
      roomId: this.id,
      playerId,
      mapVersion: this.mapVersion,
      tickRate: this.tickRate
    };
    ws.send(JSON.stringify(init));
  }

  handleInput(p: Player, msg: InputMsg) {
    if (msg.seq <= p.lastSeq) return; // idempotent
    p.lastSeq = msg.seq;
    p.lastInputAt = Date.now();

    const speed = msg.action === "Sprint" ? 6 : 3; // meters/s
    const [fwd, strafe] = [msg.move[0], msg.move[1]];
    p.v = [strafe*speed, 0, fwd*speed];
  }

  async onTick(dt: number) {
    const endTimer = mTickDuration.startTimer();
    this.tick++;

    // move players
    for (const p of this.players.values()) {
      const old = p.pos;
      p.pos = stepPosition(p.pos, p.v, dt, this.maze);
      p.st = (p.v[0]!==0 || p.v[2]!==0) ? "walk" : "idle";
      // record cell path
      const cx = Math.floor(p.pos[0]);
      const cy = Math.floor(p.pos[2]);
      const key = `${cx},${cy}`;
      if (key !== `${Math.floor(old[0])},${Math.floor(old[2])}`) {
        p.pathCells.push(key);
      }
      // pickups
      for (const c of this.consumables) {
        if (!c.taken && Math.hypot(c.x - p.pos[0], c.y - p.pos[2]) < 0.6) {
          c.taken = true;
          await this.logEvent("Pickup", p.id, { id: c.id });
        }
      }
      // finish
      if (cx===this.maze.exit.x && cy===this.maze.exit.y) {
        await this.logEvent("Finish", p.id, { timeMs: this.tick*dt*1000, pathHash: this.hashPath(p.pathCells) });
      }
    }

    // TODO: move NPCs (A*/JPS worker) — placeholder random walk for MVP
    for (const n of this.npcs) {
      n.pos[0] += (this.rng()-0.5)*0.2;
      n.pos[2] += (this.rng()-0.5)*0.2;
    }

    // broadcast
    const frame: StateFrame = {
      kind: "STATE",
      t: Date.now(),
      tick: this.tick,
      log_offset: this.logOffset,
      players: Array.from(this.players.values()).map(p=>({ id:p.id, pos:p.pos, v:p.v, st:p.st })),
      npcs: this.npcs.map(n=>({ id:n.id, pos:n.pos as [number,number,number], persona:n.persona })),
      consumables: this.consumables.map(c=>({ id:c.id, taken:c.taken })),
      effects: []
    };
    const bytes = Buffer.byteLength(JSON.stringify(frame));
    mStateFrameBytes.observe(bytes);
    const data = JSON.stringify(frame);
    for (const ws of this.clients.values()) if (ws.readyState===WebSocket.OPEN) ws.send(data);

    // periodic snapshot
    if (this.tick % (this.tickRate*5) === 0) {
      try {
        await prisma.snapshot.create({
          data: {
            roomId: this.id,
            tick: this.tick,
            layoutHash: this.layoutHash,
            rngState: "n/a",
            stateBlob: {
              players: Array.from(this.players.values()),
              npcs: this.npcs, consumables: this.consumables
            }
          }
        });
      } catch {
        // ignore DB errors in local dev
      }
    }

    endTimer();
  }

  async logEvent(kind: "Spawn"|"InputAck"|"ForkPick"|"Pickup"|"Trap"|"Finish", who: string, payload: Record<string,unknown>) {
    const stream = `match:${this.id}:events`;
    let entry: string | null = null;
    try {
      entry = await redis.xadd(stream, "*", "kind", kind, "who", who, "payload", JSON.stringify(payload), "tick", String(this.tick));
    } catch {
      // ignore Redis errors in local dev
    }
    this.logOffset++;
    if (kind==="Finish") {
      // also store PoE receipt draft (signed later)
      // Minimal: handled by /poe endpoint
    }
    return entry;
  }

  hashPath(cells: string[]) {
    // Simple hash; verifiable enough for demo
    return crypto.createHash("sha256").update(cells.join("|")).digest("hex");
  }
}

const rooms = new Map<string, Room>();

// --- HTTP ROUTES ----------------------------------------------

// Seed notarization (daily seed or custom)
app.get("/seed/:mode", (req: Request, res: Response) => {
  const mode = req.params.mode ?? "daily";
  const roomUUID = uuidv4();
  const seed = deriveSeed(mode, DAILY_SEED_SALT, roomUUID);
  res.json({ seed, roomId: roomUUID, mapVersion: 1, ws: PUBLIC_WS });
});

// PoE receipt signing (very light demo)
app.post("/poe", async (req: Request, res: Response) => {
  const { roomId, playerId, seed, timeMs, pathHash } = req.body ?? {};
  if (!roomId || !playerId || !seed || !timeMs || !pathHash) return res.status(400).json({ error: "bad request" });

  const signature = crypto.createHmac("sha256", DAILY_SEED_SALT).update(`${roomId}|${playerId}|${seed}|${timeMs}|${pathHash}`).digest("hex");
  try {
    const rec = await prisma.poEReceipt.create({ data: { roomId, playerId, seed, timeMs: Math.floor(timeMs), pathHash, signature }});
    res.json({ ok: true, receiptId: rec.id, signature });
  } catch {
    res.json({ ok: true, signature, note: "DB unavailable; not persisted" });
  }
});

// Ops knobs (latency injection per player, etc.) — placeholders
const opsState = { injectLatencyMs: 0, dropPct: 0 };
app.get("/ops/state", (_req: Request, res: Response) => res.json(opsState));
app.post("/ops/state", (req: Request, res: Response) => {
  opsState.injectLatencyMs = Number(req.body?.injectLatencyMs ?? 0);
  opsState.dropPct = Number(req.body?.dropPct ?? 0);
  res.json(opsState);
});

// --- WS HANDSHAKE ----------------------------------------------
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
  const roomId = params.get("room") ?? uuidv4();
  const playerId = params.get("player") ?? uuidv4();
  const mode = params.get("mode") ?? "daily";

  let room = rooms.get(roomId);
  if (!room) {
    const seed = deriveSeed(mode, DAILY_SEED_SALT, roomId);
    room = new Room(roomId, seed);
    rooms.set(roomId, room);
    room.start();
  }
  room.addClient(ws, playerId);

  ws.on("message", async (data) => {
    if (opsState.dropPct > 0 && Math.random()*100 < opsState.dropPct) return;
    const delay = opsState.injectLatencyMs;
    const handler = () => {
      try {
        const msg = JSON.parse(String(data));
        const p = room!.players.get(playerId);
        if (!p) return;
        const parsed = InputMsg.safeParse(msg);
        if (!parsed.success) return;
        room!.handleInput(p, parsed.data);
      } catch {/* ignore */}
    };
    if (delay>0) setTimeout(handler, delay);
    else handler();
  });

  ws.on("close", () => {
    room?.clients.delete(playerId);
    room?.players.delete(playerId);
    if (room) gPlayers.set({ room: room.id }, room.players.size);
  });
});

// --- BOOT ------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Room authority http/ws on :${PORT}`);
});

// SSE stream of events for a room
app.get("/events/:roomId/stream", async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  let lastId = "$";
  let alive = true;
  req.on("close", ()=>{ alive=false; });
  async function pump(){
    while(alive){
      try {
        const result = await redis.xread("BLOCK", 15000, "COUNT", 100, "STREAMS", `match:${roomId}:events`, lastId);
        if (result && Array.isArray(result)) {
          const [_stream, entries] = result[0] as [string, Array<[string, string[]]>];
          for (const [id, kv] of entries) {
            lastId = id;
            const obj: Record<string,string> = {};
            for (let i=0;i<kv.length;i+=2) obj[kv[i]] = kv[i+1];
            res.write(`event: event\n`);
            res.write(`data: ${JSON.stringify({ id, ...obj })}\n\n`);
          }
        }
      } catch {}
    }
  }
  pump();
});

