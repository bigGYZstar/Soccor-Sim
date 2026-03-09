/**
 * scenario-sim.ts
 * ゴール前シチュエーション限定シミュレーター
 * 
 * scenarioActiveIdxsを使って特定の選手だけAI処理を行う。
 * 不要な選手はAI・インターセプト・GKセーブ・DFブロックすべてから除外される。
 * 
 * 座標系:
 *   - 青チーム(team=-1): 左側(x<0)から右側(x>0)に向かって攻撃
 *   - 赤チーム(team=+1): 右側(x>0)から左側(x<0)に向かって攻撃
 *   - 青チームのゴール: x = -52.5
 *   - 赤チームのゴール: x = +52.5
 *   - ペナルティエリア境界: |x| > 36m (52.5 - 16.5)
 * 
 * シナリオ設定:
 *   - 攻撃者(青チーム, team=-1): idx 9 (FWD, slot=9)
 *   - 赤GK(team=+1): idx 11 (GK, slot=0)
 *   - 赤DF1: idx 12 (DEF, slot=1)
 *   - 赤DF2: idx 13 (DEF, slot=2)
 */

import { mkState, update, mkPlayers, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';
import * as fs from 'fs';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;  // ゴール半幅 7.32m
const GOAL_DEPTH = 2.0;    // ゴール深さ
const PEN_AREA_W = 16.5;
const PEN_AREA_BOUNDARY_X = PITCH_HALF_W - PEN_AREA_W; // 36m from center

// 青チームFWD: idx=9 (slot=9, FWD)
// 赤チームGK: idx=11 (slot=0, GK)
// 赤チームDF1: idx=12 (slot=1, DEF)
// 赤チームDF2: idx=13 (slot=2, DEF)
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;
const RED_DF1_IDX = 12;
const RED_DF2_IDX = 13;

interface ScenarioConfig {
  id: string;
  desc: string;
  // 攻撃者の初期位置（赤ゴール=x=+52.5方向に攻撃する青チームFWD）
  attackerPos: { x: number; y: number };
  // GKを含めるか
  includeGK: boolean;
  // DFを含めるか（枚数）
  dfCount: number;
  // DFの初期位置
  dfPositions?: { x: number; y: number }[];
  // 試行回数
  trials: number;
  // タイムアウト（シミュレーション秒）
  timeoutSec: number;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "PA_solo_center_12m",
    desc: "PA内中央12m、GKのみ（1対1）",
    attackerPos: { x: PITCH_HALF_W - 12, y: 0 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "PA_solo_angle_12m",
    desc: "PA内サイド12m（角度あり）、GKのみ",
    attackerPos: { x: PITCH_HALF_W - 12, y: 6 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "PA_edge_center_16m",
    desc: "PA端16.5m中央、GKのみ",
    attackerPos: { x: PITCH_HALF_W - 16.5, y: 0 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "PA_1v1_DF_12m",
    desc: "PA内12m、GK+DF1枚",
    attackerPos: { x: PITCH_HALF_W - 12, y: 0 },
    includeGK: true,
    dfCount: 1,
    dfPositions: [{ x: PITCH_HALF_W - 10, y: 1.5 }],
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "PA_1v2_DF_12m",
    desc: "PA内12m、GK+DF2枚",
    attackerPos: { x: PITCH_HALF_W - 12, y: 0 },
    includeGK: true,
    dfCount: 2,
    dfPositions: [
      { x: PITCH_HALF_W - 10, y: 1.5 },
      { x: PITCH_HALF_W - 10, y: -1.5 },
    ],
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "edge_solo_22m",
    desc: "エリア外22m中央、GKのみ",
    attackerPos: { x: PITCH_HALF_W - 22, y: 0 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "edge_solo_27m",
    desc: "エリア外27m中央、GKのみ",
    attackerPos: { x: PITCH_HALF_W - 27, y: 0 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "PA_angle_16m_DF1",
    desc: "PA端16.5m角度あり、GK+DF1枚",
    attackerPos: { x: PITCH_HALF_W - 16.5, y: 7 },
    includeGK: true,
    dfCount: 1,
    dfPositions: [{ x: PITCH_HALF_W - 14, y: 3 }],
    trials: 2000,
    timeoutSec: 8,
  },
  {
    id: "counter_25m_noDF",
    desc: "カウンター25m、GKのみ（スピード重視）",
    attackerPos: { x: PITCH_HALF_W - 25, y: 2 },
    includeGK: true,
    dfCount: 0,
    trials: 2000,
    timeoutSec: 8,
  },
];

interface TrialResult {
  outcome: "goal" | "save" | "block" | "miss" | "timeout";
  shotDist: number;
  shotAngle: number;
  shotTimeSec: number;
  shotX: number;
  shotY: number;
}

function runScenario(cfg: ScenarioConfig): TrialResult[] {
  const results: TrialResult[] = [];

  for (let trial = 0; trial < cfg.trials; trial++) {
    // 状態を初期化
    const st = mkState();
    st.matchPhase = "play";
    st.matchClock = 0;
    st.kickoffReady = false;

    // アクティブ選手セットを構築
    const activeIdxs = new Set<number>();
    activeIdxs.add(BLUE_FWD_IDX); // 攻撃者（青FWD）

    if (cfg.includeGK) {
      activeIdxs.add(RED_GK_IDX); // 赤GK
    }
    for (let d = 0; d < cfg.dfCount; d++) {
      activeIdxs.add(RED_DF1_IDX + d);
    }

    st.scenarioActiveIdxs = activeIdxs;

    // 攻撃者の配置
    const attacker = st.pl[BLUE_FWD_IDX];
    attacker.pos = { x: cfg.attackerPos.x, y: cfg.attackerPos.y };
    attacker.home = { x: cfg.attackerPos.x, y: cfg.attackerPos.y };
    attacker.tgt = { x: cfg.attackerPos.x, y: cfg.attackerPos.y };
    attacker.face = v(1, 0); // 赤ゴール方向
    attacker.dt = 0; // すぐにAI判断
    attacker.act = "idle";

    // 足の位置を初期化（位置設定後に呼ぶ必要がある）
    updatePlayerFeet(attacker);

    // ボールを攻撃者に持たせる
    st.ball.pos = { x: cfg.attackerPos.x, y: cfg.attackerPos.y };
    st.ball.vel = v(0, 0);
    st.ball.free = false;
    st.ball.owner = BLUE_FWD_IDX;
    st.ball.lastTouchTeam = -1;
    st.ball.shot = false;
    st.ball.cooldown = 0;
    st.ball.z = 0;
    st.ball.vz = 0;

    // GKの配置（赤チームGKはx=+52.5のゴール前）
    if (cfg.includeGK) {
      const gk = st.pl[RED_GK_IDX];
      gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
      gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
      gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
      gk.face = v(-1, 0);
      gk.dt = 0;
      gk.act = "idle";
      updatePlayerFeet(gk);
    }

    // DFの配置
    for (let d = 0; d < cfg.dfCount; d++) {
      const dfIdx = RED_DF1_IDX + d;
      const df = st.pl[dfIdx];
      const dfPos = cfg.dfPositions?.[d] ?? { x: PITCH_HALF_W - 10, y: (d % 2 === 0 ? 2 : -2) };
      df.pos = { x: dfPos.x, y: dfPos.y };
      df.home = { x: dfPos.x, y: dfPos.y };
      df.tgt = { x: dfPos.x, y: dfPos.y };
      df.face = v(-1, 0);
      df.dt = 0;
      df.act = "idle";
      updatePlayerFeet(df);
    }

    // シミュレーション実行
    const DT = 1 / 60; // 60fps
    const maxFrames = Math.ceil(cfg.timeoutSec * 60);
    let outcome: TrialResult["outcome"] = "timeout";
    let shotDist = 0;
    let shotAngle = 0;
    let shotTimeSec = 0;
    let shotX = 0;
    let shotY = 0;
    let shotFired = false;
    let prevBallShot = false;

    for (let frame = 0; frame < maxFrames; frame++) {
      update(st, DT);

      const b = st.ball;
      const timeSec = frame * DT;

      // シュートが発射されたか検出（false→trueの遷移を検出）
      const justFired = b.shot && b.free && !prevBallShot;
      if (!shotFired && justFired) {
        shotFired = true;
        // シュートを打った選手の位置を使う（ball.posはすでに移動している可能性があるため）
        const kickerIdx = b.lastKickerIdx >= 0 ? b.lastKickerIdx : BLUE_FWD_IDX;
        const kicker = st.pl[kickerIdx];
        shotX = kicker.pos.x;
        shotY = kicker.pos.y;
        // 赤ゴール（x=+52.5）までの距離
        const goalX = PITCH_HALF_W;
        const goalY = 0;
        shotDist = Math.sqrt((goalX - shotX) ** 2 + (goalY - shotY) ** 2);
        // 角度：ゴール中心からの水平角度
        const dx = goalX - shotX;
        const dy = shotY - goalY;
        shotAngle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
        shotTimeSec = timeSec;
      }
      prevBallShot = b.shot && b.free;

      // ゴール判定（赤チームのゴール: x > +52.5+goalDepth=54.5）
      // またはゴールポスト内（x > 52.5）かつ枠内（|y| < 3.66）かつボールが自由（誰も持っていない）
      if (Math.abs(b.pos.y) < GOAL_HALF_H && shotFired) {
        if (b.pos.x > PITCH_HALF_W + GOAL_DEPTH) {
          // ゴールネット奥まで到達 = 確実にゴール
          outcome = "goal";
          break;
        } else if (b.pos.x > PITCH_HALF_W && b.free) {
          // ゴールポスト内でボールが自由 = ゴール（GKが取っていない）
          outcome = "goal";
          break;
        }
      }

      // スコア変化でゴール検出
      if (st.scoreRed > 0 || (st as any)._lastGoalTeam === -1) {
        outcome = "goal";
        break;
      }

      // matchPhase=kickoff = ゴールが入ってキックオフ準備中
      if (st.matchPhase === "kickoff" && shotFired) {
        outcome = "goal";
        break;
      }

      // GKがボールを持った = セーブ
      if (!b.free && b.owner === RED_GK_IDX && shotFired) {
        outcome = "save";
        break;
      }

      // DFがボールを持った = ブロック
      for (let d = 0; d < cfg.dfCount; d++) {
        if (!b.free && b.owner === RED_DF1_IDX + d && shotFired) {
          outcome = "block";
          break;
        }
      }
      if (outcome === "block") break;

      // ボールがアウト（ゴールライン・サイドライン）
      if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
        if (shotFired) {
          // 守備側（赤チーム=team+1）が最後に触れた後のアウトはセーブ（GKパンチ等）
          // 攻撃側（青チーム=team-1）が最後に触れた後のアウトは枠外
          if (b.lastTouchTeam === 1) {
            outcome = "save"; // GKパンチ後のアウト = セーブ
          } else {
            outcome = "miss"; // 枠外
          }
        }
        break;
      }

      // setPieceRestart が設定された = セットプレー再開（ゴールキック等）
      if (st.setPieceRestart && shotFired) {
        // ゴールキックになった = GKがセーブしてゴールキック
        outcome = "save";
        break;
      }

      // ゴールが入ったかスコアで確認
      if (st.scoreRed !== 0) {
        outcome = "goal";
        break;
      }
    }

    // ゴール判定の補完（スコアで確認）
    if (outcome === "timeout" && st.scoreRed > 0) {
      outcome = "goal";
    }

    results.push({
      outcome,
      shotDist,
      shotAngle,
      shotTimeSec,
      shotX,
      shotY,
    });
  }

  return results;
}

function analyzeResults(cfg: ScenarioConfig, results: TrialResult[]) {
  const goals = results.filter(r => r.outcome === "goal").length;
  const saves = results.filter(r => r.outcome === "save").length;
  const blocks = results.filter(r => r.outcome === "block").length;
  const misses = results.filter(r => r.outcome === "miss").length;
  const timeouts = results.filter(r => r.outcome === "timeout").length;
  const total = results.length;

  const shotResults = results.filter(r => r.shotDist > 0);
  const avgDist = shotResults.length > 0
    ? shotResults.reduce((s, r) => s + r.shotDist, 0) / shotResults.length
    : 0;
  const sdDist = shotResults.length > 1
    ? Math.sqrt(shotResults.reduce((s, r) => s + (r.shotDist - avgDist) ** 2, 0) / (shotResults.length - 1))
    : 0;
  const avgAngle = shotResults.length > 0
    ? shotResults.reduce((s, r) => s + r.shotAngle, 0) / shotResults.length
    : 0;
  const avgTime = shotResults.length > 0
    ? shotResults.reduce((s, r) => s + r.shotTimeSec, 0) / shotResults.length
    : 0;

  // 距離帯別分布
  const distBands = [
    { label: "0-8m",   min: 0,  max: 8  },
    { label: "8-12m",  min: 8,  max: 12 },
    { label: "12-16m", min: 12, max: 16 },
    { label: "16-22m", min: 16, max: 22 },
    { label: "22-27m", min: 22, max: 27 },
    { label: "27m+",   min: 27, max: 999 },
  ];

  const distDist = distBands.map(band => {
    const count = shotResults.filter(r => r.shotDist >= band.min && r.shotDist < band.max).length;
    return { ...band, count, pct: shotResults.length > 0 ? (count / shotResults.length * 100).toFixed(1) : "0.0" };
  });

  return {
    id: cfg.id,
    desc: cfg.desc,
    total,
    goals, saves, blocks, misses, timeouts,
    goalRate: (goals / total * 100).toFixed(1),
    saveRate: (saves / total * 100).toFixed(1),
    blockRate: (blocks / total * 100).toFixed(1),
    missRate: (misses / total * 100).toFixed(1),
    timeoutRate: (timeouts / total * 100).toFixed(1),
    avgDist: avgDist.toFixed(1),
    sdDist: sdDist.toFixed(1),
    avgAngle: avgAngle.toFixed(1),
    avgTimeSec: avgTime.toFixed(2),
    distDist,
    shotCount: shotResults.length,
    noShotRate: ((total - shotResults.length) / total * 100).toFixed(1),
  };
}

// メイン実行
const allResults: ReturnType<typeof analyzeResults>[] = [];

for (const cfg of SCENARIOS) {
  console.log(`▶ ${cfg.id}`);
  console.log(`  ${cfg.desc}`);

  const results = runScenario(cfg);
  const analysis = analyzeResults(cfg, results);
  allResults.push(analysis);

  console.log(`  ゴール率:   ${analysis.goalRate}% (${analysis.goals}/${analysis.total})`);
  console.log(`  セーブ率:   ${analysis.saveRate}%`);
  console.log(`  ブロック率: ${analysis.blockRate}%`);
  console.log(`  枠外率:     ${analysis.missRate}%`);
  console.log(`  無シュート: ${analysis.noShotRate}%`);
  console.log(`  平均シュート距離: ${analysis.avgDist}m (SD=${analysis.sdDist}m)`);
  console.log(`  平均シュート角度: ${analysis.avgAngle}°`);
  console.log(`  平均シュートまで: ${analysis.avgTimeSec}s`);
  console.log(`  距離帯分布:`);
  for (const band of analysis.distDist) {
    if (band.count > 0) {
      console.log(`    ${band.label}: ${band.pct}% (${band.count}件)`);
    }
  }
  console.log();
}

// 結果をJSONに保存
fs.writeFileSync('/home/ubuntu/scenario_results.json', JSON.stringify(allResults, null, 2));
console.log('結果を /home/ubuntu/scenario_results.json に保存しました');
