/**
 * FWDが12mから逆方向にドリブルする問題のデバッグ
 */
import { mkState, update } from './client/src/game/engine.js';
import { v } from './client/src/game/math.js';

const PITCH_HALF_W = 52.5;
const PITCH_HALF_H = 34.0;
const GOAL_HALF_H = 3.66;

// 青チーム（team=-1）は右から左に攻撃、赤ゴール（x=+52.5）を狙う
// FWDをゴールから12mの位置（x = 52.5 - 12 = 40.5）に配置

const st = mkState();
const DT = 1/60;

// 全選手を無効化（フィールド外に退避）
for (const p of st.pl) {
  p.pos = v(0, 200);
  p.home = v(0, 200);
  p.tgt = v(0, 200);
  p.vel = v(0, 0);
  p.dt = 99999;
}

// 青チームFWD（idx=9, team=-1）を12mに配置
// 青チームは右→左に攻撃（team=-1）、赤ゴールはx=+52.5
// FWDのax = me.pos.x * (-me.team) = 40.5 * 1 = 40.5 > 0 → 相手ハーフ
const fwdIdx = 9;
const fwd = st.pl[fwdIdx];
fwd.pos = v(40.5, 0);   // ゴールから12m（赤ゴール x=52.5 から12m）
fwd.home = v(40.5, 0);
fwd.tgt = v(40.5, 0);
fwd.vel = v(0, 0);
fwd.dt = 0;
fwd.role = "FWD";
fwd.team = -1;
fwd.isGK = false;
fwd.face = v(1, 0);  // ゴール方向を向く（team=-1なので、ゴールはx=+52.5方向）

// 赤チームGK（idx=11, team=1）をゴールに配置
const gkIdx = 11;
const gk = st.pl[gkIdx];
gk.pos = v(50.5, 0);   // ゴール前2m
gk.home = v(50.5, 0);
gk.tgt = v(50.5, 0);
gk.vel = v(0, 0);
gk.dt = 0;
gk.role = "GK";
gk.team = 1;
gk.isGK = true;

// matchPhaseをplayに設定（kickoffのままだとキックオフ処理が優先される）
st.matchPhase = "play" as any;
st.koSide = -1;  // 青チームがキックオフ済み

// ボールをFWDに渡す
st.ball.pos = { ...fwd.pos };
st.ball.vel = v(0, 0);
st.ball.owner = fwdIdx;
st.ball.lastTouchTeam = -1;
st.ball.shot = false;
st.ball.holdT = 0;
st.ball.free = false;

console.log(`初期状態:`);
console.log(`  FWD位置: (${fwd.pos.x.toFixed(1)}, ${fwd.pos.y.toFixed(1)}) team=${fwd.team}`);
console.log(`  赤ゴール位置: x=+${PITCH_HALF_W} (FWDから${(PITCH_HALF_W - fwd.pos.x).toFixed(1)}m)`);
console.log(`  FWDのax = pos.x * (-team) = ${fwd.pos.x} * ${-fwd.team} = ${fwd.pos.x * (-fwd.team)} (>0=相手ハーフ)`);
console.log(`  FWDのface: (${fwd.face.x.toFixed(2)}, ${fwd.face.y.toFixed(2)})`);
console.log('');

// 100フレーム実行してFWDの動きをトレース
const trace: Array<{frame: number, fwdX: number, fwdY: number, ballX: number, ballY: number, act: string, shotFired: boolean}> = [];
let shotFired = false;
let prevShotFired = false;

for (let frame = 0; frame < 200; frame++) {
  // 不要な選手のdtをリセット（GKとFWD以外）
  for (let i = 0; i < st.pl.length; i++) {
    if (i !== fwdIdx && i !== gkIdx) {
      st.pl[i].dt = 99999;
      st.pl[i].pos = v(0, 200);
    }
  }

  update(st, DT);

  const ballShot = st.ball.shot;
  if (ballShot && !prevShotFired) {
    shotFired = true;
    console.log(`★ シュート発射! frame=${frame}`);
    console.log(`  シュート位置: (${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)})`);
    const goalX = 52.5;
    const dist = Math.sqrt((goalX - st.ball.pos.x)**2 + st.ball.pos.y**2);
    console.log(`  ゴールからの距離: ${dist.toFixed(2)}m`);
    console.log(`  ボール速度: (${st.ball.vel.x.toFixed(2)}, ${st.ball.vel.y.toFixed(2)})`);
  }
  prevShotFired = ballShot;

  trace.push({
    frame,
    fwdX: fwd.pos.x,
    fwdY: fwd.pos.y,
    ballX: st.ball.pos.x,
    ballY: st.ball.pos.y,
    act: fwd.act,
    shotFired: ballShot
  });

  if (frame < 30 || (frame % 10 === 0)) {
    console.log(`frame=${frame.toString().padStart(3)}: FWD(${fwd.pos.x.toFixed(1)}, ${fwd.pos.y.toFixed(1)}) act=${fwd.act.padEnd(10)} ball(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}) owner=${st.ball.owner} shot=${ballShot}`);
  }

  // ゴールまたはセーブで終了
  if (st.scoreBlue > 0 || st.scoreRed > 0) {
    console.log(`\n試合終了: blue=${st.scoreBlue} red=${st.scoreRed}`);
    break;
  }
  if (st.ball.pos.x > PITCH_HALF_W + 2 || st.ball.pos.x < -PITCH_HALF_W - 2) {
    console.log(`\nボールがフィールド外: x=${st.ball.pos.x.toFixed(1)}`);
    break;
  }
}

// FWDの移動パターン分析
const fwdPositions = trace.map(t => t.fwdX);
const minX = Math.min(...fwdPositions);
const maxX = Math.max(...fwdPositions);
console.log(`\n=== FWD移動分析 ===`);
console.log(`  初期X: ${trace[0]?.fwdX.toFixed(1)}`);
console.log(`  最小X（最も後退）: ${minX.toFixed(1)} (初期から${(trace[0]?.fwdX - minX).toFixed(1)}m後退)`);
console.log(`  最大X（最も前進）: ${maxX.toFixed(1)} (初期から${(maxX - trace[0]?.fwdX).toFixed(1)}m前進)`);
console.log(`  シュート時X: ${trace.find(t => t.shotFired)?.fwdX?.toFixed(1) ?? '未発射'}`);
console.log(`  シュート時ゴール距離: ${trace.find(t => t.shotFired) ? (52.5 - (trace.find(t => t.shotFired)?.fwdX ?? 0)).toFixed(1) + 'm' : '未発射'}`);
