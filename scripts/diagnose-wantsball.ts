// Quick diagnostic to check wantsBall state during possession
import { mkState, update, doKickOff } from '../client/src/game/engine';
import { vdist } from '../client/src/game/math';

const DT = 1 / 60;
const FRAMES = 60 * 60 * 3;

const st = mkState("4-4-2", "4-4-2", 1);
doKickOff(st);

let wantsBallFrames: Record<string, number> = {};
let longPassOpportunities = 0;
let longPassBlocked: Record<string, number> = {
  noWantsBall: 0,
  notWide: 0,
  tooClose: 0,
  tooFar: 0,
  notAhead: 0,
  noOpenness: 0,
  lowScore: 0,
  randomBlock: 0,
  carrierIsFwd: 0,
  carrierIsGK: 0,
};

for (let f = 0; f < FRAMES; f++) {
  update(st, DT);
  
  // Track wantsBall
  for (const p of st.pl) {
    const key = `${p.team === -1 ? 'B' : 'R'} #${p.num}(${p.posLabel || p.role})`;
    if (!wantsBallFrames[key]) wantsBallFrames[key] = 0;
    if (p.wantsBall) wantsBallFrames[key]++;
  }
  
  // Check if proactive long pass conditions are met
  if (st.ball.owner !== null) {
    const me = st.pl[st.ball.owner];
    if (me.isGK) { longPassBlocked.carrierIsGK++; continue; }
    if (me.role === "FWD") { longPassBlocked.carrierIsFwd++; continue; }
    
    for (let i = 0; i < st.pl.length; i++) {
      const tm = st.pl[i];
      if (tm.team !== me.team || i === st.ball.owner) continue;
      
      const isWide = Math.abs(tm.home.y) > 15.0 || tm.role === "FWD";
      if (!isWide) continue;
      
      if (!tm.wantsBall) { longPassBlocked.noWantsBall++; continue; }
      
      const dist = vdist(me.pos, tm.pos);
      if (dist < 10.0) { longPassBlocked.tooClose++; continue; }
      if (dist > 40.0) { longPassBlocked.tooFar++; continue; }
      
      const gp = (tm.pos.x - me.pos.x) * -me.team;
      if (gp < 2.0) { longPassBlocked.notAhead++; continue; }
      
      longPassOpportunities++;
    }
  }
}

console.log("\n=== wantsBall frames (out of", FRAMES, ") ===");
const sorted = Object.entries(wantsBallFrames).sort((a, b) => b[1] - a[1]);
for (const [key, count] of sorted) {
  console.log(`  ${key}: ${count} (${(count/FRAMES*100).toFixed(1)}%)`);
}

console.log("\n=== Long pass opportunity blockers ===");
for (const [key, count] of Object.entries(longPassBlocked)) {
  console.log(`  ${key}: ${count}`);
}
console.log(`  Opportunities found: ${longPassOpportunities}`);
