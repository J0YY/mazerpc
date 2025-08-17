"use client";
import { useEffect, useState } from "react";
import { useGameStore } from "../state/gameStore";

/** Placeholder UI stream; in a later step, subscribe to server "banter" events. */
export default function RadioFeed() {
  const [lines, setLines] = useState<string[]>([]);
  const { myPos, maze } = useGameStore();
  useEffect(()=>{
    const i = setInterval(()=>{
      const roll = Math.random();
      if (roll<0.2 && maze) {
        // sometimes generate a dynamic hot/cold hint (truthy 70% of time)
        const dx = maze.exit.x - myPos[0];
        const dz = maze.exit.y - myPos[2];
        const dir = Math.abs(dx) > Math.abs(dz)
          ? (dx>0?"east":"west")
          : (dz>0?"south":"north");
        const spicy = Math.random()<0.7 ? `i hear freedom to the ${dir}.` : `the ${dir} smells like a trap.`;
        setLines(l=>[...l.slice(-10), spicy]);
      } else if (roll<0.5) {
        setLines(l=>[...l.slice(-10), randomTaunt()]);
      }
    }, 1000);
    return ()=>clearInterval(i);
  }, []);
  return (
    <div style={{position:"absolute", top:16, right:16, width:300, padding:"12px 14px", background:"rgba(8,10,13,0.45)", borderRadius:12, backdropFilter:"blur(6px)", boxShadow:"0 8px 24px rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", fontSize:12, lineHeight:1.3}}>
      <div style={{opacity:0.85, marginBottom:8, fontWeight:700}}>📻 Rival radio</div>
      {lines.map((t,i)=><div key={i} style={{opacity:0.92, marginBottom:6}}>{t}</div>)}
    </div>
  );
}
function randomTaunt(): string {
  const z: string[] = [
    "WHO TURNED OFF THE SKY? run, runner.",
    "left left LEFT—no, other left.",
    "footsteps taste like fear. delicious.",
    "i traded a map for your courage. bad deal.",
    "walls breathe here. some of them lie.",
    "tick tick—your luck is thin ice.",
    "i can smell daylight bleeding through stone.",
    "your shadow knows the exit. try to keep up.",
    "this corridor bites back.",
    "if you sprint now, i’ll stop whispering. maybe.",
    "compass says ‘chaos’. good compass.",
    "turn back! (kidding.) (or am i?)",
    "i left breadcrumbs. wolves ate them.",
    "north tastes like smoke. south tastes like triumph.",
    "your heartbeat is a drum solo and the maze loves music."
  ];
  return z[Math.floor(Math.random()*z.length)]!;
}

