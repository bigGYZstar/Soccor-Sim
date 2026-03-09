/**
 * debug_trace.ts
 * FWDが後退する問題を詳細にトレース
 */
import { mkState, update } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const st = mkState();
st.matchPhase = "play";
st.matchClock = 0;
st.kickoffReady = false;

// アクティブ選手: FWD + GK のみ
st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

// FWDを12m（x=40.5）に配置
const attacker = st.pl[BLUE_FWD_IDX];
attacker.pos = { x: PITCH_HALF_W - 12, y: 0 };
attacker.home = { x: PITCH_HALF_W - 12, y: 0 };
attacker.tgt = { x: PITCH_HALF_W - 12, y: 0 };
attacker.face = v(1, 0);
attacker.dt = 0;
attacker.act = "idle";

// ボールをFWDに持たせる
st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
st.ball.vel = v(0, 0);
st.ball.free = false;
st.ball.owner = BLUE_FWD_IDX;
st.ball.lastTouchTeam = -1;
st.ball.shot = false;
st.ball.cooldown = 0;
st.ball.z = 0;
st.ball.vz = 0;

// GKをゴール前に配置
const gk = st.pl[RED_GK_IDX];
gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.face = v(-1, 0);
gk.dt = 0;
gk.act = "idle";

const DT = 1 / 60;
let prevAct = "";
let prevPosX = attacker.pos.x;

for (let frame = 0; frame < 600; frame++) {
  update(st, DT);
  const b = st.ball;
  const p = st.pl[BLUE_FWD_IDX];
  const timeSec = (frame * DT).toFixed(2);
  
  // 状態変化を検出してログ出力
  const actChanged = p.act !== prevAct;
  const posChanged = Math.abs(p.pos.x - prevPosX) > 0.5;
  const isShot = b.shot && b.free;
  
  if (frame < 5 || actChanged || posChanged || isShot || frame % 60 === 0) {
    const goalDist = Math.abs(p.pos.x - PITCH_HALF_W).toFixed(1);
    const ballDist = Math.abs(b.pos.x - PITCH_HALF_W).toFixed(1);
    console.log(
      `[${timeSec}s] FWD pos=(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}) ` +
      `act=${p.act} tgt=(${p.tgt.x.toFixed(1)}, ${p.tgt.y.toFixed(1)}) ` +
      `face=(${p.face.x.toFixed(2)}, ${p.face.y.toFixed(2)}) ` +
      `goalDist=${goalDist}m ` +
      `ball.owner=${b.owner} ball.free=${b.free} ball.shot=${b.shot} ` +
      `ball.pos=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) ballGoalDist=${ballDist}m`
    );
  }
  
  prevAct = p.act;
  prevPosX = p.pos.x;
  
  if (isShot) {
    const shotGoalDist = Math.sqrt((PITCH_HALF_W - b.pos.x)**2 + b.pos.y**2);
    console.log(`\n★ SHOT FIRED at frame=${frame} t=${timeSec}s`);
    console.log(`  Ball pos: (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
    console.log(`  Ball vel: (${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)})`);
    console.log(`  Shot dist to goal: ${shotGoalDist.toFixed(1)}m`);
    console.log(`  FWD pos at shot: (${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)})`);
    break;
  }
  
  // タイムアウト
  if (frame === 599) {
    console.log(`\n★ TIMEOUT - no shot fired in ${(600*DT).toFixed(1)}s`);
    console.log(`  FWD final pos: (${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)})`);
    console.log(`  Ball: owner=${b.owner} free=${b.free} pos=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
  }
}
