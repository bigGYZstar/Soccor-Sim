import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';
import { vdist } from '../client/src/game/math';

const DT = 1 / 60;
const MAX_STEPS = 600; // 10 seconds

console.log(`Running 10-second position tracking...`);
console.log("--------------------------------------------------\n");

const st = mkState();
doKickOff(st);

// Track positions at 2s intervals
const snapshots = [2, 4, 6, 8, 10];
let nextSnapshot = 0;

for (let step = 0; step < MAX_STEPS; step++) {
  update(st, DT);
  
  if (nextSnapshot < snapshots.length && st.time >= snapshots[nextSnapshot]) {
    console.log(`\n[${st.time.toFixed(1)}s] Position Snapshot:`);
    console.log(`Ball: (${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}), Owner: ${st.ball.owner !== null ? `Player ${st.ball.owner}` : "Free"}`);
    
    if (st.ball.owner !== null) {
      const owner = st.pl[st.ball.owner];
      console.log(`  Owner: Player ${st.ball.owner} (${owner.team > 0 ? "RED" : "BLUE"} ${owner.role}) at (${owner.pos.x.toFixed(1)}, ${owner.pos.y.toFixed(1)})`);
      
      // Find closest Red player
      let closestRed = -1;
      let closestDist = Infinity;
      for (let i = 11; i < 22; i++) {
        const dist = vdist(st.pl[i].pos, owner.pos);
        if (dist < closestDist) {
          closestDist = dist;
          closestRed = i;
        }
      }
      
      if (closestRed >= 0) {
        const red = st.pl[closestRed];
        console.log(`  Closest RED: Player ${closestRed} (${red.role}) at (${red.pos.x.toFixed(1)}, ${red.pos.y.toFixed(1)}), distance: ${closestDist.toFixed(2)}`);
        console.log(`    Action: ${red.act}, Target: (${red.tgt.x.toFixed(1)}, ${red.tgt.y.toFixed(1)}), dt: ${red.dt.toFixed(3)}`);
      }
      
      // Check Blue owner's act
      console.log(`  Owner Action: ${owner.act}, dt: ${owner.dt.toFixed(3)}`);
      if (owner.act === "idle") {
        console.log(`    WARNING: Owner is idle!`);
      }
    }
    
    nextSnapshot++;
  }
}

console.log("\n==================================================");
console.log("📊 POSITION TRACKING COMPLETE");
console.log("==================================================");
console.log(`Final Score: BLUE ${st.sL} - ${st.sR} RED`);
console.log(`Ball Owner: ${st.ball.owner !== null ? `Player ${st.ball.owner} (${st.pl[st.ball.owner].team > 0 ? "RED" : "BLUE"})` : "Free"}`);
console.log("==================================================");
