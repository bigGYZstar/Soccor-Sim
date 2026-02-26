// Diagnostic: Track committed run activation rate and FWD positioning quality
import { mkState, doKickOff, update } from '../client/src/game/engine';

const RUNS = 3;
const DUR = 120;
const DT = 1/60;

for (let run = 0; run < RUNS; run++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st, -1);
  
  // Check what properties players have
  if (run === 0) {
    const p0 = st.pl[1]; // First non-GK
    console.log("Player sample keys:", Object.keys(p0).join(', '));
    console.log("Player sample: idx=", p0.idx, "team=", p0.team, "role=", p0.role, 
      "label=", (p0 as any).label, "posLabel=", (p0 as any).posLabel);
  }
  
  interface PStats {
    role: string;
    posLabel: string;
    frames: number;
    hasCommittedRun: number;
    wantsBall: number;
    sumTgtX: number;
    sumPosX: number;
    maxPosX: number;
    behindCarrier: number;
    aheadCarrier: number;
  }
  
  const stats = new Map<number, PStats>();
  const blue = st.pl.filter(p => p.team === -1 && !p.isGK);
  for (const p of blue) {
    stats.set(p.idx, {
      role: p.role,
      posLabel: (p as any).label || (p as any).posLabel || `P${p.idx}`,
      frames: 0, hasCommittedRun: 0, wantsBall: 0,
      sumTgtX: 0, sumPosX: 0, maxPosX: -100,
      behindCarrier: 0, aheadCarrier: 0
    });
  }
  
  let totalFrames = 0;
  let blueHasBall = 0;
  let freeBall = 0;
  
  for (let t = 0; t < DUR; t += DT) {
    update(st, DT);
    totalFrames++;
    
    const carrier = st.pl.find(p => p.idx === st.ball.owner);
    if (!carrier) { freeBall++; continue; }
    if (carrier.team !== -1) continue;
    blueHasBall++;
    
    for (const p of blue) {
      const s = stats.get(p.idx)!;
      s.frames++;
      if (p.committedRunTarget && p.committedRunTimer > 0) s.hasCommittedRun++;
      if (p.wantsBall) s.wantsBall++;
      s.sumTgtX += p.tgt.x;
      s.sumPosX += p.pos.x;
      if (p.pos.x > s.maxPosX) s.maxPosX = p.pos.x;
      
      const attackDir = 1;
      if ((p.pos.x - carrier.pos.x) * attackDir > 2.0) s.aheadCarrier++;
      else s.behindCarrier++;
    }
  }
  
  console.log(`\n=== Run ${run+1} ===`);
  console.log(`Frames: ${totalFrames}, BlueHasBall: ${blueHasBall} (${(blueHasBall/totalFrames*100).toFixed(0)}%), Free: ${freeBall} (${(freeBall/totalFrames*100).toFixed(0)}%)`);
  console.log(`Label   Role  | CommitRun% | WantsBall% | AvgTgtX | AvgPosX | MaxPosX | AheadCarrier%`);
  
  for (const [idx, s] of stats) {
    if (s.frames === 0) continue;
    const crPct = (s.hasCommittedRun / s.frames * 100).toFixed(0);
    const wbPct = (s.wantsBall / s.frames * 100).toFixed(0);
    const avgTgt = (s.sumTgtX / s.frames).toFixed(1);
    const avgPos = (s.sumPosX / s.frames).toFixed(1);
    const ahead = (s.aheadCarrier / s.frames * 100).toFixed(0);
    console.log(`${s.posLabel.padEnd(7)} ${s.role.padEnd(5)} | ${crPct.padStart(9)}% | ${wbPct.padStart(9)}% | ${avgTgt.padStart(7)} | ${avgPos.padStart(7)} | ${s.maxPosX.toFixed(1).padStart(7)} | ${ahead.padStart(12)}%`);
  }
}
