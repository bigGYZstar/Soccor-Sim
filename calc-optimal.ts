/**
 * calc-optimal.ts
 * 最適パラメータ探索
 * 
 * 目標ゴール率：
 * - 12m中央（GKのみ）: 75%
 * - 16.5m中央（GKのみ）: 45%
 * - 22m中央（GKのみ）: 18%
 * - 27m中央（GKのみ）: 10%
 */

const GOAL_HALF_H = 3.66; // ゴール半幅
const SHOT_ACCURACY = 0.58; // 基本射撃精度
const BASE_PSA = (1 - SHOT_ACCURACY) * 2.5; // 12mでのpSA = 1.05m

// 目標ゴール率
const TARGETS = {
  12: 0.75,
  16.5: 0.45,
  22: 0.18,
  27: 0.10,
};

function calcGoalRate(
  dist: number,
  pSAScale: number,
  gkSaveRadius: number,
  gkSaveBase: number,
  gkAngleBonus: number,
  trials: number = 50000
): number {
  const pSA = BASE_PSA * pSAScale;
  
  let goals = 0;
  
  for (let i = 0; i < trials; i++) {
    // シュートの誤差（Y軸のみ）
    const yErr = (Math.random() * 2 - 1) * pSA;
    const targetY = yErr;
    
    // 枠外チェック
    if (Math.abs(targetY) > GOAL_HALF_H) {
      continue; // ミス（ゴールにならない）
    }
    
    // GKのY位置（y=0に固定）
    const gkY = 0;
    
    // GKとシュートの距離
    const distGKToShot = Math.abs(targetY - gkY);
    
    // canSave判定
    const canSave = distGKToShot < gkSaveRadius;
    
    if (canSave) {
      // セーブ確率（角度ボーナスは正面からのシュートで最大）
      const saveChance = gkSaveBase + gkAngleBonus * 0.8;
      if (Math.random() < saveChance) {
        continue; // セーブ
      }
    }
    
    goals++;
  }
  
  return goals / trials;
}

// 目標ゴール率に最も近いパラメータを探索
// 制約：pSAScaleは距離の関数（一貫したスケール関数を使用）
// gkSaveRadius, gkSaveBase, gkAngleBonusは固定

console.log("=== 最適パラメータ探索 ===\n");

// pSAScale = (dist/12)^alpha のalphaを探索
// gkSaveRadius, gkSaveBase, gkAngleBonusを固定

let bestError = Infinity;
let bestParams = { alpha: 1.0, gkSaveRadius: 0.9, gkSaveBase: 0.30, gkAngleBonus: 0.15 };

for (let alpha = 0.5; alpha <= 4.0; alpha += 0.1) {
  for (let gkSaveRadius = 0.5; gkSaveRadius <= 3.0; gkSaveRadius += 0.1) {
    for (let gkSaveBase = 0.10; gkSaveBase <= 0.60; gkSaveBase += 0.05) {
      const gkAngleBonus = 0.10;
      
      let totalError = 0;
      for (const [distStr, target] of Object.entries(TARGETS)) {
        const dist = parseFloat(distStr);
        const pSAScale = Math.pow(dist / 12.0, alpha);
        const rate = calcGoalRate(dist, pSAScale, gkSaveRadius, gkSaveBase, gkAngleBonus, 20000);
        totalError += Math.pow(rate - target, 2);
      }
      
      if (totalError < bestError) {
        bestError = totalError;
        bestParams = { alpha, gkSaveRadius, gkSaveBase, gkAngleBonus };
      }
    }
  }
}

console.log(`最適パラメータ:`);
console.log(`  alpha = ${bestParams.alpha.toFixed(1)}`);
console.log(`  gkSaveRadius = ${bestParams.gkSaveRadius.toFixed(1)}m`);
console.log(`  gkSaveBase = ${bestParams.gkSaveBase.toFixed(2)}`);
console.log(`  gkAngleBonus = ${bestParams.gkAngleBonus.toFixed(2)}`);
console.log(`  totalError = ${bestError.toFixed(6)}`);

console.log(`\n最適パラメータでのゴール率:`);
for (const [distStr, target] of Object.entries(TARGETS)) {
  const dist = parseFloat(distStr);
  const pSAScale = Math.pow(dist / 12.0, bestParams.alpha);
  const pSA = BASE_PSA * pSAScale;
  const rate = calcGoalRate(dist, pSAScale, bestParams.gkSaveRadius, bestParams.gkSaveBase, bestParams.gkAngleBonus, 100000);
  console.log(`  ${dist}m: 目標=${(target*100).toFixed(0)}%, 実際=${(rate*100).toFixed(1)}%, pSA=±${pSA.toFixed(2)}m`);
}

// 追加：いくつかの候補パラメータでテスト
console.log("\n=== 候補パラメータのテスト ===\n");

const candidates = [
  { alpha: 2.0, gkSaveRadius: 1.5, gkSaveBase: 0.30, gkAngleBonus: 0.10, label: "alpha=2.0, R=1.5, base=0.30" },
  { alpha: 2.5, gkSaveRadius: 1.5, gkSaveBase: 0.30, gkAngleBonus: 0.10, label: "alpha=2.5, R=1.5, base=0.30" },
  { alpha: 3.0, gkSaveRadius: 1.5, gkSaveBase: 0.30, gkAngleBonus: 0.10, label: "alpha=3.0, R=1.5, base=0.30" },
  { alpha: 2.0, gkSaveRadius: 1.2, gkSaveBase: 0.25, gkAngleBonus: 0.10, label: "alpha=2.0, R=1.2, base=0.25" },
  { alpha: 2.5, gkSaveRadius: 1.2, gkSaveBase: 0.25, gkAngleBonus: 0.10, label: "alpha=2.5, R=1.2, base=0.25" },
  { alpha: 3.0, gkSaveRadius: 1.2, gkSaveBase: 0.25, gkAngleBonus: 0.10, label: "alpha=3.0, R=1.2, base=0.25" },
  { alpha: 2.0, gkSaveRadius: 1.0, gkSaveBase: 0.20, gkAngleBonus: 0.10, label: "alpha=2.0, R=1.0, base=0.20" },
  { alpha: 2.5, gkSaveRadius: 1.0, gkSaveBase: 0.20, gkAngleBonus: 0.10, label: "alpha=2.5, R=1.0, base=0.20" },
  { alpha: 3.0, gkSaveRadius: 1.0, gkSaveBase: 0.20, gkAngleBonus: 0.10, label: "alpha=3.0, R=1.0, base=0.20" },
];

for (const c of candidates) {
  console.log(`\n【${c.label}】`);
  for (const [distStr, target] of Object.entries(TARGETS)) {
    const dist = parseFloat(distStr);
    const pSAScale = Math.pow(dist / 12.0, c.alpha);
    const pSA = BASE_PSA * pSAScale;
    const rate = calcGoalRate(dist, pSAScale, c.gkSaveRadius, c.gkSaveBase, c.gkAngleBonus, 100000);
    const diff = rate - target;
    const mark = Math.abs(diff) < 0.05 ? "✓" : (diff > 0 ? "↑" : "↓");
    console.log(`  ${dist}m: 目標=${(target*100).toFixed(0)}%, 実際=${(rate*100).toFixed(1)}% ${mark}, pSA=±${pSA.toFixed(2)}m`);
  }
}
