/**
 * debug-scenario6.ts
 * タイムアウトケースの詳細確認
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

let goalCount = 0, saveCount = 0, missCount = 0, timeoutCount = 0;

for (let trial = 0; trial < 200; trial++) {
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
  let outcome = "timeout";
  let prevShot = false;
  let shotFired = false;

  for (let frame = 0; frame < 480; frame++) {
    update(st, DT);
    const b = st.ball;
    const justFired = b.shot && b.free && !prevShot;
    if (!shotFired && justFired) shotFired = true;
    prevShot = b.shot && b.free;

    // ゴール判定: scoreRedが増加したか
    if (st.scoreRed > 0) { outcome = "goal"; break; }
    
    // ゴール判定: bolがゴールラインを超えた
    if (b.pos.x > PITCH_HALF_W + 2.0 && Math.abs(b.pos.y) < GOAL_HALF_H) { outcome = "goal"; break; }
    
    // matchPhase=kickoff = ゴールが入った
    if (st.matchPhase === "kickoff" && shotFired) { outcome = "goal"; break; }
    
    // GKセーブ
    if (!b.free && b.owner === RED_GK_IDX && shotFired) { outcome = "save"; break; }
    
    // 枠外
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 3 || Math.abs(b.pos.y) > 34.5) {
      if (shotFired) { outcome = "miss"; break; }
    }
    
    // セットプレー
    if (st.setPieceRestart && shotFired) { outcome = "save"; break; }
    
    // タイムアウト時の状態を記録（最初の5件）
    if (frame >= 479 && timeoutCount < 5) {
      console.log(`Timeout trial ${trial}: ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) owner=${b.owner} shot=${b.shot} free=${b.free} scoreRed=${st.scoreRed} setPiece=${st.setPieceRestart?.kind ?? 'null'}`);
    }
  }

  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else if (outcome === "miss") missCount++;
  else timeoutCount++;
}

console.log(`\n=== 200試行結果 ===`);
console.log(`ゴール: ${goalCount} (${(goalCount/2).toFixed(1)}%)`);
console.log(`セーブ: ${saveCount} (${(saveCount/2).toFixed(1)}%)`);
console.log(`枠外: ${missCount} (${(missCount/2).toFixed(1)}%)`);
console.log(`タイムアウト: ${timeoutCount} (${(timeoutCount/2).toFixed(1)}%)`);
