// ★ v9.9.0: Action Log System - SFC-style real-time commentary
// ★ v9.15.0: Position labels show sub-position only (RM, RWG, LST etc.)
import type { State, ActionLogEntry, Player } from "./types";

const MAX_LOG_ENTRIES = 12;
const DEFAULT_TTL = 4.0; // seconds

function teamName(team: number): string {
  return team === -1 ? "BLUE" : "RED";
}

// ★ v10.3.0: Helper to record on-ball heatmap event
// ★ v10.6.0: Side normalization - flip coordinates in 2nd half
// ★ v10.9.0: Added toX/toY/success for pass/shot trajectory lines
function recordOnBall(
  st: State,
  player: Player,
  type: 'pass' | 'shot' | 'dribble' | 'receive' | 'tackle' | 'intercept' | 'save',
  opts?: { toX?: number; toY?: number; success?: boolean }
) {
  const hm = st.heatmaps[player.idx];
  if (!hm) return;
  const PH = 34;  // pitchHalfH
  const PW = 52.5;  // pitchHalfW
  let nx = (player.pos.x + PW) / (PW * 2);
  let ny = (player.pos.y + PH) / (PH * 2);
  // ★ v10.6.0: Flip coordinates in 2nd half to normalize sides
  if (st.half === 2) {
    nx = 1 - nx;
    ny = 1 - ny;
  }
  const entry: { x: number; y: number; type: typeof type; toX?: number; toY?: number; success?: boolean } = {
    x: Math.max(0, Math.min(1, nx)),
    y: Math.max(0, Math.min(1, ny)),
    type,
  };
  if (opts?.toX !== undefined) {
    // Also normalize toX/toY with same side normalization
    let toNx = opts.toX;
    let toNy = opts.toY ?? 0.5;
    if (st.half === 2) { toNx = 1 - toNx; toNy = 1 - toNy; }
    entry.toX = Math.max(0, Math.min(1, toNx));
    entry.toY = Math.max(0, Math.min(1, toNy));
  }
  if (opts?.success !== undefined) entry.success = opts.success;
  hm.onBall.push(entry);
  // Limit to 500 on-ball events per player
  if (hm.onBall.length > 500) hm.onBall.shift();
}

// ★ v9.15.0: Use posLabel (sub-position) directly for display
// e.g., RM, LM, RWG, LWG, LST, RST, LCM, RCM, LCB, RCB, CDM, CAM, GK
// Falls back to abbreviated role only if posLabel is not set
function posName(p: Player): string {
  if (p.posLabel) return p.posLabel;
  switch (p.role) {
    case "GK": return "GK";
    case "DEF": return "DF";
    case "MID": return "MF";
    case "FWD": return "FW";
    default: return p.role;
  }
}

function playerLabel(p: Player): string {
  // ★ v10.2.0: Show player name when available from gacha card
  if (p.cardName) {
    return `${p.cardName}(${posName(p)})`;
  }
  return `#${p.num}(${posName(p)})`;
}

// ★ v10.2.0: Short label for target references (just name or number)
function playerRef(p: Player): string {
  return p.cardName || `#${p.num}`;
}

