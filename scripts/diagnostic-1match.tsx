import { mkState, update } from "../client/src/game/engine";
import { P as PExt } from "../client/src/game/constants";

const st = mkState();
let maxBallAX = -Infinity;
let maxCarrierAX = -Infinity;
let attThirdFrames = 0;
let possFrames = 0;
let shots = 0;

// Run for 300 seconds (30000 frames at 0.01s per frame)
for (let i = 0; i < 30000; i++) {
  update(st, 0.01);
  
  // Track ball and carrier positions
  if (st.ball && st.ball.pos) {
    const ballAX = Math.abs(st.ball.pos.x);
    if (ballAX > maxBallAX) maxBallAX = ballAX;
  }
  
  if (st.ball && st.ball.owner !== null && st.pl[st.ball.owner]) {
    const carrier = st.pl[st.ball.owner];
    const carrierAX = Math.abs(carrier.pos.x);
    if (carrierAX > maxCarrierAX) maxCarrierAX = carrierAX;
    
    // Track Blue team possession and attacking third
    if (carrier.team === -1) {
      possFrames++;
      const progressX = st.ball.pos.x * (-carrier.team);
      const w = PExt.pitchHalfW;
      if (progressX >= 2 * w / 3) {
        attThirdFrames++;
      }
    }
  }
  
  // Track shots (check trail for shot events)
  if (st.trail && st.trail.type === "shot") {
    const shooter = st.pl[st.trail.by];
    if (shooter && shooter.team === -1) {
      shots++;
    }
  }
}

console.log("\n=== 1-MATCH DIAGNOSTIC (Blue Team) ===");
console.log(`maxBallAX: ${maxBallAX.toFixed(2)}`);
console.log(`maxCarrierAX: ${maxCarrierAX.toFixed(2)}`);
console.log(`attThirdFrames: ${attThirdFrames}`);
console.log(`possFrames: ${possFrames}`);
console.log(`attThird%: ${((attThirdFrames / possFrames) * 100).toFixed(1)}%`);
console.log(`shots: ${shots}`);
console.log("\n=== DIAGNOSIS ===");
if (maxBallAX >= 7.0 && attThirdFrames < 100) {
  console.log("❌ Zone calculation is BROKEN - ball reaches X=7+ but attThird is near zero");
} else if (maxBallAX < 6.6) {
  console.log("❌ NOT penetrating - ball never reaches attacking third (X < 6.6)");
} else {
  console.log("✅ Zone calculation appears correct");
}
