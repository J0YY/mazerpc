"use client";
import { useEffect, useState } from "react";

export default function OpsPage() {
  const [state, setState] = useState<{injectLatencyMs:number; dropPct:number}>({injectLatencyMs:0, dropPct:0});
  useEffect(()=>{ fetch(`${process.env.NEXT_PUBLIC_SERVER_HTTP ?? "http://localhost:8080"}/ops/state`).then(r=>r.json()).then(setState); },[]);
  async function update(patch: Partial<typeof state>) {
    const next = {...state, ...patch};
    setState(next);
    await fetch(`${process.env.NEXT_PUBLIC_SERVER_HTTP ?? "http://localhost:8080"}/ops/state`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(next) });
  }
  return (
    <main style={{padding:24}}>
      <h1>Ops HUD</h1>
      <label>Latency (ms): <input type="number" value={state.injectLatencyMs} onChange={e=>update({injectLatencyMs: Number(e.target.value)})}/></label>
      <label style={{marginLeft:16}}>Drop %: <input type="number" value={state.dropPct} onChange={e=>update({dropPct: Number(e.target.value)})}/></label>
      <p style={{opacity:0.7, marginTop:12}}>Use this to demo graceful degradation (prediction horizon ↑, hints pause, etc.).</p>
    </main>
  );
}

