import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';
import { vdist } from '../client/src/game/math';

const DT = 1 / 60;
const MAX_STEPS = 600; // 10 seconds only

console.log(`Running 10-second debug match...`);
console.log("--------------------------------------------------\n");

const st = mkState();
doKickOff(st);

let tackleAttempts = 0;
let closeCalls = 0;

for (let step = 0; step < MAX_STEPS; step++) {
  // Check tackle conditions BEFORE update
  if (st.ball.owner !== null && st.ball.cooldown <= 0) {
    const owner = st.pl[st.ball.owner];
    
    for (let i = 0; i < st.pl.length; i++) {
      if (i === st.ball.owner) continue;
      const p = st.pl[i];
      
      if (p.team !== owner.team) {
        const dist = vdist(p.pos, st.ball.pos);
        const tackleRadius = P.interceptRadius * 0.65;
        
        if (dist < tackleRadius * 1.5) {
          closeCalls++;
          if (closeCalls <= 5) {
            console.log(`[${st.time.toFixed(2)}s] Close call: Player ${i} (${p.team > 0 ? "RED" : "BLUE"}) is ${dist.toFixed(2)} units from ball (need ${tackleRadius.toFixed(2)})`);
          }
        }
        
        if (dist < tackleRadius) {
          tackleAttempts++;
          if (tackleAttempts <= 5) {
            console.log(`[${st.time.toFixed(2)}s] ⚠️ TACKLE ATTEMPT: Player ${i} (${p.team > 0 ? "RED" : "BLUE"}) should tackle! Distance: ${dist.toFixed(2)}, Required: ${tackleRadius.toFixed(2)}`);
          }
        }
      }
    }
  }
  
  update(st, DT);
}

console.log("\n==================================================");
console.log("📊 TACKLE DEBUG RESULTS");
console.log("==================================================");
console.log(`Duration: ${st.time.toFixed(2)}s`);
console.log(`Ball Owner: ${st.ball.owner !== null ? `Player ${st.ball.owner} (${st.pl[st.ball.owner].team > 0 ? "RED" : "BLUE"})` : "None"}`);
console.log(`Cooldown: ${st.ball.cooldown.toFixed(3)}s`);
console.log(`Close Calls (<1.5x tackle radius): ${closeCalls}`);
console.log(`Tackle Attempts (within radius): ${tackleAttempts}`);
console.log(`Intercept Radius: ${P.interceptRadius}`);
console.log(`Tackle Radius (0.65x): ${(P.interceptRadius * 0.65).toFixed(3)}`);
console.log("==================================================");
