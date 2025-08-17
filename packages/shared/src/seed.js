import crypto from "node:crypto";
/** Stable, reproducible seed (can include drand round externally). */
export function deriveSeed(mode, salt, roomUUID) {
    const s = `${mode}|${salt}|${roomUUID}`;
    return crypto.createHash("sha256").update(s).digest("hex");
}
export function hashLayout(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}