export function emitLog(st: State, entry: Omit<ActionLogEntry, "ttl">) {
  const logEntry: ActionLogEntry = {
    ...entry,
    time: st.matchClock || entry.time,  // ★ v9.22.0: Use match clock for display
    ttl: entry.excitement >= 2 ? 6.0 : entry.excitement >= 1 ? 5.0 : DEFAULT_TTL,
  };
  st.actionLog.push(logEntry);
  // Keep only the most recent entries (for UI display)
  if (st.actionLog.length > MAX_LOG_ENTRIES) {
    st.actionLog = st.actionLog.slice(-MAX_LOG_ENTRIES);
  }
  // ★ v10.3.0: Also push to fullLog (unlimited, for headless mode analysis)
  st.fullLog.push(logEntry);
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

export function logPass(st: State, passer: Player, targetNum: number, dist: number, isLong: boolean, usedFoot?: "L" | "R", targetPos?: { x: number; y: number }) {
  const PH = 34; const PW = 52.5;
  const toX = targetPos ? (targetPos.x + PW) / (PW * 2) : undefined;
  const toY = targetPos ? (targetPos.y + PH) / (PH * 2) : undefined;
  recordOnBall(st, passer, 'pass', { toX, toY, success: true });
  const distLabel = dist < 8 ? "ショート" : dist < 18 ? "ミドル" : "ロング";
  const typeLabel = isLong ? "ロングパス" : "パス";
  const footLabel = usedFoot ? (usedFoot === "R" ? "右足" : "左足") : "";
  // ★ v10.2.0: Find target player to show name
  const targetPlayer = st.pl.find(p => p.num === targetNum && p.team === passer.team);
  const targetRef = targetPlayer ? playerRef(targetPlayer) : `#${targetNum}`;

  const texts = [
    `${playerLabel(passer)} ${footLabel}${distLabel}${typeLabel}！ → ${targetRef}へ`,
    `${playerLabel(passer)} ${footLabel}でボールを展開！ ${targetRef}へ${typeLabel}`,
    `${playerLabel(passer)} ${typeLabel}を選択 → ${targetRef} ${footLabel ? `(${footLabel})` : ""}`,
  ];

  emitLog(st, {
    time: st.time,
    team: passer.team,
    playerNum: passer.num,
    playerRole: posName(passer),
    action: isLong ? "longPass" : "pass",
    detail: texts[Math.floor(Math.random() * texts.length)],
    targetNum,
    success: true,
    excitement: isLong ? 1 : 0,
  });
}

export function logPassReceive(st: State, receiver: Player, passerNum: number) {
  recordOnBall(st, receiver, 'receive');
  emitLog(st, {
    time: st.time,
    team: receiver.team,
    playerNum: receiver.num,
    playerRole: posName(receiver),
    action: "passReceive",
    detail: `${playerLabel(receiver)} パスを受ける`,
    success: true,
    excitement: 0,
  });
}

export function logShot(st: State, shooter: Player, dist: number, goalPos?: { x: number; y: number }) {
  const PH = 34; const PW = 52.5;
  // Shot target: toward opponent goal (x = -team * PW)
  const goalX = goalPos ? goalPos.x : -shooter.team * PW;
  const goalY = goalPos ? goalPos.y : 0;
  const toX = (goalX + PW) / (PW * 2);
  const toY = (goalY + PH) / (PH * 2);
  recordOnBall(st, shooter, 'shot', { toX, toY, success: true });
  const distLabel = dist < 12 ? "至近距離" : dist < 20 ? "ミドル" : "ロング";
  const texts = [
    `${playerLabel(shooter)} ${distLabel}シュート！！`,
    `${playerLabel(shooter)} 打った！！ ${distLabel}からのシュート！`,
    `${playerLabel(shooter)} シュートを放つ！！`,
  ];

  emitLog(st, {
    time: st.time,
    team: shooter.team,
    playerNum: shooter.num,
    playerRole: posName(shooter),
    action: "shot",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 2,
  });
}

export function logDribbleAttempt(st: State, dribbler: Player) {
  recordOnBall(st, dribbler, 'dribble');
  const texts = [
    `${playerLabel(dribbler)} ドリブル突破を試みる！`,
    `${playerLabel(dribbler)} 仕掛けた！ ドリブルで突破を狙う！`,
    `${playerLabel(dribbler)} 勝負に出る！`,
  ];

  emitLog(st, {
    time: st.time,
    team: dribbler.team,
    playerNum: dribbler.num,
    playerRole: posName(dribbler),
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
    playerRole: posName(dribbler),
    action: "dribbleSuccess",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 3,
  });
}

export function logDribbleFail(st: State, dribbler: Player, tacklerNum: number) {
  const tackler = st.pl.find(p => p.num === tacklerNum && p.team !== dribbler.team);
  const tacklerRef = tackler ? playerRef(tackler) : `#${tacklerNum}`;
  const texts = [
    `${playerLabel(dribbler)} ボールを失う！ ${tacklerRef}のタックル！`,
    `${playerLabel(dribbler)} 突破失敗… ${tacklerRef}に止められた`,
    `${tacklerRef}が${playerLabel(dribbler)}のドリブルを阻止！`,
  ];

  emitLog(st, {
    time: st.time,
    team: dribbler.team,
    playerNum: dribbler.num,
    playerRole: posName(dribbler),
    action: "dribbleFail",
    detail: texts[Math.floor(Math.random() * texts.length)],
    targetNum: tacklerNum,
    success: false,
    excitement: 1,
  });
}

export function logTackle(st: State, tackler: Player, targetNum: number, success: boolean) {
  if (success) recordOnBall(st, tackler, 'tackle');
  if (success) {
    const targetPlayer = st.pl.find(p => p.num === targetNum && p.team !== tackler.team);
    const targetRef = targetPlayer ? playerRef(targetPlayer) : `#${targetNum}`;
    const texts = [
      `${playerLabel(tackler)} ナイスタックル！ ボール奪取！`,
      `${playerLabel(tackler)} 見事なタックルでボールを奪う！`,
      `${playerLabel(tackler)} タックル成功！ ${targetRef}からボールを奪った！`,
    ];
    emitLog(st, {
      time: st.time,
      team: tackler.team,
      playerNum: tackler.num,
      playerRole: posName(tackler),
      action: "tackle",
      detail: texts[Math.floor(Math.random() * texts.length)],
      targetNum,
      success: true,
      excitement: 2,
    });
  }
}

export function logIntercept(st: State, interceptor: Player) {
  recordOnBall(st, interceptor, 'intercept');
  const texts = [
    `${playerLabel(interceptor)} インターセプト！`,
    `${playerLabel(interceptor)} パスカット！`,
    `${playerLabel(interceptor)} 読みが冴える！ パスをカット！`,
  ];

  emitLog(st, {
    time: st.time,
    team: interceptor.team,
    playerNum: interceptor.num,
    playerRole: posName(interceptor),
    action: "intercept",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 1,
  });
}

export function logGoal(st: State, scorer: Player) {
  recordOnBall(st, scorer, 'shot');
  const texts = [
    `⚽ GOAL！！ ${playerLabel(scorer)} ゴーーール！！！`,
    `⚽ ${playerLabel(scorer)} 決めた！！ ゴーーール！！！`,
    `⚽ ゴール！！ ${playerLabel(scorer)}！！！`,
  ];

  emitLog(st, {
    time: st.time,
    team: scorer.team,
    playerNum: scorer.num,
    playerRole: posName(scorer),
    action: "goal",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: true,
    excitement: 3,
  });
}

export function logSave(st: State, keeper: Player) {
  recordOnBall(st, keeper, 'save');
  const texts = [
    `${playerLabel(keeper)} ナイスセーブ！！`,
    `${playerLabel(keeper)} 好セーブ！ シュートを止めた！`,
    `GK${playerLabel(keeper)} ファインセーブ！！`,
  ];

  emitLog(st, {
    time: st.time,
    team: keeper.team,
    playerNum: keeper.num,
    playerRole: posName(keeper),
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
    playerRole: posName(player),
    action: "turnover",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: false,
    excitement: 0,
  });
}

// ★ v9.15.0: Log trap failure (ball bounced away on reception)
export function logTrapFail(st: State, player: Player, receiveFoot: "L" | "R") {
  const footLabel = receiveFoot === "R" ? "右足" : "左足";
  const texts = [
    `${playerLabel(player)} ${footLabel}トラップミス！ ボールがこぼれる`,
    `${playerLabel(player)} ${footLabel}でのコントロールが乱れる！`,
    `${playerLabel(player)} トラップが大きくなる！`,
  ];

  emitLog(st, {
    time: st.time,
    team: player.team,
    playerNum: player.num,
    playerRole: posName(player),
    action: "passReceive",
    detail: texts[Math.floor(Math.random() * texts.length)],
    success: false,
    excitement: 0,
  });
}
