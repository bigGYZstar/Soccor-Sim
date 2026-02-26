import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

for (let f = 0; f < 600; f++) { // 10 seconds
  update(st);
  
  // Check for NaN
  if (isNaN(st.ball.pos.x) || isNaN(st.ball.pos.y)) {
    console.log(`NaN detected at frame ${f}!`);
    console.log(`Ball: pos=(${st.ball.pos.x}, ${st.ball.pos.y}), vel=(${st.ball.vel.x}, ${st.ball.vel.y})`);
    console.log(`Ball owner: ${st.ball.owner}, free: ${st.ball.free}`);
    
    // Check all players for NaN
    for (const p of st.pl) {
      if (isNaN(p.pos.x) || isNaN(p.pos.y) || isNaN(p.tgt.x) || isNaN(p.tgt.y)) {
        console.log(`  Player #${p.idx} (${p.posLabel}/${p.role}): pos=(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}), tgt=(${p.tgt.x.toFixed(1)}, ${p.tgt.y.toFixed(1)})`);
      }
    }
    break;
  }
  
  // Check all players for NaN
  for (const p of st.pl) {
    if (isNaN(p.pos.x) || isNaN(p.pos.y) || isNaN(p.tgt.x) || isNaN(p.tgt.y)) {
      console.log(`Player NaN at frame ${f}: #${p.idx} (${p.posLabel}/${p.role}): pos=(${p.pos.x}, ${p.pos.y}), tgt=(${p.tgt.x}, ${p.tgt.y}), home=(${p.home.x}, ${p.home.y})`);
      console.log(`  wantsBall=${p.wantsBall}, passAndMoveTimer=${p.passAndMoveTimer}`);
      process.exit(1);
    }
  }
}

console.log("No NaN detected in 10 seconds");
console.log(`Ball at frame 600: pos=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
