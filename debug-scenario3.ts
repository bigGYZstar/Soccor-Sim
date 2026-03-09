/**
 * debug-scenario3.ts
 * 足の位置初期化後のシュート動作確認
 */

import { mkState, update, footAccuracyModifier, updatePlayerFeet } from './client/src/game/engine';
import { v, vdist, vnorm, vsub } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const st = mkState();
st.matchPhase = "play";
st.matchClock = 0;
st.kickoffReady = false;

const activeIdxs = new Set<number>();
activeIdxs.add(BLUE_FWD_IDX);
activeIdxs.add(RED_GK_IDX);
st.scenarioActiveIdxs = activeIdxs;

const attacker = st.pl[BLUE_FWD_IDX];
attacker.pos = { x: PITCH_HALF_W - 12, y: 0 };
attacker.home = { x: PITCH_HALF_W - 12, y: 0 };
attacker.tgt = { x: PITCH_HALF_W - 12, y: 0 };
attacker.face = v(1, 0);
attacker.dt = 0;
attacker.act = "idle";
updatePlayerFeet(attacker);

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

console.log("=== 初期状態（足の位置初期化後） ===");
console.log(`FWD leftFoot: (${attacker.leftFoot.pos.x.toFixed(2)}, ${attacker.leftFoot.pos.y.toFixed(2)})`);
console.log(`FWD rightFoot: (${attacker.rightFoot.pos.x.toFixed(2)}, ${attacker.rightFoot.pos.y.toFixed(2)})`);
const footModL = footAccuracyModifier(attacker, "L", st.ball.pos);
const footModR = footAccuracyModifier(attacker, "R", st.ball.pos);
console.log(`footMod L: ${footModL.toFixed(3)}, R: ${footModR.toFixed(3)}`);

const DT = 1 / 60;
let prevShot = false;
let goalCount = 0;
let saveCount = 0;
let missCount = 0;

// 100試行テスト
for (let trial = 0; trial < 100; trial++) {
  const st2 = mkState();
  st2.matchPhase = "play";
  st2.matchClock = 0;
  st2.kickoffReady = false;
  st2.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

  const att = st2.pl[BLUE_FWD_IDX];
  att.pos = { x: PITCH_HALF_W - 12, y: 0 };
  att.home = { x: PITCH_HALF_W - 12, y: 0 };
  att.tgt = { x: PITCH_HALF_W - 12, y: 0 };
  att.face = v(1, 0);
  att.dt = 0;
  att.act = "idle";
  updatePlayerFeet(att);

  st2.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
  st2.ball.vel = v(0, 0);
  st2.ball.free = false;
  st2.ball.owner = BLUE_FWD_IDX;
  st2.ball.lastTouchTeam = -1;
  st2.ball.shot = false;
  st2.ball.cooldown = 0;
  st2.ball.z = 0;
  st2.ball.vz = 0;

  const gk2 = st2.pl[RED_GK_IDX];
  gk2.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk2.home = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk2.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk2.face = v(-1, 0);
  gk2.dt = 0;
  gk2.act = "idle";
  updatePlayerFeet(gk2);

  let outcome = "timeout";
  let prevShot2 = false;

  for (let frame = 0; frame < 480; frame++) {
    update(st2, DT);
    const b = st2.ball;
    const justFired = b.shot && b.free && !prevShot2;
    if (trial === 0 && justFired) {
      const spd = Math.sqrt(b.vel.x**2 + b.vel.y**2);
      const dir = vnorm(b.vel);
      console.log(`\n[Trial 0, Frame ${frame}] シュート!`);
      console.log(`  ball pos: (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
      console.log(`  shot dir: (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)})`);
      console.log(`  speed: ${spd.toFixed(1)} m/s`);
    }
    prevShot2 = b.shot && b.free;

    if (b.pos.x > PITCH_HALF_W + 2.0 && Math.abs(b.pos.y) < 3.66) {
      outcome = "goal";
      break;
    }
    if (st2.scoreRed > 0) { outcome = "goal"; break; }
    if (!b.free && b.owner === RED_GK_IDX) { outcome = "save"; break; }
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 3 || Math.abs(b.pos.y) > 34.5) { outcome = "miss"; break; }
    if (st2.setPieceRestart) { outcome = "save"; break; }
  }

  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else if (outcome === "miss") missCount++;
}

console.log(`\n=== 100試行結果 ===`);
console.log(`ゴール: ${goalCount}% (${goalCount}/100)`);
console.log(`セーブ: ${saveCount}% (${saveCount}/100)`);
console.log(`枠外: ${missCount}% (${missCount}/100)`);
