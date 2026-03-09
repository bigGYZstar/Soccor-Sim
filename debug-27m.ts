/**
 * debug-27m.ts
 * 27mシュートのゴール率問題を詳細に分析
 * 
 * 問題: 27mシュートのゴール率が29.6%（目標10%）
 * 
 * 分析項目:
 * 1. シュートの枠内率（pSA計算）
 * 2. GKセーブ率
 * 3. 枠外シュートがゴールになるケース
 */

import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const GOAL_DEPTH = 2.0;

const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const TRIALS = 5000;

// 統計
let totalShots = 0;
let goals = 0;
let saves = 0;
let misses = 0;
let timeouts = 0;

// 詳細統計
let onTargetShots = 0;  // 枠内シュート
let offTargetShots = 0; // 枠外シュート
let onTargetGoals = 0;  // 枠内シュートからのゴール
let offTargetGoals = 0; // 枠外シュートからのゴール（問題！）

// シュートY位置の分布
let shotYValues: number[] = [];
let goalShotYValues: number[] = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;

  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

  // 攻撃者を27m位置に配置
  const attacker = st.pl[BLUE_FWD_IDX];
  attacker.pos = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.home = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.tgt = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.face = v(1, 0);
  attacker.dt = 0;
  attacker.act = "idle";
  updatePlayerFeet(attacker);

  st.ball.pos = { x: PITCH_HALF_W - 27, y: 0 };
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
  const maxFrames = 8 * 60;
  let outcome: string = "timeout";
  let shotFired = false;
  let prevBallShot = false;
  let shotY = 0;
  let isOnTarget = false;

  for (let frame = 0; frame < maxFrames; frame++) {
    update(st, DT);
    const b = st.ball;

    const justFired = b.shot && b.free && !prevBallShot;
    if (!shotFired && justFired) {
      shotFired = true;
      totalShots++;
      
      // シュートのY方向を記録（ゴール方向のY位置）
      // kick()関数でtgt.yが設定されているはず
      // ボールの初速度のY成分から推定
      const velY = b.vel.y;
      const velX = b.vel.x;
      const speed = Math.sqrt(velX * velX + velY * velY);
      // ゴールラインまでの距離
      const distToGoal = PITCH_HALF_W - b.pos.x;
      // ゴールラインでのY位置を推定（直線軌道）
      const estimatedGoalY = b.pos.y + velY / velX * distToGoal;
      
      shotY = estimatedGoalY;
      shotYValues.push(shotY);
      
      isOnTarget = Math.abs(estimatedGoalY) < GOAL_HALF_H;
      if (isOnTarget) onTargetShots++;
      else offTargetShots++;
    }
    prevBallShot = b.shot && b.free;

    // ゴール判定
    if (Math.abs(b.pos.y) < GOAL_HALF_H && shotFired) {
      if (b.pos.x > PITCH_HALF_W + GOAL_DEPTH) {
        outcome = "goal";
        break;
      } else if (b.pos.x > PITCH_HALF_W && b.free) {
        outcome = "goal";
        break;
      }
    }

    if (st.scoreRed > 0) {
      outcome = "goal";
      break;
    }

    if (st.matchPhase === "kickoff" && shotFired) {
      outcome = "goal";
      break;
    }

    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      outcome = "save";
      break;
    }

    if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        outcome = b.lastTouchTeam === 1 ? "save" : "miss";
      }
      break;
    }

    if (st.setPieceRestart && shotFired) {
      outcome = "save";
      break;
    }

    if (st.scoreRed !== 0) {
      outcome = "goal";
      break;
    }
  }

  if (outcome === "goal") {
    goals++;
    goalShotYValues.push(shotY);
    if (isOnTarget) onTargetGoals++;
    else offTargetGoals++;
  } else if (outcome === "save") {
    saves++;
  } else if (outcome === "miss") {
    misses++;
  } else {
    timeouts++;
  }
}

console.log(`=== 27mシュート詳細分析 (${TRIALS}試行) ===`);
console.log(`\n総シュート数: ${totalShots}`);
console.log(`\n--- 結果 ---`);
console.log(`ゴール: ${goals} (${(goals/TRIALS*100).toFixed(1)}%)`);
console.log(`セーブ: ${saves} (${(saves/TRIALS*100).toFixed(1)}%)`);
console.log(`枠外: ${misses} (${(misses/TRIALS*100).toFixed(1)}%)`);
console.log(`タイムアウト: ${timeouts} (${(timeouts/TRIALS*100).toFixed(1)}%)`);

console.log(`\n--- 枠内/枠外分析 ---`);
console.log(`枠内シュート: ${onTargetShots} (${(onTargetShots/totalShots*100).toFixed(1)}%)`);
console.log(`枠外シュート: ${offTargetShots} (${(offTargetShots/totalShots*100).toFixed(1)}%)`);
console.log(`枠内ゴール: ${onTargetGoals} (${(onTargetGoals/onTargetShots*100).toFixed(1)}% of on-target)`);
console.log(`枠外ゴール: ${offTargetGoals} (${(offTargetGoals/offTargetShots*100).toFixed(1)}% of off-target) ← 問題！`);

// shotYの分布
const absYValues = shotYValues.map(y => Math.abs(y));
const avgAbsY = absYValues.reduce((a, b) => a + b, 0) / absYValues.length;
const maxAbsY = Math.max(...absYValues);
const minAbsY = Math.min(...absYValues);

console.log(`\n--- シュートY位置分布 ---`);
console.log(`平均|Y|: ${avgAbsY.toFixed(2)}m`);
console.log(`最大|Y|: ${maxAbsY.toFixed(2)}m`);
console.log(`最小|Y|: ${minAbsY.toFixed(2)}m`);
console.log(`枠内率（|Y|<3.66）: ${(absYValues.filter(y => y < GOAL_HALF_H).length / absYValues.length * 100).toFixed(1)}%`);

// ゴールシュートのY分布
if (goalShotYValues.length > 0) {
  const goalAbsY = goalShotYValues.map(y => Math.abs(y));
  const avgGoalAbsY = goalAbsY.reduce((a, b) => a + b, 0) / goalAbsY.length;
  console.log(`\n--- ゴールシュートY位置分布 ---`);
  console.log(`平均|Y|: ${avgGoalAbsY.toFixed(2)}m`);
  console.log(`枠内ゴール（|Y|<3.66）: ${goalAbsY.filter(y => y < GOAL_HALF_H).length}`);
  console.log(`枠外ゴール（|Y|>3.66）: ${goalAbsY.filter(y => y >= GOAL_HALF_H).length} ← 問題！`);
}

console.log(`\n--- 期待値との比較 ---`);
const expectedOnTargetRate = onTargetShots / totalShots;
const expectedGoalRate = expectedOnTargetRate * 0.05; // 枠内シュートの5%がゴール（saveChance=0.95）
console.log(`期待ゴール率（枠内×5%）: ${(expectedGoalRate*100).toFixed(1)}%`);
console.log(`実際ゴール率: ${(goals/TRIALS*100).toFixed(1)}%`);
console.log(`差分: ${((goals/TRIALS - expectedGoalRate)*100).toFixed(1)}% ← この差が枠外ゴール`);
