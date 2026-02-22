import { mkState, update } from "../client/src/game/engine";

const st = mkState();
let maxBallAX = -Infinity;
let maxCarrierAX = -Infinity;

for (let i = 0; i < 3000; i++) {
  update(st, 0.1);
  
  // maxBallAX
  if (st.b && st.b.pos) {
    const ballAX = Math.abs(st.b.pos.x);
    if (ballAX > maxBallAX) maxBallAX = ballAX;
  }
  
  // maxCarrierAX
  if (st.b && st.b.owner !== null && st.ps[st.b.owner]) {
    const carrier = st.ps[st.b.owner];
    const carrierAX = Math.abs(carrier.pos.x);
    if (carrierAX > maxCarrierAX) maxCarrierAX = carrierAX;
  }
}

console.log(`maxBallAX: ${maxBallAX.toFixed(2)}`);
console.log(`maxCarrierAX: ${maxCarrierAX.toFixed(2)}`);
