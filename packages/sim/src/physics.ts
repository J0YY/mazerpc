import type { Maze } from "./maze";

/** Tiny axis-aligned collision vs. wall grid; FPV capsule approximated as point with radius. */
export function stepPosition(pos: [number,number,number], vel: [number,number,number], dt: number, maze: Maze, radius=0.2): [number,number,number] {
  let [x,y,z]=pos; let [vx,vy,vz]=vel;
  // Substep integration to reduce tunneling through walls
  const steps = 10;
  const sdt = dt/steps;
  function blocked(x0:number,z0:number,x1:number,z1:number): boolean {
    const cx0=Math.floor(x0+0.5), cz0=Math.floor(z0+0.5);
    const cx1=Math.floor(x1+0.5), cz1=Math.floor(z1+0.5);
    if(cx0===cx1&&cz0===cz1) return false;
    const idx=(x:number,z:number)=>z*maze.w+x;
    const c0=maze.cells[idx(cx0,cz0)]!;
    if (cx1>cx0 && c0.walls.E) return true;
    if (cx1<cx0 && c0.walls.W) return true;
    if (cz1>cz0 && c0.walls.S) return true;
    if (cz1<cz0 && c0.walls.N) return true;
    return false;
  }
  for (let i=0;i<steps;i++){
    // per-axis sweep to avoid corner tunneling
    let nx=x+vx*sdt, nz=z;
    if (blocked(x,z,nx,z)) nx=x;
    x=nx;
    nz=z+vz*sdt;
    if (blocked(x,z,x,nz)) nz=z;
    z=nz;
  }
  return [x,y,z];
}

