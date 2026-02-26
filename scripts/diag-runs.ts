// Diagnostic: Measure forward run frequency, overtaking, and quality
import { mkState, doKickOff, update } from '../client/src/game/engine';
const DT = 1/60;
const FRAMES = 60 * 120; // 2 minutes
const RUNS = 3;

for (let run = 0; run < RUNS; run++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st);
  
  let samples = 0;
  let blueHasBall = 0, redHasBall = 0, freeBall = 0;
  
  // Track per-player for BOTH teams
  const aheadCount: Map<number, { label: string; role: string; team: number; ahead: number; behind: number; aheadOfBall: number; behindBall: number; totalSamples: number; maxForwardOfCarrier: number; sumDistAhead: number; countAhead: number }> = new Map();
  
  let overtakeEvents = 0;
  const prevAhead: Map<number, boolean> = new Map();
  
  for (let f = 0; f < FRAMES; f++) {
    update(st, DT);
    
    if (f % 6 === 0) {
      samples++;
      
      // Find any ball carrier
      const carrier = st.ball.owner !== null ? st.pl[st.ball.owner] : null;
      if (!carrier) { freeBall++; continue; }
      if (carrier.team === -1) blueHasBall++;
      else redHasBall++;
      
      const teamToTrack = carrier.team; // Track the team that has the ball
      const attackDir = -teamToTrack; // Attack direction
      
      for (const p of st.pl) {
        if (p.team !== teamToTrack || p.isGK || p.idx === carrier.idx) continue;
        if (p.role !== "FWD" && p.role !== "MID") continue;
        
        if (!aheadCount.has(p.idx)) {
          aheadCount.set(p.idx, { 
            label: p.posLabel, role: p.role, team: p.team,
            ahead: 0, behind: 0, 
            aheadOfBall: 0, behindBall: 0,
            totalSamples: 0, maxForwardOfCarrier: 0,
            sumDistAhead: 0, countAhead: 0
          });
        }
        const entry = aheadCount.get(p.idx)!;
        entry.totalSamples++;
        
        // "Ahead" means further toward opponent goal than carrier
        const distAhead = (p.pos.x - carrier.pos.x) * attackDir;
        const distAheadBall = (p.pos.x - st.ball.pos.x) * attackDir;
        
        if (distAhead > 1.0) {
          entry.ahead++;
          entry.sumDistAhead += distAhead;
          entry.countAhead++;
          if (distAhead > entry.maxForwardOfCarrier) entry.maxForwardOfCarrier = distAhead;
        } else {
          entry.behind++;
        }
        
        if (distAheadBall > 1.0) entry.aheadOfBall++;
        else entry.behindBall++;
        
        // Track overtaking events (transition from behind to ahead of carrier)
        const wasAhead = prevAhead.get(p.idx) ?? false;
        const isAhead = distAhead > 1.0;
        if (!wasAhead && isAhead && p.team === -1) overtakeEvents++;
        prevAhead.set(p.idx, isAhead);
      }
    }
  }
  
  console.log(`\nRun ${run+1}: Overtake events (Blue): ${overtakeEvents}`);
  console.log(`Ball ownership: Blue=${(blueHasBall/samples*100).toFixed(0)}%, Red=${(redHasBall/samples*100).toFixed(0)}%, Free=${(freeBall/samples*100).toFixed(0)}%`);
  
  // Show Blue team stats
  console.log(`\n--- Blue Team (FWD+MID) ---`);
  console.log(`${"Label".padEnd(6)} ${"Role".padEnd(4)} | AheadCarrier% | AheadBall% | MaxFwdDist | AvgFwdDist`);
  for (const [idx, e] of aheadCount) {
    if (e.team !== -1 || e.totalSamples === 0) continue;
    const aheadPct = (e.ahead / e.totalSamples * 100).toFixed(0);
    const aheadBallPct = (e.aheadOfBall / e.totalSamples * 100).toFixed(0);
    const maxFwd = e.maxForwardOfCarrier.toFixed(1);
    const avgFwd = e.countAhead > 0 ? (e.sumDistAhead / e.countAhead).toFixed(1) : "0.0";
    console.log(`${e.label.padEnd(6)} ${e.role.padEnd(4)} | ${aheadPct.padStart(12)}% | ${aheadBallPct.padStart(9)}% | ${maxFwd.padStart(10)} | ${avgFwd.padStart(10)}`);
  }
}
