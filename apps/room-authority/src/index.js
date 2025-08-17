import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import { seedFromHex, prng } from "@shared/core";
import { deriveSeed, hashLayout } from "@shared/seed";
import { InputMsg } from "@shared/core";
import { generateMaze } from "@sim/core";
import { stepPosition } from "@sim/core";
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
redis.on("error", () => { });
// --- METRICS ---------------------------------------------------
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const mWsConnections = new Counter({ name: "ws_connections_total", help: "WS connections", registers: [registry] });
const mTickDuration = new Histogram({ name: "tick_duration_ms", help: "Tick duration", buckets: [1, 2, 4, 8, 16, 32], registers: [registry] });
const mStateFrameBytes = new Histogram({ name: "state_frame_bytes", help: "STATE frame size bytes", buckets: [256, 512, 1024, 2048, 4096, 8192], registers: [registry] });
app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
});
class Room {
    id;
    seed;
    mapVersion = 1;
    tick = 0;
    tickRate = 20; // Hz
    layoutHash;
    maze;
    players = new Map();
    npcs = [];
    consumables = [];
    clients = new Map();
    logOffset = 0;
    rng = prng(seedFromHex("deadbeef"));
    interval;
    constructor(id, seed) {
        this.id = id;
        this.seed = seed;
        this.maze = generateMaze(seed, 31, 31, 0.08);
        this.layoutHash = hashLayout(Buffer.from(JSON.stringify(this.maze)));
        // seed consumables
        for (let i = 0; i < 8; i++) {
            const x = 2 + Math.floor(this.rng() * (this.maze.w - 4));
            const y = 2 + Math.floor(this.rng() * (this.maze.h - 4));
            this.consumables.push({ id: `c${i}`, x, y, taken: false });
        }
        // simple NPCs
        this.npcs = [
            { id: "n1", persona: "Aggro", pos: [this.maze.start.x, 0, this.maze.start.y] },
            { id: "n2", persona: "Cautious", pos: [this.maze.start.x + 1, 0, this.maze.start.y] },
            { id: "n3", persona: "Gambler", pos: [this.maze.start.x, 0, this.maze.start.y + 1] }
        ];
    }
    start() {
        if (this.interval)
            return;
        const dt = 1 / this.tickRate;
        this.interval = setInterval(() => this.onTick(dt), 1000 / this.tickRate);
    }
    stop() {
        if (this.interval)
            clearInterval(this.interval);
    }
    addClient(ws, playerId) {
        this.clients.set(playerId, ws);
        mWsConnections.inc();
        const p = {
            id: playerId,
            pos: [this.maze.start.x + 0.5, 0, this.maze.start.y + 0.5],
            v: [0, 0, 0], st: "idle",
            lastSeq: -1, lastInputAt: Date.now(),
            pathCells: [`${this.maze.start.x},${this.maze.start.y}`]
        };
        this.players.set(playerId, p);
        const init = {
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
    handleInput(p, msg) {
        if (msg.seq <= p.lastSeq)
            return; // idempotent
        p.lastSeq = msg.seq;
        p.lastInputAt = Date.now();
        const speed = msg.action === "Sprint" ? 6 : 3; // meters/s
        const [fwd, strafe] = [msg.move[0], msg.move[1]];
        p.v = [strafe * speed, 0, fwd * speed];
    }
    async onTick(dt) {
        const endTimer = mTickDuration.startTimer();
        this.tick++;
        // move players
        for (const p of this.players.values()) {
            const old = p.pos;
            p.pos = stepPosition(p.pos, p.v, dt, this.maze);
            p.st = (p.v[0] !== 0 || p.v[2] !== 0) ? "walk" : "idle";
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
            if (cx === this.maze.exit.x && cy === this.maze.exit.y) {
                await this.logEvent("Finish", p.id, { timeMs: this.tick * dt * 1000, pathHash: this.hashPath(p.pathCells) });
            }
        }
        // TODO: move NPCs (A*/JPS worker) — placeholder random walk for MVP
        for (const n of this.npcs) {
            n.pos[0] += (this.rng() - 0.5) * 0.2;
            n.pos[2] += (this.rng() - 0.5) * 0.2;
        }
        // broadcast
        const frame = {
            kind: "STATE",
            t: Date.now(),
            tick: this.tick,
            log_offset: this.logOffset,
            players: Array.from(this.players.values()).map(p => ({ id: p.id, pos: p.pos, v: p.v, st: p.st })),
            npcs: this.npcs.map(n => ({ id: n.id, pos: n.pos, persona: n.persona })),
            consumables: this.consumables.map(c => ({ id: c.id, taken: c.taken })),
            effects: []
        };
        const bytes = Buffer.byteLength(JSON.stringify(frame));
        mStateFrameBytes.observe(bytes);
        const data = JSON.stringify(frame);
        for (const ws of this.clients.values())
            if (ws.readyState === WebSocket.OPEN)
                ws.send(data);
        // periodic snapshot
        if (this.tick % (this.tickRate * 5) === 0) {
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
            }
            catch {
                // ignore DB errors in local dev
            }
        }
        endTimer();
    }
    async logEvent(kind, who, payload) {
        const stream = `match:${this.id}:events`;
        let entry = null;
        try {
            entry = await redis.xadd(stream, "*", "kind", kind, "who", who, "payload", JSON.stringify(payload), "tick", String(this.tick));
        }
        catch {
            // ignore Redis errors in local dev
        }
        this.logOffset++;
        if (kind === "Finish") {
            // also store PoE receipt draft (signed later)
            // Minimal: handled by /poe endpoint
        }
        return entry;
    }
    hashPath(cells) {
        // Simple hash; verifiable enough for demo
        return crypto.createHash("sha256").update(cells.join("|")).digest("hex");
    }
}
const rooms = new Map();
// --- HTTP ROUTES ----------------------------------------------
// Seed notarization (daily seed or custom)
app.get("/seed/:mode", (req, res) => {
    const mode = req.params.mode ?? "daily";
    const roomUUID = uuidv4();
    const seed = deriveSeed(mode, DAILY_SEED_SALT, roomUUID);
    res.json({ seed, roomId: roomUUID, mapVersion: 1, ws: PUBLIC_WS });
});
// PoE receipt signing (very light demo)
app.post("/poe", async (req, res) => {
    const { roomId, playerId, seed, timeMs, pathHash } = req.body ?? {};
    if (!roomId || !playerId || !seed || !timeMs || !pathHash)
        return res.status(400).json({ error: "bad request" });
    const signature = crypto.createHmac("sha256", DAILY_SEED_SALT).update(`${roomId}|${playerId}|${seed}|${timeMs}|${pathHash}`).digest("hex");
    try {
        const rec = await prisma.poEReceipt.create({ data: { roomId, playerId, seed, timeMs: Math.floor(timeMs), pathHash, signature } });
        res.json({ ok: true, receiptId: rec.id, signature });
    }
    catch {
        res.json({ ok: true, signature, note: "DB unavailable; not persisted" });
    }
});
// Ops knobs (latency injection per player, etc.) — placeholders
const opsState = { injectLatencyMs: 0, dropPct: 0 };
app.get("/ops/state", (_req, res) => res.json(opsState));
app.post("/ops/state", (req, res) => {
    opsState.injectLatencyMs = Number(req.body?.injectLatencyMs ?? 0);
    opsState.dropPct = Number(req.body?.dropPct ?? 0);
    res.json(opsState);
});
// --- WS HANDSHAKE ----------------------------------------------
wss.on("connection", (ws, req) => {
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
        if (opsState.dropPct > 0 && Math.random() * 100 < opsState.dropPct)
            return;
        const delay = opsState.injectLatencyMs;
        const handler = () => {
            try {
                const msg = JSON.parse(String(data));
                const p = room.players.get(playerId);
                if (!p)
                    return;
                const parsed = InputMsg.safeParse(msg);
                if (!parsed.success)
                    return;
                room.handleInput(p, parsed.data);
            }
            catch { /* ignore */ }
        };
        if (delay > 0)
            setTimeout(handler, delay);
        else
            handler();
    });
    ws.on("close", () => {
        room?.clients.delete(playerId);
        room?.players.delete(playerId);
    });
});
// --- BOOT ------------------------------------------------------
server.listen(PORT, () => {
    console.log(`Room authority http/ws on :${PORT}`);
});
