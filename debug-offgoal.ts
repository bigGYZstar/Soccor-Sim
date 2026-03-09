/**
 * debug-offgoal.ts
 * 枠外シュートがゴールになるケースを詳細に追跡
 */

import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const GOAL_DEPTH = 2.0;

const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const TRIALS = 500;

// 枠外ゴールのケースを記録
interface OffTargetGoalCase {
  shotY: number;
  estimatedGoalY: number;
  frames: Array<{
    frame: number;
    ballX: number;
    ballY: number;
    ballVelX: number;
    ballVelY: number;
    ballShot: boolean;
    ballFree: boolean;
    ballOwner: number;
    gkX: number;
    gkY: number;
  }>;
}

const offTargetGoalCases: OffTargetGoalCase[] = [];
let totalShots = 0;
let offTargetGoals = 0;

for (let trial = 0; trial < TRIALS; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;

  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

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
  let estimatedGoalY = 0;
  let isOnTarget = false;
  let frameHistory: OffTargetGoalCase["frames"] = [];
  let recordingFrames = false;

  for (let frame = 0; frame < maxFrames; frame++) {
    update(st, DT);
    const b = st.ball;
    const gkPlayer = st.pl[RED_GK_IDX];

    const justFired = b.shot && b.free && !prevBallShot;
    if (!shotFired && justFired) {
      shotFired = true;
      totalShots++;
      
      const velY = b.vel.y;
      const velX = b.vel.x;
      const distToGoal = PITCH_HALF_W - b.pos.x;
      estimatedGoalY = b.pos.y + velY / velX * distToGoal;
      shotY = estimatedGoalY;
      
      isOnTarget = Math.abs(estimatedGoalY) < GOAL_HALF_H;
      
      // 枠外シュートの場合、フレームを記録開始
      if (!isOnTarget) {
        recordingFrames = true;
        frameHistory = [];
      }
    }
    
    if (recordingFrames) {
      frameHistory.push({
        frame,
        ballX: b.pos.x,
        ballY: b.pos.y,
        ballVelX: b.vel.x,
        ballVelY: b.vel.y,
        ballShot: b.shot,
        ballFree: b.free,
        ballOwner: b.owner,
        gkX: gkPlayer.pos.x,
        gkY: gkPlayer.pos.y,
      });
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

  if (outcome === "goal" && !isOnTarget) {
    offTargetGoals++;
    if (offTargetGoalCases.length < 5) {
      offTargetGoalCases.push({
        shotY,
        estimatedGoalY,
        frames: frameHistory.slice(-20), // 最後の20フレームを記録
      });
    }
  }
}

console.log(`=== 枠外ゴール詳細分析 (${TRIALS}試行) ===`);
console.log(`総シュート: ${totalShots}`);
console.log(`枠外ゴール: ${offTargetGoals} (${(offTargetGoals/TRIALS*100).toFixed(1)}%)`);

console.log(`\n=== 枠外ゴールのケース詳細 ===`);
for (let i = 0; i < offTargetGoalCases.length; i++) {
  const c = offTargetGoalCases[i];
  console.log(`\n--- ケース ${i+1} ---`);
  console.log(`シュートY: ${c.shotY.toFixed(2)}m (推定ゴールラインY: ${c.estimatedGoalY.toFixed(2)}m)`);
  console.log(`最後の${c.frames.length}フレーム:`);
  for (const f of c.frames) {
    const gkDist = Math.sqrt((f.ballX - f.gkX)**2 + (f.ballY - f.gkY)**2);
    console.log(`  F${f.frame}: ball=(${f.ballX.toFixed(1)}, ${f.ballY.toFixed(1)}) vel=(${f.ballVelX.toFixed(1)}, ${f.ballVelY.toFixed(1)}) shot=${f.ballShot} free=${f.ballFree} owner=${f.ballOwner} gk=(${f.gkX.toFixed(1)}, ${f.gkY.toFixed(1)}) dist=${gkDist.toFixed(1)}`);
  }
}
