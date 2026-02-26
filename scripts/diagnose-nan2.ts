import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";

const st = mkState("4-4-2", "4-4-2");

// Check initial state
console.log("=== BEFORE doKickOff ===");
for (const p of st.pl) {
  console.log(`  #${p.idx} (${p.posLabel}): pos=(${p.pos.x}, ${p.pos.y}), home=(${p.home.x}, ${p.home.y})`);
}
console.log(`  Ball: pos=(${st.ball.pos.x}, ${st.ball.pos.y}), owner=${st.ball.owner}`);

doKickOff(st);

console.log("\n=== AFTER doKickOff ===");
for (const p of st.pl) {
  console.log(`  #${p.idx} (${p.posLabel}): pos=(${p.pos.x}, ${p.pos.y}), home=(${p.home.x}, ${p.home.y})`);
}
console.log(`  Ball: pos=(${st.ball.pos.x}, ${st.ball.pos.y}), owner=${st.ball.owner}`);

// Run one update
update(st);

console.log("\n=== AFTER 1st update ===");
for (const p of st.pl) {
  if (isNaN(p.pos.x) || isNaN(p.pos.y)) {
    console.log(`  NaN! #${p.idx} (${p.posLabel}): pos=(${p.pos.x}, ${p.pos.y}), tgt=(${p.tgt.x}, ${p.tgt.y}), face=(${p.face.x}, ${p.face.y})`);
  }
}
console.log(`  Ball: pos=(${st.ball.pos.x}, ${st.ball.pos.y}), owner=${st.ball.owner}`);
