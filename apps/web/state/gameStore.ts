import { create } from "zustand";
import type { InitMsg, StateFrame } from "@shared/core";
import type { Maze } from "@sim/core";
import { generateMaze } from "@sim/core";

type GameState = {
  seed?: string;
  roomId?: string;
  playerId?: string;
  maze?: Maze;
  myPos: [number,number,number];
  trail: Array<[number,number,number]>;
  players: StateFrame["players"];
  npcs: StateFrame["npcs"];
  consumables: StateFrame["consumables"];
  moveVec: [number,number,number]; // x,y,z intention
  action: "None"|"Interact"|"Sprint";
  settings: { fov: number; brightness: number; showGrid: boolean; candleDensity: number; inputGain: number };
  setInit: (init: InitMsg)=>void;
  applyFrame: (frame: StateFrame)=>void;
  setMove: (v:[number,number,number])=>void;
  setAction: (a: GameState["action"])=>void;
  setSettings: (patch: Partial<GameState["settings"]>)=>void;
};

export const useGameStore = create<GameState>((set,get)=>({
  myPos: [0,0,0],
  trail: [],
  players: [], npcs: [], consumables: [],
  moveVec: [0,0,0], action: "None",
  settings: { fov: 72, brightness: 1.0, showGrid: true, candleDensity: 0.06, inputGain: 1.0 },
  setMove: (v)=>set({moveVec:v}),
  setAction: (a)=>set({action:a}),
  setSettings: (patch)=>set({ settings: { ...get().settings, ...patch } }),
  setInit: (init) => {
    const maze = generateMaze(init.seed, 31, 31, 0.08);
    set({ seed: init.seed, roomId: init.roomId, playerId: init.playerId, maze, myPos:[maze.start.x, 0, maze.start.y], trail:[[maze.start.x,0,maze.start.y]] });
  },
  applyFrame: (frame) => {
    // naive local adoption; client-side prediction & reconciliation can be added
    const me = frame.players.find(p=>p.id === get().playerId);
    if (me) {
      const prev = get().myPos;
      const next: [number,number,number] = [me.pos[0], me.pos[1], me.pos[2]];
      const dist = Math.hypot(next[0]-prev[0], next[2]-prev[2]);
      const trail = [...get().trail];
      if (dist > 0.1) trail.push(next);
      while (trail.length > 300) trail.shift();
      set({ players: frame.players, npcs: frame.npcs, consumables: frame.consumables, myPos: next, trail });
    } else {
      set({ players: frame.players, npcs: frame.npcs, consumables: frame.consumables });
    }
  }
}));

