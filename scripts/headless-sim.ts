/**
 * headless-sim.ts
 * ヘッドレスシミュレーター - 試合シミュレーションを実行してデータをJSON出力する
 *
 * 使用方法:
 *   npx tsx scripts/headless-sim.ts [options]
 *
 * オプション:
 *   --matches <n>        試合数 (デフォルト: 1)
 *   --blue-formation <f> BLUEチームのフォーメーション (デフォルト: 4-4-2)
 *   --red-formation <f>  REDチームのフォーメーション (デフォルト: 4-4-2)
 *   --output <file>      出力ファイルパス (デフォルト: stdout)
 *   --heatmap            ヒートマップデータを含める
 *   --no-log             アクションログを除外する
 *   --seed <n>           乱数シード (再現性のため)
 *   --quiet              進捗メッセージを非表示
 *
 * 出力形式 (JSON):
 * {
 *   "meta": { "version": "1.0", "matches": 1, ... },
 *   "aggregate": { "blueWins": 1, "redWins": 0, ... },  // matches > 1 の場合
 *   "results": [
 *     {
 *       "matchId": 0,
 *       "score": { "blue": 2, "red": 1 },
 *       "winner": "blue",
 *       "stats": { ... },
 *       "playerStats": [ ... ],
 *       "heatmaps": [ ... ],   // --heatmap 時のみ
 *       "actionLog": [ ... ]   // --no-log なし時のみ
 *     }
 *   ]
 * }
 *
 * 使用例:
 *   # 1試合実行してヒートマップ付きでファイル出力
 *   npx tsx scripts/headless-sim.ts --heatmap --output match.json
 *
 *   # 100試合実行してバランス分析
 *   npx tsx scripts/headless-sim.ts --matches 100 --no-log --quiet --output stats.json
 *
 *   # フォーメーション比較
 *   npx tsx scripts/headless-sim.ts --matches 20 --blue-formation 4-3-3 --red-formation 3-5-2 --no-log
 */

import { writeFileSync } from 'fs';
import { mkState, update, doKickOff } from '../client/src/game/engine';
import type { FormationId } from '../client/src/game/constants';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
function hasFlag(name: string): boolean { return args.includes(name); }

const NUM_MATCHES = parseInt(getArg('--matches', '1'), 10);
const BLUE_FORMATION = getArg('--blue-formation', '4-4-2') as FormationId;
const RED_FORMATION = getArg('--red-formation', '4-4-2') as FormationId;
const OUTPUT_FILE = hasFlag('--output') ? getArg('--output', '') : null;
const INCLUDE_HEATMAP = hasFlag('--heatmap');
const INCLUDE_LOG = !hasFlag('--no-log');
const QUIET = hasFlag('--quiet');
const SEED_STR = hasFlag('--seed') ? getArg('--seed', '') : null;

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
if (SEED_STR !== null) {
  let s = parseInt(SEED_STR, 10);
  (Math as any).random = () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
  if (!QUIET) process.stderr.write(`Using seed: ${SEED_STR}\n`);
}

// ─── Simulation ───────────────────────────────────────────────────────────────
const DT = 1 / 60;
const MAX_FRAMES = 90 * 60 * 60; // safety limit

