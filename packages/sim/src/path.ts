import type { Maze } from "./maze";

export function shortestPathLength(maze: Maze): number {
  // simple BFS on cell centers for a heuristic metric
  const q: [number, number, number][] = [[maze.start.x, maze.start.y, 0]];
  const seen = new Set<string>([`${maze.start.x},${maze.start.y}`]);
  const idx = (x:number,y:number)=>y*maze.w+x;

  while (q.length) {
    const [x,y,d] = q.shift()!;
    if (x===maze.exit.x && y===maze.exit.y) return d;
    const c = maze.cells[idx(x,y)]!;
    if (!c.walls.N) { const ny=y-1; const k=`${x},${ny}`; if(!seen.has(k)){seen.add(k);q.push([x,ny,d+1]);}}
    if (!c.walls.S) { const ny=y+1; const k=`${x},${ny}`; if(!seen.has(k)){seen.add(k);q.push([x,ny,d+1]);}}
    if (!c.walls.E) { const nx=x+1; const k=`${nx},${y}`; if(!seen.has(k)){seen.add(k);q.push([nx,y,d+1]);}}
    if (!c.walls.W) { const nx=x-1; const k=`${nx},${y}`; if(!seen.has(k)){seen.add(k);q.push([nx,y,d+1]);}}
  }
  return Infinity;
}

