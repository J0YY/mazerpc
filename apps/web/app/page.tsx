"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PointerLockControls, OrbitControls, ContactShadows, Grid } from "@react-three/drei";
import { useGameStore } from "../state/gameStore";
import { mazeToMesh } from "../lib/mazeMesh";
import { connectWS, sendInput, isSocketReady } from "../lib/ws";
import HUD from "../components/HUD";
import RadioFeed from "../components/RadioFeed";
import Settings from "../components/Settings";
import Breadcrumbs from "../components/Breadcrumbs";
import HotColdPanel from "../components/HotColdPanel";

export const dynamic = "force-dynamic";

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [fpv, setFpv] = useState(false);
  const { maze, seed, playerId, roomId, setInit, players, npcs, consumables, settings } = useGameStore();

  useEffect(() => {
    // handshake: fetch seed/room and then ws connect
    async function start() {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_HTTP ?? "http://localhost:8080"}/seed/daily`).then(r=>r.json());
      await connectWS(res.ws ?? "ws://localhost:8080/ws", res.roomId, undefined, (init)=>{
        setInit(init);
        setConnected(true);
      });
    }
    start();
  }, [setConnected, setInit]);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if (e.code === "KeyF") setFpv(v=>!v);
    }
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  },[]);

  return (
    <div style={{height:"100dvh", width:"100%", position:"relative"}}>
      <Canvas camera={{ fov: settings.fov, position:[0, 1.6, 0] }} shadows>
        <Scene fpv={fpv} />
        {fpv ? (
          <PointerLockControls onUnlock={()=>setFpv(false)} />
        ) : (
          <OrbitControls enableDamping makeDefault enablePan={false} enableZoom={false} minPolarAngle={0.35} maxPolarAngle={1.2} minDistance={3} maxDistance={6} />
        )}
      </Canvas>
      <HUD />
      <RadioFeed />
      <Settings />
      <HotColdPanel />
      {!connected && <div style={{position:"absolute", inset:0, display:"grid", placeItems:"center"}}>Connecting…</div>}
      <div style={{position:"absolute", right:16, bottom:16, display:"flex", gap:8}}>
        <button onClick={()=>setFpv(f=>!f)} style={{padding:"8px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(8,10,13,0.4)", color:"#eaeef2"}}>
          {fpv ? "Exit FPV (Esc)" : "Enter FPV (F)"}
        </button>
      </div>
      {/* crosshair */}
      {fpv && (
        <div style={{position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)", display:"grid", placeItems:"center"}}>
          <div style={{width:18, height:18, borderRadius:"50%", border:"3px solid rgba(255,255,255,0.8)", boxShadow:"0 0 12px rgba(255,220,180,0.45)"}}/>
          <div style={{position:"absolute", width:4, height:4, borderRadius:"50%", background:"rgba(255,255,255,0.9)"}}/>
        </div>
      )}
    </div>
  );
}

function Scene({ fpv }: { fpv: boolean }) {
  const { maze, myPos, settings } = useGameStore();
  const mesh = useMemo(()=> maze ? mazeToMesh(maze, { candleDensity: settings.candleDensity }) : null, [maze, settings.candleDensity]);

  // Client-side tick: sample inputs and send
  const seqRef = useRef(0);
  const { camera } = useThree();
  const initRef = useRef(false);
  useFrame(({ clock }) => {
    try {
      if (!isSocketReady()) return;
      const t = Math.floor(clock.elapsedTime * 1000);
      const { moveVec, action, settings } = useGameStore.getState();
      if (Array.isArray(moveVec) && moveVec.length === 3) {
        // View-relative input → world x/z components
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const fwdX = dir.x; const fwdZ = dir.z;
        const len = Math.hypot(fwdX, fwdZ) || 1;
        const nx = fwdX / len; const nz = fwdZ / len;
        const rx = -nz; const rz = nx; // right = perpendicular on XZ
        const forwardIn = moveVec[2] ?? 0; // W/S
        const rightIn = moveVec[0] ?? 0;   // D/A
        const worldX = nx * forwardIn + rx * rightIn;
        const worldZ = nz * forwardIn + rz * rightIn;
        // normalize diagonal to prevent faster diagonals
        const mag = Math.hypot(worldX, worldZ) || 1;
        const nxzX = worldX / mag;
        const nxzZ = worldZ / mag;
        const clamp = (v:number)=>Math.max(-1, Math.min(1, v));
        const gain = Math.max(0.2, Math.min(1.0, settings.inputGain));
        sendInput({ t_client: t, seq: seqRef.current++, move: [clamp(nxzZ*gain), clamp(nxzX*gain), 0], action });
      }
    } catch {
      // ignore one-off frame errors
    }
  });

  return (
    <>
      <CameraRig enabled={fpv} />
      <color attach="background" args={["#14110f"]} />
      <fog attach="fog" args={["#1a1714", 8, 60]} />
      <ambientLight intensity={0.6*settings.brightness} color={"#ffedd5"}/>
      <directionalLight position={[6,10,4]} intensity={0.8*settings.brightness} color={"#ffd5a6"} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}/>
      {mesh}
      <Breadcrumbs />
      <mesh position={[0,-0.01,0]} receiveShadow>
        <planeGeometry args={[400,400]} />
        <meshStandardMaterial color="#2f2720" />
      </mesh>
      <ContactShadows position={[0,0,0]} opacity={0.4} scale={50} blur={2} far={8} />
      {settings.showGrid && <Grid cellColor="#2a2724" sectionColor="#3b342f" position={[0,-0.01,0]} args={[200,200]} fadeDistance={50} fadeStrength={2} infiniteGrid />}
    </>
  );
}

function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const { myPos, maze } = useGameStore();
  const initRef = useRef(false);
  // Keep camera near player when not FPV for better context
  useEffect(()=>{
    if (enabled) return;
    camera.position.set(myPos[0] + 6, 6, myPos[2] + 6);
    camera.lookAt(myPos[0], 1.2, myPos[2]);
  }, [enabled, myPos, camera]);
  useFrame(()=>{
    if (!initRef.current && maze) {
      // Orient camera toward first open direction from start to avoid staring at a wall
      const start = maze.start;
      const idx = (x:number,y:number)=>y*maze.w+x;
      const c = maze.cells[idx(start.x, start.y)]!;
      let look = {x: start.x, z: start.y+1};
      if (!c.walls.S) look = {x:start.x, z:start.y+1};
      else if (!c.walls.N) look = {x:start.x, z:start.y-1};
      else if (!c.walls.E) look = {x:start.x+1, z:start.y};
      else if (!c.walls.W) look = {x:start.x-1, z:start.y};
      camera.position.set(start.x+0.5, 1.7, start.y+0.5);
      camera.lookAt(look.x, 1.5, look.z);
      initRef.current = true;
    }
    if (!enabled) return;
    const target = [myPos[0], 1.6, myPos[2]] as const;
    camera.position.set(target[0], target[1], target[2]);
  });
  return null;
}

