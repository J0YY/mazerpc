"use client";
import { useMemo } from "react";
import { useGameStore } from "../state/gameStore";

export default function HotColdPanel() {
  const { maze, myPos } = useGameStore();
  const { dist, pct, label } = useMemo(()=>{
    if (!maze) return { dist: 0, pct: 0, label: "" };
    const dx = maze.exit.x - myPos[0];
    const dz = maze.exit.y - myPos[2];
    const d = Math.hypot(dx,dz);
    const baseline = Math.hypot(maze.exit.x - maze.start.x, maze.exit.y - maze.start.y) || 1;
    const p = Math.max(0, Math.min(1, 1 - d / baseline));
    const text = d<3 ? "BLAZING" : d<6 ? "HOT" : d<10 ? "WARM" : "COLD";
    return { dist: d, pct: p, label: text };
  }, [maze, myPos]);
  if (!maze) return null;
  return (
    <div style={{position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", width:200, padding:"12px", borderRadius:12, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.08)", color:"#eaeef2", fontSize:12}}>
      <div style={{marginBottom:6, opacity:0.8}}>Escape proximity</div>
      <div style={{height:8, borderRadius:6, background:"rgba(255,255,255,0.12)", overflow:"hidden"}}>
        <div style={{height:"100%", width:`${Math.round(pct*100)}%`, background:"linear-gradient(90deg,#ff9a3c,#ffd56b)", boxShadow:"0 0 12px rgba(255,213,107,0.4) inset"}}/>
      </div>
      <div style={{marginTop:6, opacity:0.7}}>Status: {label} ({dist.toFixed(1)}m)</div>
    </div>
  );
}