function runMatch(matchId: number) {
  const st = mkState(BLUE_FORMATION, RED_FORMATION);
  doKickOff(st);  // ★ Initialize kickoff taker and ball ownership
  let frames = 0;

  while (!st.over && frames < MAX_FRAMES) {
    update(st, DT);
    frames++;
  }

  // Build player stats
  const playerStats = st.pl.map(p => {
    const ps = st.stats.playerStats?.[p.idx] ?? {
      playerIdx: p.idx, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
      passes: 0, passSuccess: 0, dribbles: 0, dribbleSuccess: 0,
      tackles: 0, tackleSuccess: 0, interceptions: 0, saves: 0,
    };

    const passRate = ps.passes > 0 ? ps.passSuccess / ps.passes : 0;
    const shotRate = ps.shots > 0 ? ps.shotsOnTarget / ps.shots : 0;
    const dribRate = ps.dribbles > 0 ? ps.dribbleSuccess / ps.dribbles : 0;
    const tackleRate = ps.tackles > 0 ? ps.tackleSuccess / ps.tackles : 0;
    const progPasses = (ps as any).progPasses ?? 0;
    const progPassSuccess = (ps as any).progPassSuccess ?? 0;
    const longPasses = (ps as any).longPasses ?? 0;
    const longPassSuccess = (ps as any).longPassSuccess ?? 0;
    const progPassRate = progPasses > 0 ? progPassSuccess / progPasses : 0;
    const longPassRate = longPasses > 0 ? longPassSuccess / longPasses : 0;

    // Rating calculation (same as frontend)
    let rating = 6.0;
    rating += ps.goals * 0.8;
    rating += ps.assists * 0.5;
    rating += ps.shotsOnTarget * 0.15;
    rating += (passRate - 0.5) * 1.0;
    rating += dribRate * 0.5;
    rating += ps.interceptions * 0.2;
    rating += tackleRate * 0.3;
    if (p.isGK) rating += ps.saves * 0.4;
    rating = Math.max(4.0, Math.min(10.0, rating));

    return {
      playerIdx: p.idx,
      team: p.team === -1 ? 'blue' : 'red',
      num: p.num,
      name: p.cardName || `#${p.num}`,
      posLabel: p.posLabel || (p.isGK ? 'GK' : p.role),
      isGK: p.isGK,
      rating: Math.round(rating * 10) / 10,
      goals: ps.goals,
      assists: ps.assists,
      shots: ps.shots,
      shotsOnTarget: ps.shotsOnTarget,
      shotRate: Math.round(shotRate * 1000) / 10,
      passes: ps.passes,
      passSuccess: ps.passSuccess,
      passRate: Math.round(passRate * 1000) / 10,
      dribbles: ps.dribbles,
      dribbleSuccess: ps.dribbleSuccess,
      dribbleRate: Math.round(dribRate * 1000) / 10,
      tackles: ps.tackles,
      tackleSuccess: ps.tackleSuccess,
      tackleRate: Math.round(tackleRate * 1000) / 10,
      interceptions: ps.interceptions,
      saves: ps.saves,
      progPasses,
      progPassSuccess,
      progPassRate: Math.round(progPassRate * 1000) / 10,
      longPasses,
      longPassSuccess,
      longPassRate: Math.round(longPassRate * 1000) / 10,
    };
  });

  const totalPoss = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
  const possBlue = totalPoss > 0
    ? Math.round((st.stats.possessionFrames.blue / totalPoss) * 1000) / 10
    : 50;
  const passRateBlue = st.stats.passAttempts.blue > 0
    ? Math.round((st.stats.passSuccess.blue / st.stats.passAttempts.blue) * 1000) / 10 : 0;
  const passRateRed = st.stats.passAttempts.red > 0
    ? Math.round((st.stats.passSuccess.red / st.stats.passAttempts.red) * 1000) / 10 : 0;

  const result: Record<string, unknown> = {
    matchId,
    frames,
    score: { blue: st.scoreBlue, red: st.scoreRed },
    winner: st.scoreBlue > st.scoreRed ? 'blue' : st.scoreRed > st.scoreBlue ? 'red' : 'draw',
    stats: {
      possession: { blue: possBlue, red: Math.round((100 - possBlue) * 10) / 10 },
      shots: { blue: st.stats.shotsTotal.blue, red: st.stats.shotsTotal.red },
      shotsOnTarget: { blue: st.stats.shotsOnTarget.blue, red: st.stats.shotsOnTarget.red },
      passes: { blue: st.stats.passAttempts.blue, red: st.stats.passAttempts.red },
      passSuccess: { blue: st.stats.passSuccess.blue, red: st.stats.passSuccess.red },
      passRate: { blue: passRateBlue, red: passRateRed },
      interceptions: { blue: st.stats.interceptions.blue, red: st.stats.interceptions.red },
      corners: { blue: (st.stats as any).corners?.blue ?? 0, red: (st.stats as any).corners?.red ?? 0 },
    },
    playerStats,
  };

  if (INCLUDE_HEATMAP && st.heatmaps) {
    result.heatmaps = st.heatmaps.map(hm => {
      const pl = st.pl[hm.playerIdx];
      return {
      playerIdx: hm.playerIdx,
      playerNum: pl?.num ?? hm.playerIdx,
      playerName: pl?.cardName || pl?.name || `#${hm.playerIdx}`,
      posLabel: pl?.posLabel || (pl?.isGK ? 'GK' : pl?.role),
      team: hm.team === -1 ? 'blue' : 'red',
      // Downsample offBall to reduce file size (keep every 10th sample)
      offBall: hm.offBall
        .filter((_, i) => i % 10 === 0)
        .map(pt => ({
          x: Math.round(pt.x * 1000) / 1000,
          y: Math.round(pt.y * 1000) / 1000,
        })),
      onBall: hm.onBall.map(ev => ({
        type: ev.type,
        x: Math.round(ev.x * 1000) / 1000,
        y: Math.round(ev.y * 1000) / 1000,
        t: Math.round(ev.t * 10) / 10,
      })),
      };
    });
  }

  if (INCLUDE_LOG) {
    result.actionLog = st.fullLog.map((entry: any) => ({
      t: Math.round(entry.time * 10) / 10,
      text: entry.detail,
      team: entry.team === -1 ? 'blue' : 'red',
      action: entry.action,
    }));
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const results: ReturnType<typeof runMatch>[] = [];
for (let i = 0; i < NUM_MATCHES; i++) {
  if (!QUIET) process.stderr.write(`Running match ${i + 1}/${NUM_MATCHES}...\n`);
  results.push(runMatch(i));
}

// Aggregate stats
const aggregate = NUM_MATCHES > 1 ? {
  blueWins: results.filter(r => r.winner === 'blue').length,
  redWins: results.filter(r => r.winner === 'red').length,
  draws: results.filter(r => r.winner === 'draw').length,
  blueWinRate: Math.round((results.filter(r => r.winner === 'blue').length / NUM_MATCHES) * 1000) / 10,
  redWinRate: Math.round((results.filter(r => r.winner === 'red').length / NUM_MATCHES) * 1000) / 10,
  drawRate: Math.round((results.filter(r => r.winner === 'draw').length / NUM_MATCHES) * 1000) / 10,
  avgGoalsBlue: Math.round(results.reduce((s, r) => s + (r.score as any).blue, 0) / NUM_MATCHES * 100) / 100,
  avgGoalsRed: Math.round(results.reduce((s, r) => s + (r.score as any).red, 0) / NUM_MATCHES * 100) / 100,
  avgShotsBlue: Math.round(results.reduce((s, r) => s + (r.stats as any).shots.blue, 0) / NUM_MATCHES * 10) / 10,
  avgShotsRed: Math.round(results.reduce((s, r) => s + (r.stats as any).shots.red, 0) / NUM_MATCHES * 10) / 10,
  avgPossessionBlue: Math.round(results.reduce((s, r) => s + (r.stats as any).possession.blue, 0) / NUM_MATCHES * 10) / 10,
  avgPassRateBlue: Math.round(results.reduce((s, r) => s + (r.stats as any).passRate.blue, 0) / NUM_MATCHES * 10) / 10,
  avgPassRateRed: Math.round(results.reduce((s, r) => s + (r.stats as any).passRate.red, 0) / NUM_MATCHES * 10) / 10,
} : null;

const output = {
  meta: {
    version: '1.0',
    matches: NUM_MATCHES,
    blueFormation: BLUE_FORMATION,
    redFormation: RED_FORMATION,
    includeHeatmap: INCLUDE_HEATMAP,
    includeLog: INCLUDE_LOG,
    generatedAt: new Date().toISOString(),
  },
  aggregate,
  results,
};

const json = JSON.stringify(output, null, 2);

if (OUTPUT_FILE) {
  writeFileSync(OUTPUT_FILE, json, 'utf-8');
  if (!QUIET) process.stderr.write(`Output written to: ${OUTPUT_FILE}\n`);
} else {
  process.stdout.write(json);
}
