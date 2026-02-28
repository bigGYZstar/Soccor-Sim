/**
 * headless-sim.mjs
 * ヘッドレスシミュレーター - 試合シミュレーションを実行してデータをJSON出力する
 *
 * 使用方法:
 *   node scripts/headless-sim.mjs [options]
 *
 * オプション:
 *   --matches <n>        試合数 (デフォルト: 1)
 *   --blue-formation <f> BLUEチームのフォーメーション (デフォルト: 4-4-2)
 *   --red-formation <f>  REDチームのフォーメーション (デフォルト: 4-4-2)
 *   --output <file>      出力ファイルパス (デフォルト: stdout)
 *   --heatmap            ヒートマップデータを含める
 *   --no-log             アクションログを除外する
 *   --seed <n>           乱数シード (再現性のため)
 *
 * 出力形式 (JSON):
 * {
 *   "meta": { "version": "1.0", "matches": 1, "blueFormation": "4-4-2", ... },
 *   "results": [
 *     {
 *       "matchId": 0,
 *       "score": { "blue": 2, "red": 1 },
 *       "winner": "blue",
 *       "stats": { ... },
 *       "playerStats": [ ... ],
 *       "heatmaps": [ ... ],  // --heatmap オプション時のみ
 *       "actionLog": [ ... ]  // --no-log オプションなし時のみ
 *     }
 *   ]
 * }
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
function hasFlag(name) { return args.includes(name); }

const NUM_MATCHES = parseInt(getArg('--matches', '1'), 10);
const BLUE_FORMATION = getArg('--blue-formation', '4-4-2');
const RED_FORMATION = getArg('--red-formation', '4-4-2');
const OUTPUT_FILE = getArg('--output', null);
const INCLUDE_HEATMAP = hasFlag('--heatmap');
const INCLUDE_LOG = !hasFlag('--no-log');
const SEED = getArg('--seed', null);

// ─── Seeded RNG (optional) ────────────────────────────────────────────────────
// Note: The engine uses Math.random() internally. For reproducibility,
// you can override Math.random with a seeded PRNG.
if (SEED !== null) {
  let s = parseInt(SEED, 10);
  Math.random = () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

// ─── Load Engine via Vite-compiled output ─────────────────────────────────────
// Since the engine is TypeScript, we need to use tsx or compile it.
// We'll use a dynamic import with tsx/ts-node if available.
// Alternatively, we use the Vite build output.

async function loadEngine() {
  // Try to use tsx for TypeScript execution
  try {
    // Check if tsx is available
    const { execSync } = await import('child_process');
    execSync('npx tsx --version', { stdio: 'ignore' });
    return null; // Will use tsx runner below
  } catch {
    // tsx not available
  }
  return null;
}

// ─── Simulation Runner ────────────────────────────────────────────────────────
// Since we can't easily import TypeScript directly in .mjs,
// we create a TypeScript runner script that uses tsx

const tsRunnerCode = `
import { mkState, update } from '../client/src/game/engine';
import type { State } from '../client/src/game/types';

const NUM_MATCHES = ${NUM_MATCHES};
const BLUE_FORMATION = '${BLUE_FORMATION}';
const RED_FORMATION = '${RED_FORMATION}';
const INCLUDE_HEATMAP = ${INCLUDE_HEATMAP};
const INCLUDE_LOG = ${INCLUDE_LOG};

const DT = 1 / 60; // 60fps simulation
const MAX_FRAMES = 90 * 60 * 60; // 90 game-minutes at 60fps (with time compression)

function runMatch(matchId: number) {
  const st = mkState(BLUE_FORMATION as any, RED_FORMATION as any);
  let frames = 0;

  while (!st.over && frames < MAX_FRAMES) {
    update(st, DT);
    frames++;
  }

  // Build player stats
  const playerStats = st.pl.map(p => {
    const ps = st.stats.playerStats[p.idx] || {
      playerIdx: p.idx, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
      passes: 0, passSuccess: 0, dribbles: 0, dribbleSuccess: 0,
      tackles: 0, tackleSuccess: 0, interceptions: 0, saves: 0,
    };
    const passRate = ps.passes > 0 ? ps.passSuccess / ps.passes : 0;
    const shotRate = ps.shots > 0 ? ps.shotsOnTarget / ps.shots : 0;
    const dribRate = ps.dribbles > 0 ? ps.dribbleSuccess / ps.dribbles : 0;
    const tackleRate = ps.tackles > 0 ? ps.tackleSuccess / ps.tackles : 0;

    // Calculate rating
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
      name: p.cardName || \`#\${p.num}\`,
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
    };
  });

  const totalPoss = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
  const possBlue = totalPoss > 0 ? Math.round((st.stats.possessionFrames.blue / totalPoss) * 1000) / 10 : 50;
  const passRateBlue = st.stats.passAttempts.blue > 0
    ? Math.round((st.stats.passSuccess.blue / st.stats.passAttempts.blue) * 1000) / 10 : 0;
  const passRateRed = st.stats.passAttempts.red > 0
    ? Math.round((st.stats.passSuccess.red / st.stats.passAttempts.red) * 1000) / 10 : 0;

  const result: any = {
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
      corners: { blue: st.stats.corners?.blue || 0, red: st.stats.corners?.red || 0 },
    },
    playerStats,
  };

  if (INCLUDE_HEATMAP && st.heatmaps) {
    result.heatmaps = st.heatmaps.map(hm => ({
      playerIdx: hm.playerIdx,
      team: hm.team === -1 ? 'blue' : 'red',
      offBall: hm.offBall.map(pt => ({ x: Math.round(pt.x * 1000) / 1000, y: Math.round(pt.y * 1000) / 1000 })),
      onBall: hm.onBall.map(ev => ({
        type: ev.type,
        x: Math.round(ev.x * 1000) / 1000,
        y: Math.round(ev.y * 1000) / 1000,
        t: ev.t,
      })),
    }));
  }

  if (INCLUDE_LOG) {
    result.actionLog = st.log.map(entry => ({
      t: Math.round(entry.t * 10) / 10,
      text: entry.text,
    }));
  }

  return result;
}

// Run all matches
const results = [];
for (let i = 0; i < NUM_MATCHES; i++) {
  process.stderr.write(\`Running match \${i + 1}/\${NUM_MATCHES}...\\n\`);
  results.push(runMatch(i));
}

// Aggregate stats for multiple matches
const aggregate = NUM_MATCHES > 1 ? {
  blueWins: results.filter(r => r.winner === 'blue').length,
  redWins: results.filter(r => r.winner === 'red').length,
  draws: results.filter(r => r.winner === 'draw').length,
  avgGoalsBlue: results.reduce((s, r) => s + r.score.blue, 0) / NUM_MATCHES,
  avgGoalsRed: results.reduce((s, r) => s + r.score.red, 0) / NUM_MATCHES,
  avgShotsBlue: results.reduce((s, r) => s + r.stats.shots.blue, 0) / NUM_MATCHES,
  avgShotsRed: results.reduce((s, r) => s + r.stats.shots.red, 0) / NUM_MATCHES,
  avgPossessionBlue: results.reduce((s, r) => s + r.stats.possession.blue, 0) / NUM_MATCHES,
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

process.stdout.write(JSON.stringify(output, null, 2));
`;

// Write the TypeScript runner
import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

mkdirSync('/home/ubuntu/futsal-sim/scripts', { recursive: true });
writeFileSync('/home/ubuntu/futsal-sim/scripts/_runner.ts', tsRunnerCode);

// Run with tsx
const outputArg = OUTPUT_FILE ? `> "${OUTPUT_FILE}"` : '';
try {
  const cmd = `cd /home/ubuntu/futsal-sim && npx tsx scripts/_runner.ts ${outputArg}`;
  process.stderr.write(`Executing: ${cmd}\n`);
  execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
}
