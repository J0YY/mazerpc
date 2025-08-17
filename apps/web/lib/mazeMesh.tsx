import * as THREE from "three";
import type { Maze } from "@sim/core";

/** Build a single instanced wall mesh from grid walls for perf. Pure function (no hooks). */
export function mazeToMesh(maze?: Maze, opts?: { candleDensity?: number }) {
  const g = new THREE.Group();
  if (!maze) return <primitive object={g as any} />;
  const wallGeom = new THREE.BoxGeometry(1.02, 2.6, 0.12);
  const mat = new THREE.MeshStandardMaterial({ color: "#4a4f63", metalness: 0.06, roughness: 0.92 });
  for (const c of maze.cells) {
    const x = c.x, z = c.y;
    // Draw only N and W edges for each cell to avoid duplicates
    if (c.walls.N) { const m = new THREE.Mesh(wallGeom, mat); m.position.set(x,1.5,z-0.5); g.add(m); }
    if (c.walls.W) { const m = new THREE.Mesh(wallGeom, mat); m.position.set(x-0.5,1.5,z); m.rotation.y = Math.PI/2; g.add(m); }
    // Also draw E on the last column and S on the last row
    if (x===maze.w-1 && c.walls.E) { const m = new THREE.Mesh(wallGeom, mat); m.position.set(x+0.5,1.5,z); m.rotation.y = Math.PI/2; g.add(m); }
    if (z===maze.h-1 && c.walls.S) { const m = new THREE.Mesh(wallGeom, mat); m.position.set(x,1.5,z+0.5); g.add(m); }
  }
  // Start marker (warm ember)
  const st = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 24), new THREE.MeshStandardMaterial({color:'#ffa657', emissive:'#e2863a', emissiveIntensity:1.2}));
  st.position.set(maze.start.x, 0.9, maze.start.y);
  g.add(st);
  const stLight = new THREE.PointLight('#e49c5b', 0.7, 6);
  stLight.position.set(maze.start.x, 1.2, maze.start.y);
  g.add(stLight);

  // Exit beacon (cooler green) with light
  const ex = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3,0.1,64,16), new THREE.MeshStandardMaterial({color:'#0f0', emissive:"#49ff88", emissiveIntensity: 1.6}));
  ex.position.set(maze.exit.x, 1.2, maze.exit.y);
  g.add(ex);
  const exLight = new THREE.PointLight('#5bff9c', 0.9, 7);
  exLight.position.set(maze.exit.x, 1.8, maze.exit.y);
  g.add(exLight);

  // Perimeter walls to enclose space
  const perimMat = new THREE.MeshStandardMaterial({ color: '#3a2f2b', metalness: 0.02, roughness: 0.95 });
  const north = new THREE.Mesh(new THREE.BoxGeometry(maze.w+2, 3.5, 0.5), perimMat); north.position.set((maze.w-1)/2,1.75,-1); g.add(north);
  const south = new THREE.Mesh(new THREE.BoxGeometry(maze.w+2, 3.5, 0.5), perimMat); south.position.set((maze.w-1)/2,1.75,maze.h); g.add(south);
  const west  = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, maze.h+2), perimMat); west.position.set(-1,1.75,(maze.h-1)/2); g.add(west);
  const east  = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, maze.h+2), perimMat); east.position.set(maze.w,1.75,(maze.h-1)/2); g.add(east);

  // Ceiling to help orientation
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(maze.w+8, maze.h+8), new THREE.MeshStandardMaterial({ color:'#2b2420', side: THREE.BackSide, metalness:0.02, roughness:0.98 }));
  ceiling.position.set((maze.w-1)/2, 3.2, (maze.h-1)/2);
  ceiling.rotation.x = Math.PI/2;
  g.add(ceiling);

  // Candles along some walls for warmth
  const candleMat = new THREE.MeshStandardMaterial({ color: '#caa26b', emissive: '#e2b76f', emissiveIntensity: 0.7, metalness: 0.0, roughness: 1.0 });
  const candleGeom = new THREE.CylinderGeometry(0.05, 0.06, 0.22, 10);
  let placed = 0;
  const density = Math.max(0, Math.min(0.2, opts?.candleDensity ?? 0.06));
  for (const c of maze.cells) {
    if (placed > 60) break;
    const x = c.x, z = c.y;
    // chance to place a candle at a wall of this cell
    if (Math.random() < density) {
      const walls = (['N','S','E','W'] as Array<'N'|'S'|'E'|'W'>).filter((w)=> (c.walls as any)[w]);
      if (walls.length === 0) continue;
      const w = walls[Math.floor(Math.random()*walls.length)]!;
      const candle = new THREE.Mesh(candleGeom, candleMat);
      const light = new THREE.PointLight('#ffcc88', 0.6, 4);
      if (w==='N') { candle.position.set(x,0.3,z-0.48); light.position.set(x,0.9,z-0.48); }
      if (w==='S') { candle.position.set(x,0.3,z+0.48); light.position.set(x,0.9,z+0.48); }
      if (w==='E') { candle.position.set(x+0.48,0.3,z); light.position.set(x+0.9,0.9,z); }
      if (w==='W') { candle.position.set(x-0.48,0.3,z); light.position.set(x-0.9,0.9,z); }
      g.add(candle); g.add(light); placed++;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <primitive object={g as any} />;
}

