import { mkState, update } from "../client/src/game/engine";

const st = mkState();

// Run for 10 seconds and log every decision
for (let i = 0; i < 1000; i++) {
  update(st, 0.01);
  
  if (i % 100 === 0 && st.ball.owner !== null) {
    const carrier = st.pl[st.ball.owner];
    console.log(`[t=${(i * 0.01).toFixed(1)}s] Carrier: P${carrier.idx} (${carrier.team === -1 ? 'Blue' : 'Red'})`);
    console.log(`  pos: (${carrier.pos.x.toFixed(2)}, ${carrier.pos.y.toFixed(2)})`);
    console.log(`  act: ${carrier.act}`);
    console.log(`  ax: ${(carrier.pos.x * (-carrier.team)).toFixed(2)}`);
    console.log(`  ball: (${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)})`);
  }
}
