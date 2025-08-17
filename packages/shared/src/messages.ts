import { z } from "zod";

/** Wire-level contracts (versioned). */
export const InputMsg = z.object({
  t_client: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  move: z.tuple([z.number(), z.number(), z.number()]), // forward, right, up (FPV uses y for up)
  look: z.tuple([z.number(), z.number()]).optional(), // dx, dy
  action: z.enum(["None", "Interact", "Sprint"]).default("None"),
  sig: z.string().optional() // session signature
});
export type InputMsg = z.infer<typeof InputMsg>;

export const InitMsg = z.object({
  kind: z.literal("INIT"),
  seed: z.string(),
  layoutHash: z.string(),
  t0: z.number().int(),
  roomId: z.string(),
  playerId: z.string(),
  mapVersion: z.number().int(),
  tickRate: z.number().int()
});
export type InitMsg = z.infer<typeof InitMsg>;

export const StateFrame = z.object({
  kind: z.literal("STATE"),
  t: z.number().int(),
  tick: z.number().int(),
  log_offset: z.number().int(),
  players: z.array(z.object({
    id: z.string(),
    pos: z.tuple([z.number(), z.number(), z.number()]),
    v: z.tuple([z.number(), z.number(), z.number()]),
    st: z.enum(["idle", "walk", "sprint"])
  })),
  npcs: z.array(z.object({
    id: z.string(),
    pos: z.tuple([z.number(), z.number(), z.number()]),
    persona: z.enum(["Aggro", "Cautious", "Gambler"])
  })),
  consumables: z.array(z.object({
    id: z.string(),
    taken: z.boolean()
  })),
  effects: z.array(z.object({
    kind: z.enum(["wall_peek", "compass_ping"]),
    ttl: z.number().int()
  }))
});
export type StateFrame = z.infer<typeof StateFrame>;

export const EventRecord = z.object({
  offset: z.number().int(),
  ts: z.number(),
  tick: z.number().int(),
  kind: z.enum(["Spawn", "InputAck", "ForkPick", "Pickup", "Trap", "Finish"]),
  who: z.string(),
  payload: z.record(z.any())
});
export type EventRecord = z.infer<typeof EventRecord>;

export const ServerMsg = z.union([InitMsg, StateFrame]);
export type ServerMsg = z.infer<typeof ServerMsg>;

export const ClientMsg = InputMsg; // can extend later for additional client->server messages

