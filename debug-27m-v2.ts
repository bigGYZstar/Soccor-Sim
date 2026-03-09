// debug-27m-v2.ts: 27mシュートのGK位置とshotOriginDistのデバッグ
import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { v, vdist, vlen, distSegmentToPoint } from './client/src/game/math';
import * as fs from 'fs';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;
const DT = 1 / 60;
const TRIALS = 50;

let goalCount = 0;
let saveCount = 0;
let timeoutCount = 0;
const gkYAtShotArr: number[] = [];
const shotOriginDistArr: number[] = [];
const gkPosAtShotArr: {x: number, y: number}[] = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const st = mkState("4-4-2", "4-4-2");
  
  // 攻撃者を(25.5, 0)に配置
  const fwd = st.pl[BLUE_FWD_IDX];
  fwd.pos = v(25.5, 0);
  fwd.home = v(25.5, 0);
  fwd.tgt = v(25.5, 0);
  fwd.face = v(1, 0);
  fwd.act = "idle";
  updatePlayerFeet(fwd);
  
  // GKを(50.0, 0)に配置
  const gk = st.pl[RED_GK_IDX];
  gk.pos = v(PITCH_HALF_W - 2.5, 0);
  gk.home = v(PITCH_HALF_W - 2.5, 0);
  gk.tgt = v(PITCH_HALF_W - 2.5, 0);
  gk.face = v(-1, 0);
  gk.act = "idle";
  updatePlayerFeet(gk);
  
  // ボールをFWDに渡す
  st.ball.owner = BLUE_FWD_IDX;
  st.ball.free = false;
  st.ball.shot = false;
  st.ball.pos = { ...fwd.pos };
  st.ball.prevPos = { ...fwd.pos };
  st.ball.shotOriginDist = 0;
  
  // アクティブ選手を設定
  st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);
  st.matchPhase = "play";
  
  let outcome = "timeout";
  let shotFired = false;
  let prevBallShot = false;
  let gkYAtShot = 0;
  let gkPosAtShot = {x: 0, y: 0};
  let shotOriginDist = 0;
  
  const maxFrames = Math.ceil(8 * 60);
  
  for (let frame = 0; frame < maxFrames; frame++) {
    const b = st.ball;
    
    update(st, DT);
    
    // シュート検出
    const justFired = b.shot && b.free && !prevBallShot;
    if (!shotFired && justFired) {
      shotFired = true;
      gkYAtShot = gk.pos.y;
      gkPosAtShot = { x: gk.pos.x, y: gk.pos.y };
      shotOriginDist = b.shotOriginDist;
      
      if (trial < 5) {
        console.log(`Trial ${trial}: Shot fired! shotOriginDist=${shotOriginDist.toFixed(1)}m, GK.pos=(${gkPosAtShot.x.toFixed(1)}, ${gkPosAtShot.y.toFixed(2)}), ball.pos=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(2)})`);
      }
    }
    
    prevBallShot = b.shot && b.free;
    
    // ゴール判定
    if (Math.abs(b.pos.y) < 3.66 && shotFired) {
      if (b.pos.x > PITCH_HALF_W + 2.0) {
        outcome = "goal";
        break;
      } else if (b.pos.x > PITCH_HALF_W && b.free) {
        outcome = "goal";
        break;
      }
    }
    
    if (st.matchPhase === "kickoff" && shotFired) {
      outcome = "goal";
      break;
    }
    
    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      outcome = "save";
      break;
    }
  }
  
  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else timeoutCount++;
  
  if (shotFired) {
    gkYAtShotArr.push(gkYAtShot);
    shotOriginDistArr.push(shotOriginDist);
    gkPosAtShotArr.push(gkPosAtShot);
  }
}

console.log(`\n=== 27mシュートデバッグ結果 ===`);
console.log(`ゴール: ${goalCount}/${TRIALS} (${(goalCount/TRIALS*100).toFixed(1)}%)`);
console.log(`セーブ: ${saveCount}/${TRIALS} (${(saveCount/TRIALS*100).toFixed(1)}%)`);
console.log(`タイムアウト: ${timeoutCount}/${TRIALS} (${(timeoutCount/TRIALS*100).toFixed(1)}%)`);

if (gkYAtShotArr.length > 0) {
  const avgGKY = gkYAtShotArr.reduce((a, b) => a + b, 0) / gkYAtShotArr.length;
  const maxGKY = Math.max(...gkYAtShotArr.map(Math.abs));
  const avgGKX = gkPosAtShotArr.reduce((a, b) => a + b.x, 0) / gkPosAtShotArr.length;
  console.log(`\nGK位置（シュート時）: 平均=(${avgGKX.toFixed(1)}, ${avgGKY.toFixed(2)}), 最大|y|=${maxGKY.toFixed(2)}`);
  console.log(`GK X位置分布: ${gkPosAtShotArr.slice(0, 10).map(p => p.x.toFixed(1)).join(', ')}`);
  console.log(`GK Y位置分布: ${gkYAtShotArr.slice(0, 10).map(y => y.toFixed(2)).join(', ')}`);
}

if (shotOriginDistArr.length > 0) {
  const avgDist = shotOriginDistArr.reduce((a, b) => a + b, 0) / shotOriginDistArr.length;
  const minDist = Math.min(...shotOriginDistArr);
  const maxDist = Math.max(...shotOriginDistArr);
  console.log(`\nshotOriginDist: 平均=${avgDist.toFixed(1)}m, 最小=${minDist.toFixed(1)}m, 最大=${maxDist.toFixed(1)}m`);
  console.log(`shotOriginDist分布: ${shotOriginDistArr.slice(0, 10).map(d => d.toFixed(1)).join(', ')}`);
}

// 理論値計算
const dist = 25.4;
const pSADistScale = Math.pow(dist / 12.0, 2.0);
const pSA = 1.05 * pSADistScale;
const distRadiusBonus = 1.0 + Math.max(0, (dist - 12.0) / 15.0) * 7.0;
const effectiveSaveRadius = 0.9 * distRadiusBonus;
const distRatio = Math.max(0, (dist - 12.0) / 15.0);
const distBonus = distRatio * distRatio * 0.80;
const saveChance = Math.min(0.95, 0.30 + 0.15 + distBonus);

console.log(`\n=== 理論値計算（dist=${dist}m）===`);
console.log(`pSADistScale: ${pSADistScale.toFixed(2)}`);
console.log(`pSA: ±${pSA.toFixed(2)}m`);
console.log(`distRadiusBonus: ${distRadiusBonus.toFixed(2)}`);
console.log(`effectiveSaveRadius: ${effectiveSaveRadius.toFixed(2)}m`);
console.log(`distBonus: ${distBonus.toFixed(3)}`);
console.log(`saveChance: ${saveChance.toFixed(3)}`);
const inFrameRate = Math.min(1, effectiveSaveRadius / pSA);
const onTargetRate = Math.min(1, 3.66 / pSA);
console.log(`枠内率: ${(onTargetRate * 100).toFixed(1)}%`);
console.log(`canSave率（枠内シュートのうち）: ${(inFrameRate * 100).toFixed(1)}%`);
const goalRate = (1 - onTargetRate) + onTargetRate * (1 - inFrameRate) + onTargetRate * inFrameRate * (1 - saveChance);
console.log(`理論ゴール率: ${(goalRate * 100).toFixed(1)}%`);
