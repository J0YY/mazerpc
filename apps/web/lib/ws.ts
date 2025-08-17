import type { InitMsg, ServerMsg, InputMsg } from "@shared/core";
import { useGameStore } from "../state/gameStore";

let socket: WebSocket | null = null;
let playerId: string | null = null;
let roomId: string | null = null;

export async function connectWS(wsBase: string, room: string, player?: string, onInit?: (init: InitMsg)=>void) {
  roomId = room;
  playerId = player ?? crypto.randomUUID();
  socket = new WebSocket(`${wsBase}?room=${room}&player=${playerId}`);
  socket.addEventListener("open", ()=>{ /* ready */ });
  socket.addEventListener("message", (ev) => {
    const data = JSON.parse(String(ev.data)) as ServerMsg;
    if (data.kind === "INIT") {
      onInit?.(data);
    } else if (data.kind === "STATE") {
      useGameStore.getState().applyFrame(data);
    }
  });
}

export function sendInput(msg: Omit<InputMsg, "sig">) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    const payload = JSON.stringify(msg);
    if (typeof payload === "string") socket.send(payload);
  } catch {
    // ignore transient serialization/socket errors
  }
}

export function isSocketReady(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

