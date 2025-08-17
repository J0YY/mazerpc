import { prng, seedFromHex } from "@shared/core";

/** Grid maze with walls; recursive backtracker + loop-carving. */
export type Cell = { x: number; y: number; walls: {N:boolean;S:boolean;E:boolean;W:boolean} };
export type Maze = {
  w: number; h: number; cells: Cell[];
  start: {x:number;y:number}; exit: {x:number;y:number};
};

export function generateMaze(seedHex: string, w=31, h=31, loopiness=0.08): Maze {
  const rnd = prng(seedFromHex(seedHex));
  const idx = (x:number,y:number)=>y*w+x;
  const inb = (x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h;

  const cells: Cell[] = Array.from({length:w*h}, (_,i)=>({
    x:i%w, y:Math.floor(i/w),
    walls:{N:true,S:true,E:true,W:true}
  }));
  const visited = new Set<number>();
  const stack: [number, number][] = [[1,1]];
  visited.add(idx(1,1));

  const dirs = [[0,-1,"N","S"],[0,1,"S","N"],[1,0,"E","W"],[-1,0,"W","E"]] as const;

  while(stack.length){
    const [cx,cy] = stack[stack.length-1]!;
    const neighbors = dirs
      .map(d => [cx+d[0]*2, cy+d[1]*2, d] as const)
      .filter(([nx,ny])=>inb(nx,ny) && !visited.has(idx(nx,ny)));
    if(neighbors.length===0){ stack.pop(); continue; }
    const choice = neighbors[Math.floor(rnd()*neighbors.length)]!;
    const [nx,ny,d] = choice;
    const mx=cx+d[0], my=cy+d[1];
    // knock down wall between current and mid, mid and next
    const c = cells[idx(cx,cy)]!;
    const m = cells[idx(mx,my)]!;
    const n = cells[idx(nx,ny)]!;
    (c.walls as any)[d[2]] = false;
    (m.walls as any)[d[3]] = false;
    (m.walls as any)[d[2]] = false;
    (n.walls as any)[d[3]] = false;

    visited.add(idx(nx,ny));
    stack.push([nx,ny]);
  }

  // loop carving
  const carveCount = Math.floor(w*h*loopiness);
  for(let i=0;i<carveCount;i++){
    const x = Math.floor(rnd()*w), y = Math.floor(rnd()*h);
    const dir = dirs[Math.floor(rnd()*dirs.length)]!;
    const tx=x+dir[0], ty=y+dir[1];
    if(!inb(x,y)||!inb(tx,ty)) continue;
    const a = cells[idx(x,y)]!, b = cells[idx(tx,ty)]!;
    (a.walls as any)[dir[2]] = false;
    (b.walls as any)[dir[3]] = false;
  }

  // start/exit roughly opposite corners on odd cells
  const start = {x:1,y:1};
  const exit = {x:w-2,y:h-2};
  return { w, h, cells, start, exit };
}

