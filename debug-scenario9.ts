/**
 * debug-scenario9.ts
 * pl[20]の移動追跡
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const st = mkState();
st.matchPhase = "play";
st.matchClock = 0;
st.kickoffReady = false;
st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

const att = st.pl[BLUE_FWD_IDX];
att.pos = { x: PITCH_HALF_W - 12, y: 0 };
att.home = { x: PITCH_HALF_W - 12, y: 0 };
att.tgt = { x: PITCH_HALF_W - 12, y: 0 };
att.face = v(1, 0);
att.dt = 0;
att.act = "idle";
updatePlayerFeet(att);

st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
st.ball.vel = v(0, 0);
st.ball.free = false;
st.ball.owner = BLUE_FWD_IDX;
st.ball.lastTouchTeam = -1;
st.ball.shot = false;
st.ball.cooldown = 0;
st.ball.z = 0;
st.ball.vz = 0;

const gk = st.pl[RED_GK_IDX];
gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.face = v(-1, 0);
gk.dt = 0;
gk.act = "idle";
updatePlayerFeet(gk);

const p20 = st.pl[20];
console.log("=== 初期状態 ===");
console.log(`pl[20] pos: (${p20.pos.x.toFixed(2)}, ${p20.pos.y.toFixed(2)})`);
console.log(`pl[20] tgt: (${p20.tgt.x.toFixed(2)}, ${p20.tgt.y.toFixed(2)})`);
console.log(`pl[20] vel: (${p20.vel.x.toFixed(2)}, ${p20.vel.y.toFixed(2)})`);
console.log(`pl[20] home: (${p20.home.x.toFixed(2)}, ${p20.home.y.toFixed(2)})`);
console.log(`pl[20] act: ${p20.act}`);
console.log(`pl[20] leftFoot: (${p20.leftFoot.pos.x.toFixed(2)}, ${p20.leftFoot.pos.y.toFixed(2)})`);
console.log(`pl[20] rightFoot: (${p20.rightFoot.pos.x.toFixed(2)}, ${p20.rightFoot.pos.y.toFixed(2)})`);
console.log("");

const DT = 1 / 60;
let prevPos = { x: p20.pos.x, y: p20.pos.y };

for (let frame = 0; frame < 10; frame++) {
  update(st, DT);
  
  const dx = Math.abs(p20.pos.x - prevPos.x);
  const dy = Math.abs(p20.pos.y - prevPos.y);
  
  if (dx > 0.001 || dy > 0.001) {
    console.log(`[Frame ${frame}] pl[20] MOVED: (${prevPos.x.toFixed(3)}, ${prevPos.y.toFixed(3)}) -> (${p20.pos.x.toFixed(3)}, ${p20.pos.y.toFixed(3)})`);
    console.log(`  vel: (${p20.vel.x.toFixed(3)}, ${p20.vel.y.toFixed(3)})`);
    console.log(`  tgt: (${p20.tgt.x.toFixed(3)}, ${p20.tgt.y.toFixed(3)})`);
    console.log(`  act: ${p20.act}`);
  } else {
    console.log(`[Frame ${frame}] pl[20] pos: (${p20.pos.x.toFixed(3)}, ${p20.pos.y.toFixed(3)}) vel: (${p20.vel.x.toFixed(3)}, ${p20.vel.y.toFixed(3)}) act: ${p20.act}`);
  }
  
  prevPos = { x: p20.pos.x, y: p20.pos.y };
  
  if (st.ball.owner === 20) {
    console.log(`[Frame ${frame}] ball owner=20!`);
    break;
  }
}
