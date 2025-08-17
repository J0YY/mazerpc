"use client";
import { useEffect, useState } from "react";
import { useGameStore } from "../state/gameStore";

export default function HUD() {
  const { action, setAction, setMove, myPos } = useGameStore();
  const [timeLeft, setTimeLeft] = useState(5*60); // 5 min timer (client-side UI only)
  useEffect(()=>{
    const keys = new Set<string>();
    function onKey(e: KeyboardEvent) {
      if (e.type==="keydown") keys.add(e.code); else keys.delete(e.code);
      const forward = (keys.has("KeyW")?1:0) + (keys.has("ArrowUp")?1:0) - (keys.has("KeyS")?1:0) - (keys.has("ArrowDown")?1:0);
      const right = (keys.has("KeyD")?1:0) + (keys.has("ArrowRight")?1:0) - (keys.has("KeyA")?1:0) - (keys.has("ArrowLeft")?1:0);
      setMove([right, 0, forward]);
      setAction(keys.has("ShiftLeft")||keys.has("ShiftRight") ? "Sprint" : "None");
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const i = setInterval(()=>setTimeLeft(t=>Math.max(0, t-1)), 1000);
    return ()=>{ window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); clearInterval(i); };
  }, [setMove, setAction]);

  return (
    <div style={{position:"absolute", top:16, left:16, padding:"10px 12px", background:"rgba(8,10,13,0.55)", borderRadius:12, backdropFilter:"blur(6px)", boxShadow:"0 8px 24px rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{display:"flex", alignItems:"baseline", gap:8}}>
        <div style={{fontWeight:800, letterSpacing:0.6, fontSize:14, opacity:0.9}}>⏱</div>
        <div style={{fontWeight:800, letterSpacing:1.5, fontSize:14}}>{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,"0")}</div>
      </div>
      <div style={{opacity:0.75, fontSize:12, marginTop:4}}>Shift = sprint • WASD (view-relative) • F toggle FPV • Esc unlock</div>
      <div style={{marginTop:6, fontSize:12, opacity:0.65}}>Action: <span style={{fontWeight:600}}>{action}</span></div>
      <div style={{marginTop:6, fontSize:10, opacity:0.5}}>Pos: {myPos.map(n=>n.toFixed(2)).join(", ")}</div>
    </div>
  );
}

