"use client";
import { useGameStore } from "../state/gameStore";

export default function Settings() {
  const { settings, setSettings } = useGameStore();
  return (
    <div style={{position:"absolute", left:16, bottom:16, padding:"10px 12px", borderRadius:12, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.08)", color:"#eaeef2", fontSize:12, display:"flex", gap:10, alignItems:"center"}}>
      <label>FOV <input type="range" min={60} max={95} value={settings.fov} onChange={e=>setSettings({fov: Number(e.target.value)})}/></label>
      <label>Brightness <input type="range" min={0.5} max={1.5} step={0.05} value={settings.brightness} onChange={e=>setSettings({brightness: Number(e.target.value)})}/></label>
      <label>Grid <input type="checkbox" checked={settings.showGrid} onChange={e=>setSettings({showGrid: e.target.checked})}/></label>
      <label>Candles <input type="range" min={0} max={0.15} step={0.01} value={settings.candleDensity} onChange={e=>setSettings({candleDensity: Number(e.target.value)})}/></label>
      <label>Speed <input type="range" min={0.2} max={1.0} step={0.05} value={settings.inputGain} onChange={e=>setSettings({inputGain: Number(e.target.value)})}/></label>
    </div>
  );
}

