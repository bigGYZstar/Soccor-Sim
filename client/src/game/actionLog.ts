// ★ v9.9.0: Action Log System - SFC-style real-time commentary
import type { State, ActionLogEntry, Player } from "./types";

const MAX_LOG_ENTRIES = 12;
const DEFAULT_TTL = 4.0; // seconds

function teamName(team: number): string {
  return team === -1 ? "BLUE" : "RED";
}

function roleName(role: string): string {
  switch (role) {
    case "GK": return "GK";
    case "DEF": return "DF";
    case "MID": return "MF";
    case "FWD": return "FW";
    default: return role;
  }
}

// ★ v9.11.0: Use detailed position label for display
function posName(p: Player): string {
  return p.posLabel || roleName(p.role);
}

function playerLabel(p: Player): string {
  return `#${p.num}(${posName(p)})`;
}

export function emitLog(st: State, entry: Omit<ActionLogEntry, "ttl">) {
  const logEntry: ActionLogEntry = {
    ...entry,
    ttl: entry.excitement >= 2 ? 6.0 : entry.excitement >= 1 ? 5.0 : DEFAULT_TTL,
  };
  st.actionLog.push(logEntry);
  // Keep only the most recent entries
  if (st.actionLog.length > MAX_LOG_ENTRIES) {
    st.actionLog = st.actionLog.slice(-MAX_LOG_ENTRIES);
  }
}

export function updateLogTTL(st: State, dt: number) {
  for (let i = st.actionLog.length - 1; i >= 0; i--) {
    st.actionLog[i].ttl -= dt;
    if (st.actionLog[i].ttl <= 0) {
      st.actionLog.splice(i, 1);
    }
  }
}

// --- Commentary generators ---

export function logPass(st: State, passer: Player, targetNum: number, dist: number, isLong: boolean) {
  const distLabel = dist < 8 ? "ショート" : dist < 18 ? "ミドル" : "ロング";
  const typeLabel = isLong ? "ロングパス" : "パス";
  
  const texts = [
    `${playerLabel(passer)} ${distLabel}${typeLabel}！ → #${targetNum}へ`,
    `${playerLabel(passer)} ボールを展開！ #${targetNum}へ${typeLabel}`,
    `${playerLabel(passer)}(${roleName(passer.role)}) ${typeLabel}を選択 → #${targetNum}`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: passer.team,
    playerNum: passer.num,
    playerRole: passer.posLabel || passer.role,
    action: isLong ? "longPass" : "pass",
    detail: texts[Math.floor(Math.random() * texts.length)],
    targetNum,
    success: true,
    excitement: isLong ? 1 : 0,
  });
}

export function logPassReceive(st: State, receiver: Player, passerNum: number) {
  emitLog(st, {
    time: st.time,
    team: receiver.team,
    playerNum: receiver.num,
    playerRole: receiver.posLabel || receiver.role,
    action: "passReceive",
    detail: `${playerLabel(receiver)} パスを受ける`,
    success: true,
    excitement: 0,
  });
}

export function logShot(st: State, shooter: Player, dist: number) {
  const distLabel = dist < 12 ? "至近距離" : dist < 20 ? "ミドル" : "ロング";
  const texts = [
    `${playerLabel(shooter)} ${distLabel}シュート！！`,
    `${playerLabel(shooter)} 打った！！ ${distLabel}からのシュート！`,
    `${playerLabel(shooter)}(${roleName(shooter.role)}) シュートを放つ！！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: shooter.team,
    playerNum: shooter.num,
    playerRole: shooter.posLabel || shooter.role,
    action: "shot",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 2,
  });
}

export function logDribbleAttempt(st: State, dribbler: Player) {
  const texts = [
    `${playerLabel(dribbler)} ドリブル突破を試みる！`,
    `${playerLabel(dribbler)} 仕掛けた！ ドリブルで突破を狙う！`,
    `${playerLabel(dribbler)}(${roleName(dribbler.role)}) 勝負に出る！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: dribbler.team,
    playerNum: dribbler.num,
    playerRole: dribbler.posLabel || dribbler.role,
    action: "dribble",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 2,
  });
}

