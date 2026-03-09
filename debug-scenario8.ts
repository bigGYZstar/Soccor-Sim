/**
 * debug-scenario8.ts
 * owner=20になる直前の詳細追跡
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

// owner=20になるケースを探す（最初の1件）
for (let trial = 0; trial < 500; trial++) {
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

  const DT = 1 / 60;
  let prevOwner: number | null = BLUE_FWD_IDX;
  let found = false;
  let prevBallPos = { x: 0, y: 0 };
  let prevBallZ = 0;
  let prevBallCooldown = 0;
  let prevBallFree = false;

  for (let frame = 0; frame < 480; frame++) {
    // 更新前の状態を記録
    const b = st.ball;
    const preBallPos = { x: b.pos.x, y: b.pos.y };
    const preBallZ = b.z;
    const preBallCooldown = b.cooldown;
    const preBallFree = b.free;
    const preBallOwner = b.owner;
    
    update(st, DT);
    
    // owner=20になったフレームを検出
    if (b.owner === 20 && prevOwner !== 20) {
      console.log(`\n=== Trial ${trial}, Frame ${frame}: owner became 20 ===`);
      console.log(`  [BEFORE] ball pos: (${preBallPos.x.toFixed(2)}, ${preBallPos.y.toFixed(2)})`);
      console.log(`  [BEFORE] ball z: ${preBallZ.toFixed(2)}, cooldown: ${preBallCooldown.toFixed(2)}, free: ${preBallFree}, owner: ${preBallOwner}`);
      console.log(`  [AFTER]  ball pos: (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
      console.log(`  [AFTER]  ball z: ${b.z.toFixed(2)}, cooldown: ${b.cooldown.toFixed(2)}, free: ${b.free}, owner: ${b.owner}`);
      const p20 = st.pl[20];
      console.log(`  pl[20] pos: (${p20.pos.x.toFixed(2)}, ${p20.pos.y.toFixed(2)})`);
      console.log(`  pl[20] leftFoot: (${p20.leftFoot.pos.x.toFixed(2)}, ${p20.leftFoot.pos.y.toFixed(2)})`);
      console.log(`  pl[20] rightFoot: (${p20.rightFoot.pos.x.toFixed(2)}, ${p20.rightFoot.pos.y.toFixed(2)})`);
      console.log(`  scenarioActiveIdxs: ${JSON.stringify([...st.scenarioActiveIdxs!])}`);
      found = true;
      break;
    }
    
    prevOwner = b.owner;
  }
  
  if (found) break;
}
