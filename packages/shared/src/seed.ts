import crypto from "node:crypto";

/** Stable, reproducible seed (can include drand round externally). */
export function deriveSeed(mode: string, salt: string, roomUUID: string) {
  const s = `${mode}|${salt}|${roomUUID}`;
  return crypto.createHash("sha256").update(s).digest("hex");
}
export function hashLayout(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

