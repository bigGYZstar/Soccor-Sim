/**
 * investigate-divergence.ts
 * 
 * 3つのシミュレーション経路の差異を調査：
 * 1. scenario-sim.ts (speed未設定 = MID, speedMul=0.40)
 * 2. headless-sim.ts (speed=VFAST, speedMul=2.0)
 * 3. 実際のゲームプレイ (VFAST, speedMul=2.0)
 * 
 * 調査項目：
 * - speedMulの違いによるdt差異
 * - b.cooldownの実効時間の差異
 * - GKセーブ処理のタイミング差異
 * - AI判断タイマーの差異
 * - GKパンチ後のリバウンドゴール率の差異
 */

import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { SPEED_MULTIPLIERS } from './client/src/game/types';
import { P } from './client/src/game/constants';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;
const TRIALS = 2000;

// ============================================================
// 共通：27mシュートシナリオを実行してゴール率を返す
// ============================================================
function runScenario27m(speedMode: string, trials: number): {
  goalRate: number;
  saveRate: number;
  reboundGoalRate: number;
  dtPhysics: number;
  cooldownFrames: number;
} {
  const REAL_DT = 1 / 60;
  const speedMul = (SPEED_MULTIPLIERS as any)[speedMode] ?? 0.40;
  const PHYS_SCALE = 27.0;
  const physDt = REAL_DT * speedMul * PHYS_SCALE;

  let goals = 0;
  let saves = 0;
  let reboundGoals = 0;
  let totalShots = 0;

  for (let trial = 0; trial < trials; trial++) {
    const st = mkState();
    st.matchPhase = "play";
    st.matchClock = 0;
    st.kickoffReady = false;
    (st as any).speed = speedMode;

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

    const maxFrames = 8 * 60;
    let outcome = "timeout";
    let shotFired = false;
    let prevBallShot = false;
    let firstShotOnTarget = false;
    let firstShotDone = false;
    let shotCount = 0;

    for (let frame = 0; frame < maxFrames; frame++) {
      update(st, REAL_DT);
      const b = st.ball;

      const justFired = b.shot && b.free && !prevBallShot;
      if (justFired) {
        shotCount++;
        if (!firstShotDone) {
          firstShotDone = true;
          shotFired = true;
          totalShots++;
          // 枠内判定
          const velY = b.vel.y;
          const velX = b.vel.x;
          const distToGoal = PITCH_HALF_W - b.pos.x;
          const estimatedGoalY = b.pos.y + velY / velX * distToGoal;
          firstShotOnTarget = Math.abs(estimatedGoalY) < GOAL_HALF_H;
        }
      }
      prevBallShot = b.shot && b.free;

      // ゴール判定（エンジンのscoreRedが増えたか）
      if (st.scoreRed > 0 && shotFired) {
        outcome = "goal";
        if (!firstShotOnTarget && shotCount > 1) {
          reboundGoals++;
        }
        break;
      }

      // セーブ判定
      if (!b.free && b.owner === RED_GK_IDX && shotFired) {
        outcome = "save";
        break;
      }

      // アウト判定
      if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
        if (shotFired) outcome = "miss";
        break;
      }

      if (st.setPieceRestart && shotFired) {
        outcome = "save";
        break;
      }

      if (st.matchPhase === "kickoff" && shotFired) {
        outcome = "goal";
        if (!firstShotOnTarget && shotCount > 1) reboundGoals++;
        break;
      }
    }

    if (outcome === "goal") goals++;
    else if (outcome === "save") saves++;
  }

  const cooldownFrames = (P.gkHoldCooldown * 2.0) / physDt;

  return {
    goalRate: goals / trials,
    saveRate: saves / trials,
    reboundGoalRate: reboundGoals / trials,
    dtPhysics: physDt,
    cooldownFrames,
  };
}

// ============================================================
// 完全試合シミュレーション（headless-sim相当）
// ============================================================
function runFullMatch(speedMode: string, numMatches: number): {
  avgGoalsPerMatch: number;
  avgShotsPerMatch: number;
  goalConversionRate: number;
} {
  const REAL_DT = 1 / 60;
  let totalGoals = 0;
  let totalShots = 0;

  for (let m = 0; m < numMatches; m++) {
    const st = mkState();
    (st as any).speed = speedMode;
    st.matchPhase = "play";

    const maxFrames = 240 * 60 * 2; // 240s * 60fps * 2 halves
    let prevScore = 0;

    for (let frame = 0; frame < maxFrames; frame++) {
      update(st, REAL_DT);
      const curScore = st.scoreBlue + st.scoreRed;
      if (curScore > prevScore) {
        totalGoals += curScore - prevScore;
        prevScore = curScore;
      }
      if (st.matchPhase === "end") break;
    }

    // Count shots from action log
    for (const log of st.actionLog) {
      if (log.action === "shot") totalShots++;
    }
  }

  return {
    avgGoalsPerMatch: totalGoals / numMatches,
    avgShotsPerMatch: totalShots / numMatches,
    goalConversionRate: totalShots > 0 ? totalGoals / totalShots : 0,
  };
}

// ============================================================
// メイン調査
// ============================================================
console.log("=".repeat(70));
console.log("3つのシミュレーション経路の差異調査");
console.log("=".repeat(70));

