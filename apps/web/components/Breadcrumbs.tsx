"use client";
import { useMemo } from "react";
import { useGameStore } from "../state/gameStore";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export default function Breadcrumbs() {
  const { trail } = useGameStore();
  const points = useMemo(()=>trail.map(p=>new THREE.Vector3(p[0], 0.05, p[2])), [trail]);
  const geom = useMemo(()=>{
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);
  useFrame(()=>{});
  return (
    <line>
      <bufferGeometry attach="geometry" {...(geom as any)} />
      <lineBasicMaterial attach="material" color="#ffd79a" linewidth={2} />
    </line>
  );
}

