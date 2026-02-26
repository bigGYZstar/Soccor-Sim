import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";

const DT = 1 / 60;
const FPS = 60;
const MATCH_SECONDS = 90;
const TOTAL_FRAMES = MATCH_SECONDS * FPS;
const PITCH_HALF_W = 52.5;
const PHASE_B_THRESHOLD = 2 * PITCH_HALF_W / 3; // 35.0m

const NUM_MATCHES = 5;

for (let m = 0; m < NUM_MATCHES; m++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st);
  
  let maxFwdBlue = -Infinity;
  let maxFwdRed = -Infinity;
  let phaseBFramesBlue = 0;
  let phaseBFramesRed = 0;
  let carryCount = 0;
  let carryTotalDist = 0;
  let maxCarryDist = 0;
  
  // Track per-second snapshots
  const snapshots: { t: number; ownerTeam: number | null; ax: number; action: string }[] = [];
  
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    update(st, DT);
    
    if (st.ball.owner !== null) {
      const owner = st.pl[st.ball.owner];
      const ax = owner.pos.x * -owner.team;
      
      if (owner.team === 1) {
        if (ax > maxFwdBlue) maxFwdBlue = ax;
        if (ax >= PHASE_B_THRESHOLD) phaseBFramesBlue++;
      } else {
        if (ax > maxFwdRed) maxFwdRed = ax;
        if (ax >= PHASE_B_THRESHOLD) phaseBFramesRed++;
      }
      
      // Track carry events
      if (owner.act === "carry") {
        carryCount++;
      }
      
      if (f % FPS === 0) {
        snapshots.push({
          t: f / FPS,
          ownerTeam: owner.team,
          ax: ax,
          action: owner.act || "idle"
        });
      }
    } else if (f % FPS === 0) {
      snapshots.push({ t: f / FPS, ownerTeam: null, ax: 0, action: "free" });
    }
  }
  
  console.log(`Match ${m+1}:`);
  console.log(`  Max forward: Blue=${maxFwdBlue.toFixed(1)}m, Red=${maxFwdRed.toFixed(1)}m (PhaseB=${PHASE_B_THRESHOLD.toFixed(0)}m)`);
  console.log(`  PhaseB frames: Blue=${phaseBFramesBlue}, Red=${phaseBFramesRed}`);
  console.log(`  Carry frames: ${carryCount}`);
  
  // Show snapshots where ax > 10
  const deepSnapshots = snapshots.filter(s => s.ax > 10);
  if (deepSnapshots.length > 0) {
    console.log(`  Deep penetrations (ax>10m):`);
    for (const s of deepSnapshots.slice(0, 5)) {
      console.log(`    t=${s.t}s: team=${s.ownerTeam === 1 ? "Blue" : "Red"} ax=${s.ax.toFixed(1)}m action=${s.action}`);
    }
  } else {
    console.log(`  No deep penetrations (ax>10m)`);
  }
}