// 1. speedMulとdtの計算
console.log("\n【1. speedMulとdtの計算】");
const PHYS_SCALE = 27.0;
const REAL_DT = 1 / 60;
for (const [mode, mul] of Object.entries(SPEED_MULTIPLIERS)) {
  const physDt = REAL_DT * (mul as number) * PHYS_SCALE;
  const cooldownSec = P.gkHoldCooldown * 2.0;
  const cooldownFrames = cooldownSec / physDt;
  const decisionIntervalFrames = P.decisionInterval / physDt;
  console.log(`  ${mode.padEnd(6)}: speedMul=${(mul as number).toFixed(4)}, physDt=${physDt.toFixed(4)}s/frame, cooldown=${cooldownFrames.toFixed(1)}frames, AI判断=${decisionIntervalFrames.toFixed(1)}frames`);
}

console.log("\n【2. 27mシュートシナリオのゴール率比較】");
console.log("  (各モードで2000試行)");

const modes = ["MID", "FAST", "VFAST"];
const results: Record<string, ReturnType<typeof runScenario27m>> = {};

for (const mode of modes) {
  process.stdout.write(`  ${mode}...`);
  const r = runScenario27m(mode, TRIALS);
  results[mode] = r;
  console.log(` ゴール率=${(r.goalRate*100).toFixed(1)}%, セーブ率=${(r.saveRate*100).toFixed(1)}%, リバウンドゴール率=${(r.reboundGoalRate*100).toFixed(1)}%, cooldown=${r.cooldownFrames.toFixed(1)}frames`);
}

console.log("\n【3. 差異の分析】");
const midGoal = results["MID"].goalRate;
const vfastGoal = results["VFAST"].goalRate;
console.log(`  MID vs VFAST ゴール率差: ${((vfastGoal - midGoal)*100).toFixed(1)}% (MID=${(midGoal*100).toFixed(1)}%, VFAST=${(vfastGoal*100).toFixed(1)}%)`);
console.log(`  MID cooldown: ${results["MID"].cooldownFrames.toFixed(1)}frames (${(P.gkHoldCooldown * 2.0).toFixed(1)}s)`);
console.log(`  VFAST cooldown: ${results["VFAST"].cooldownFrames.toFixed(1)}frames (${(P.gkHoldCooldown * 2.0).toFixed(1)}s)`);

console.log("\n【4. scenario-sim.tsの問題点】");
console.log(`  scenario-sim.tsはst.speedを設定していない → デフォルトMID (speedMul=0.40)`);
console.log(`  headless-sim.tsはst.speed="VFAST" (speedMul=2.0)`);
console.log(`  実際のゲームプレイはVFAST (speedMul=2.0)`);
console.log(`  → scenario-sim.tsとheadless-sim.ts/実際のゲームで5倍のspeedMul差がある`);

console.log("\n【5. cooldown差異の影響】");
const midCooldownFrames = results["MID"].cooldownFrames;
const vfastCooldownFrames = results["VFAST"].cooldownFrames;
console.log(`  MID: GKパンチ後 ${midCooldownFrames.toFixed(1)}フレーム間は誰もボールを拾えない`);
console.log(`  VFAST: GKパンチ後 ${vfastCooldownFrames.toFixed(1)}フレーム間は誰もボールを拾えない`);
console.log(`  → VFASTではcooldownが${(midCooldownFrames/vfastCooldownFrames).toFixed(1)}倍短い`);

console.log("\n【6. 他のcooldown/タイマーへの影響】");
const physDtMid = REAL_DT * 0.40 * PHYS_SCALE;
const physDtVfast = REAL_DT * 2.0 * PHYS_SCALE;
const timers = [
  { name: "b.cooldown (kick後)", val: 0.15 },
  { name: "b.cooldown (GKパンチ後)", val: P.gkHoldCooldown * 2.0 },
  { name: "b.cooldown (GKキャッチ後)", val: P.gkHoldCooldown },
  { name: "b.cooldown (restart)", val: P.restartNoIntercept },
  { name: "b.gkPunchedT (GKパンチ後再セーブ不可)", val: 21.6 },
  { name: "decisionInterval (AI判断間隔)", val: P.decisionInterval },
];
for (const t of timers) {
  const midFrames = t.val / physDtMid;
  const vfastFrames = t.val / physDtVfast;
  console.log(`  ${t.name.padEnd(35)}: MID=${midFrames.toFixed(1)}f, VFAST=${vfastFrames.toFixed(1)}f (${t.val}s)`);
}

console.log("\n【7. 結論と修正方針】");
console.log("  問題1: scenario-sim.tsでst.speedが未設定 → MIDで動作しているが実際はVFAST");
console.log("  問題2: cooldown値がphysics-secondsで設定されているが、speedMulで実効時間が変わる");
console.log("  問題3: VFAST時にcooldownが短すぎてGKパンチ後のリバウンドゴールが増える");
console.log("\n  修正方針:");
console.log("  A. scenario-sim.tsにst.speed='VFAST'を追加（実際のゲームに合わせる）");
console.log("  B. cooldown値をphysics-secondsではなくreal-secondsで設定する");
console.log("     → b.cooldown = realSeconds / (speedMul * PHYS_SCALE) のように変換");
console.log("  C. または、cooldownをspeedMulに依存しないよう、physDt単位で設定する");