export function logDribbleSuccess(st: State, dribbler: Player) {
  const texts = [
    `${playerLabel(dribbler)} 突破成功！！ 見事なドリブル！`,
    `${playerLabel(dribbler)} 相手をかわした！ ドリブル突破！`,
    `${playerLabel(dribbler)} 華麗なドリブルで抜き去る！！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: dribbler.team,
    playerNum: dribbler.num,
    playerRole: dribbler.posLabel || dribbler.role,
    action: "dribbleSuccess",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 3,
  });
}

export function logDribbleFail(st: State, dribbler: Player, tacklerNum: number) {
  const texts = [
    `${playerLabel(dribbler)} ボールを失う！ #${tacklerNum}のタックル！`,
    `${playerLabel(dribbler)} 突破失敗… #${tacklerNum}に止められた`,
    `#${tacklerNum}が${playerLabel(dribbler)}のドリブルを阻止！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: dribbler.team,
    playerNum: dribbler.num,
    playerRole: dribbler.posLabel || dribbler.role,
    action: "dribbleFail",
    detail: texts[Math.floor(Math.random() * texts.length)],
    targetNum: tacklerNum,
    success: false,
    excitement: 1,
  });
}

export function logTackle(st: State, tackler: Player, targetNum: number, success: boolean) {
  if (success) {
    const texts = [
      `${playerLabel(tackler)} ナイスタックル！ ボール奪取！`,
      `${playerLabel(tackler)}(${roleName(tackler.role)}) 見事なタックルでボールを奪う！`,
      `${playerLabel(tackler)} タックル成功！ #${targetNum}からボールを奪った！`,
    ];
    emitLog(st, {
      time: st.time,
      team: tackler.team,
      playerNum: tackler.num,
      playerRole: tackler.posLabel || tackler.role,
      action: "tackle",
      detail: texts[Math.floor(Math.random() * texts.length)],
      targetNum,
      success: true,
      excitement: 2,
    });
  }
}

export function logIntercept(st: State, interceptor: Player) {
  const texts = [
    `${playerLabel(interceptor)} インターセプト！`,
    `${playerLabel(interceptor)}(${roleName(interceptor.role)}) パスカット！`,
    `${playerLabel(interceptor)} 読みが冴える！ パスをカット！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: interceptor.team,
    playerNum: interceptor.num,
    playerRole: interceptor.posLabel || interceptor.role,
    action: "intercept",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 1,
  });
}

export function logGoal(st: State, scorer: Player) {
  const texts = [
    `⚽ GOAL！！ ${playerLabel(scorer)} ゴーーール！！！`,
    `⚽ ${playerLabel(scorer)} 決めた！！ ゴーーール！！！`,
    `⚽ ゴール！！ ${playerLabel(scorer)}(${roleName(scorer.role)})！！！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: scorer.team,
    playerNum: scorer.num,
    playerRole: scorer.posLabel || scorer.role,
    action: "goal",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 3,
  });
}

export function logSave(st: State, keeper: Player) {
  const texts = [
    `${playerLabel(keeper)} ナイスセーブ！！`,
    `${playerLabel(keeper)} 好セーブ！ シュートを止めた！`,
    `GK${playerLabel(keeper)} ファインセーブ！！`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: keeper.team,
    playerNum: keeper.num,
    playerRole: keeper.posLabel || keeper.role,
    action: "save",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 2,
  });
}

export function logTurnover(st: State, player: Player) {
  const texts = [
    `${playerLabel(player)} ボールロスト！`,
    `${playerLabel(player)} ボールを失った…`,
  ];
  
  emitLog(st, {
    time: st.time,
    team: player.team,
    playerNum: player.num,
    playerRole: player.posLabel || player.role,
    action: "turnover",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: false,
    excitement: 0,
  });
}
