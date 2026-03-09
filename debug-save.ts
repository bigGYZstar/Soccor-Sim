/**
 * debug-save.ts
 * GKセーブ判定の詳細デバッグ
 * 
 * シュートが打たれてからゴールになるまでのフレームを追跡する
 */

import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { v, vdist, vlen } from './client/src/game/math';
import { distSegmentToPoint } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

function runDebugTrial(trial: number): void {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;

  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

  // 攻撃者の配置（12m）
  const attacker = st.pl[BLUE_FWD_IDX];
  attacker.pos = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.home = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.tgt = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.face = v(1, 0);
  attacker.dt = 0;
  attacker.act = "idle";
  updatePlayerFeet(attacker);

  // ボールを攻撃者に持たせる
  st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
  st.ball.vel = v(0, 0);
  st.ball.free = false;
  st.ball.owner = BLUE_FWD_IDX;
  st.ball.lastTouchTeam = -1;
  st.ball.shot = false;
  st.ball.cooldown = 0;
  st.ball.z = 0;
  st.ball.vz = 0;

  // GKの配置
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
  let shotFired = false;
  let prevBallShot = false;
  let outcome = "timeout";
  let frameLog: string[] = [];

  for (let frame = 0; frame < maxFrames; frame++) {
    // 最初の30フレームはボール状態をログ（update前）
    if (frame < 30 && !shotFired) {
      const bPre = st.ball;
      const gkPosPre = st.pl[RED_GK_IDX].pos;
      frameLog.push(`[Frame ${frame} PRE] ball.free=${bPre.free} ball.shot=${bPre.shot} ball.owner=${bPre.owner} ball.pos=(${bPre.pos.x.toFixed(2)}, ${bPre.pos.y.toFixed(2)}) gk=(${gkPosPre.x.toFixed(2)}, ${gkPosPre.y.toFixed(2)})`);
    }
    
    const prevShotBeforeUpdate = st.ball.shot && st.ball.free; // update前の状態
    update(st, DT);
    
    const b = st.ball;
    const gkPos = st.pl[RED_GK_IDX].pos;
    
    // シュートが打たれたか検出（update後）
    const justFired = b.shot && b.free && !prevShotBeforeUpdate;
    if (!shotFired && justFired) {
      shotFired = true;
      frameLog.push(`[Frame ${frame}] SHOT FIRED! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) vel=(${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)}) speed=${vlen(b.vel).toFixed(2)} gk=(${gkPos.x.toFixed(2)}, ${gkPos.y.toFixed(2)})`);
    }
    
    if (shotFired && b.free && b.shot) {
      const distToGK = distSegmentToPoint(b.prevPos, b.pos, gkPos);
      const directDist = vdist(b.pos, gkPos);
      const ballSpd = vlen(b.vel);
      const effectiveSaveRadius = ballSpd < 10.0 ? 0.9 * 1.8 :
                                   ballSpd < 15.0 ? 0.9 * 1.4 :
                                   0.9;
      const canSave = distToGK < effectiveSaveRadius || (directDist < effectiveSaveRadius && ballSpd < 12.0);
      
      frameLog.push(`[Frame ${frame}] ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) prevPos=(${b.prevPos.x.toFixed(2)}, ${b.prevPos.y.toFixed(2)}) gk=(${gkPos.x.toFixed(2)}, ${gkPos.y.toFixed(2)}) distToGK=${distToGK.toFixed(3)} directDist=${directDist.toFixed(3)} effectiveR=${effectiveSaveRadius.toFixed(2)} canSave=${canSave}`);
    }
    
    // GK位置を常にログ（シュート後）
    if (shotFired) {
      frameLog.push(`[Frame ${frame} POST] GK pos=(${gkPos.x.toFixed(2)}, ${gkPos.y.toFixed(2)}) ball.shot=${b.shot} ball.free=${b.free} ball.pos=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
    }
    
    // ゴール判定
    if (Math.abs(b.pos.y) < GOAL_HALF_H && shotFired) {
      if (b.pos.x > PITCH_HALF_W + 2.0) {
        outcome = "goal";
        frameLog.push(`[Frame ${frame}] GOAL! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
        break;
      } else if (b.pos.x > PITCH_HALF_W && b.free) {
        outcome = "goal";
        frameLog.push(`[Frame ${frame}] GOAL (in goal area)! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
        break;
      }
    }
    
    if (st.matchPhase === "kickoff" && shotFired) {
      outcome = "goal";
      frameLog.push(`[Frame ${frame}] GOAL (kickoff)!`);
      break;
    }
    
    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      outcome = "save";
      frameLog.push(`[Frame ${frame}] SAVE! GK caught ball`);
      break;
    }
    
    if (st.setPieceRestart && shotFired) {
      outcome = "save";
      frameLog.push(`[Frame ${frame}] SAVE (set piece)!`);
      break;
    }
    
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        if (b.lastTouchTeam === 1) {
          outcome = "save";
          frameLog.push(`[Frame ${frame}] SAVE (out after GK touch)!`);
        } else {
          outcome = "miss";
          frameLog.push(`[Frame ${frame}] MISS (out of bounds)!`);
        }
      }
      break;
    }
  }
  
  if (trial < 3) {
    console.log(`\n=== Trial ${trial} === outcome=${outcome} shotFired=${shotFired}`);
    for (const log of frameLog.slice(0, 20)) {
      console.log(log);
    }
  } else if (outcome === "goal" || outcome === "save") {
    console.log(`\n=== Trial ${trial} === outcome=${outcome}`);
    for (const log of frameLog) {
      console.log(log);
    }
  }
}

// st.plの長さとidx=20の情報を表示
const testSt = mkState();
console.log(`st.pl.length = ${testSt.pl.length}`);
if (testSt.pl.length > 20) {
  const p20 = testSt.pl[20];
  console.log(`idx=20: team=${p20.team}, role=${p20.role}, isGK=${p20.isGK}, pos=(${p20.pos.x.toFixed(2)}, ${p20.pos.y.toFixed(2)})`);
}

// 10試行のデバッグ
console.log("Starting debug...");
for (let i = 0; i < 10; i++) {
  console.log(`Running trial ${i}...`);
  runDebugTrial(i);
}
console.log("Done.");
