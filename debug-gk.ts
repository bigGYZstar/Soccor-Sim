/**
 * debug-gk.ts
 * GKのcardMods.gkSaveBaseとsaveChanceを確認
 */

import { mkState } from './client/src/game/engine';

const st = mkState();
const RED_GK_IDX = 11;
const gk = st.pl[RED_GK_IDX];

console.log("=== GK情報 ===");
console.log(`GK idx: ${gk.idx}`);
console.log(`GK team: ${gk.team}`);
console.log(`GK isGK: ${gk.isGK}`);
console.log(`GK cardMods: ${JSON.stringify(gk.cardMods, null, 2)}`);

// PExtのgkSaveBase
const PExt = {
  gkSaveBase: 0.30,
  gkSaveAngleBonus: 0.15,
};

const gkSaveMod = gk.cardMods?.gkSaveBase ?? 1.0;
const angleBonus = 0; // 正面からのシュート
const saveChance = PExt.gkSaveBase * gkSaveMod + angleBonus;

console.log(`\ngkSaveMod: ${gkSaveMod}`);
console.log(`saveChance = ${PExt.gkSaveBase} * ${gkSaveMod} + ${angleBonus} = ${saveChance}`);
