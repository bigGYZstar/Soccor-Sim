// ★ v10.2.0: Match Result Screen - MVP, Stats, Coin Reward
import { useState, useEffect, useMemo } from 'react';
import type { State, Player } from '../game/types';

const RETRO_FONT = "'Press Start 2P', monospace";
const RETRO_BG = "#1a1a2e";
const RETRO_ACCENT = "#e94560";
const RETRO_GOLD = "#f5c542";
const RETRO_GREEN = "#16c47f";
const RETRO_WHITE = "#eaeaea";
const RETRO_DARK = "#0f0f23";

interface MatchResultProps {
  state: State;
  onClose: () => void;
  onCoinsEarned?: (coins: number) => void;
}

// Calculate MVP score for a player
function calcMVPScore(ps: { goals: number; assists: number; shots: number; shotsOnTarget: number; passes: number; passSuccess: number; dribbles: number; dribbleSuccess: number; tackles: number; tackleSuccess: number; interceptions: number; saves: number; }) {
  return (
    ps.goals * 10 +
    ps.assists * 7 +
    ps.shotsOnTarget * 2 +
    ps.passSuccess * 0.5 +
    ps.dribbleSuccess * 3 +
    ps.tackleSuccess * 2 +
    ps.interceptions * 3 +
    ps.saves * 5
  );
}

export default function MatchResultScreen({ state, onClose, onCoinsEarned }: MatchResultProps) {
  const [phase, setPhase] = useState<"score" | "mvp" | "stats" | "coins">("score");
  const [animProgress, setAnimProgress] = useState(0);
  const [coinsAwarded, setCoinsAwarded] = useState(false);

  const st = state;
  const blueWin = st.scoreBlue > st.scoreRed;
  const redWin = st.scoreRed > st.scoreBlue;
  const isDraw = st.scoreBlue === st.scoreRed;

  // Calculate MVP
  const mvp = useMemo(() => {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < st.stats.playerStats.length; i++) {
      const ps = st.stats.playerStats[i];
      const score = calcMVPScore(ps);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return { player: st.pl[bestIdx], stats: st.stats.playerStats[bestIdx], score: bestScore };
  }, [st]);

  // Calculate team stats
  const teamStats = useMemo(() => {
    const totalPoss = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
    const bluePoss = totalPoss > 0 ? Math.round((st.stats.possessionFrames.blue / totalPoss) * 100) : 50;
    const redPoss = 100 - bluePoss;
    const bluePassRate = st.stats.passAttempts.blue > 0 ? Math.round((st.stats.passSuccess.blue / st.stats.passAttempts.blue) * 100) : 0;
    const redPassRate = st.stats.passAttempts.red > 0 ? Math.round((st.stats.passSuccess.red / st.stats.passAttempts.red) * 100) : 0;
    return { bluePoss, redPoss, bluePassRate, redPassRate };
  }, [st]);

  // Calculate coins earned
  const coinsEarned = useMemo(() => {
    let coins = 50; // Base reward for playing
    if (blueWin) coins += 100; // Win bonus
    else if (isDraw) coins += 30; // Draw bonus
    // Bonus for goals
    coins += st.scoreBlue * 20;
    return coins;
  }, [blueWin, isDraw, st.scoreBlue]);

  // Animation timer
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimProgress(prev => {
        if (prev >= 1) {
          clearInterval(timer);
          return 1;
        }
        return prev + 0.02;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [phase]);

  // Auto-advance phases
  useEffect(() => {
    if (phase === "score" && animProgress >= 1) {
      const t = setTimeout(() => { setPhase("mvp"); setAnimProgress(0); }, 1500);
      return () => clearTimeout(t);
    }
    if (phase === "mvp" && animProgress >= 1) {
      const t = setTimeout(() => { setPhase("stats"); setAnimProgress(0); }, 2000);
      return () => clearTimeout(t);
    }
    if (phase === "stats" && animProgress >= 1) {
      const t = setTimeout(() => { setPhase("coins"); setAnimProgress(0); }, 2000);
      return () => clearTimeout(t);
    }
    if (phase === "coins" && animProgress >= 1 && !coinsAwarded) {
      setCoinsAwarded(true);
      onCoinsEarned?.(coinsEarned);
    }
  }, [phase, animProgress, coinsAwarded, coinsEarned, onCoinsEarned]);

  const playerName = (p: Player) => p.cardName || `#${p.num}`;
  const teamLabel = (team: number) => team === -1 ? "BLUE" : "RED";
  const teamColor = (team: number) => team === -1 ? "#60a5fa" : "#f87171";

  // Get top scorers
  const topScorers = useMemo(() => {
    return [...st.stats.playerStats]
      .filter(ps => ps.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 5)
      .map(ps => ({ player: st.pl[ps.playerIdx], stats: ps }));
  }, [st]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "rgba(0,0,0,0.92)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: RETRO_FONT,
      color: RETRO_WHITE,
      overflow: "auto",
      padding: "16px",
    }}>
      {/* Title */}
      <div style={{
        fontSize: "clamp(14px, 3vw, 28px)",
        color: RETRO_GOLD,
        marginBottom: "clamp(8px, 2vh, 20px)",
        textShadow: "0 0 10px rgba(245,197,66,0.5)",
        letterSpacing: "3px",
      }}>
        FULL TIME
      </div>

      {/* Score */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(12px, 3vw, 32px)",
        marginBottom: "clamp(12px, 2vh, 24px)",
        opacity: phase === "score" ? Math.min(animProgress * 3, 1) : 1,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "clamp(8px, 1.5vw, 14px)", color: "#60a5fa", marginBottom: 4 }}>BLUE</div>
          <div style={{ fontSize: "clamp(24px, 5vw, 56px)", color: blueWin ? RETRO_GOLD : RETRO_WHITE, fontWeight: "bold" }}>
            {st.scoreBlue}
          </div>
        </div>
        <div style={{ fontSize: "clamp(12px, 2vw, 20px)", color: "#666" }}>-</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "clamp(8px, 1.5vw, 14px)", color: "#f87171", marginBottom: 4 }}>RED</div>
          <div style={{ fontSize: "clamp(24px, 5vw, 56px)", color: redWin ? RETRO_GOLD : RETRO_WHITE, fontWeight: "bold" }}>
            {st.scoreRed}
          </div>
        </div>
      </div>

      {/* Result label */}
      <div style={{
        fontSize: "clamp(10px, 2vw, 18px)",
        color: blueWin ? RETRO_GREEN : redWin ? RETRO_ACCENT : RETRO_GOLD,
        marginBottom: "clamp(12px, 2vh, 20px)",
        opacity: phase === "score" ? Math.min(Math.max(animProgress - 0.3, 0) * 3, 1) : 1,
      }}>
        {blueWin ? "BLUE WINS!" : redWin ? "RED WINS!" : "DRAW"}
      </div>

      {/* Content area */}
      <div style={{
        width: "100%",
        maxWidth: 500,
        background: RETRO_DARK,
        border: `2px solid ${RETRO_GOLD}`,
        borderRadius: 4,
        padding: "clamp(8px, 2vw, 16px)",
        maxHeight: "50vh",
        overflowY: "auto",
      }}>
        {/* MVP Section */}
        {(phase === "mvp" || phase === "stats" || phase === "coins") && (
          <div style={{
            marginBottom: "clamp(8px, 1.5vh, 16px)",
            opacity: phase === "mvp" ? Math.min(animProgress * 2, 1) : 1,
          }}>
            <div style={{
              fontSize: "clamp(8px, 1.5vw, 12px)",
              color: RETRO_GOLD,
              marginBottom: 8,
              textAlign: "center",
              letterSpacing: "2px",
            }}>
              ★ MAN OF THE MATCH ★
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "clamp(8px, 2vw, 16px)",
              padding: "8px",
              background: "rgba(245,197,66,0.1)",
              border: `1px solid ${RETRO_GOLD}`,
              borderRadius: 4,
            }}>
              {/* Player circle */}
              <div style={{
                width: "clamp(36px, 8vw, 56px)",
                height: "clamp(36px, 8vw, 56px)",
                borderRadius: "50%",
                background: teamColor(mvp.player.team),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "clamp(10px, 2vw, 18px)",
                fontWeight: "bold",
                color: "#fff",
                border: `2px solid ${RETRO_GOLD}`,
                flexShrink: 0,
              }}>
                {mvp.player.num}
              </div>
              <div>
                <div style={{ fontSize: "clamp(8px, 1.5vw, 14px)", color: RETRO_WHITE, marginBottom: 2 }}>
                  {playerName(mvp.player)}
                </div>
                <div style={{ fontSize: "clamp(6px, 1vw, 10px)", color: teamColor(mvp.player.team) }}>
                  {teamLabel(mvp.player.team)} / {mvp.player.posLabel}
                </div>
                <div style={{ fontSize: "clamp(5px, 0.9vw, 8px)", color: "#999", marginTop: 4 }}>
                  {mvp.stats.goals > 0 && `⚽${mvp.stats.goals} `}
                  {mvp.stats.assists > 0 && `🅰️${mvp.stats.assists} `}
                  {mvp.stats.saves > 0 && `🧤${mvp.stats.saves} `}
                  {mvp.stats.interceptions > 0 && `🛡${mvp.stats.interceptions} `}
                  {mvp.stats.passSuccess > 0 && `📨${mvp.stats.passSuccess} `}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Goal Scorers */}
        {(phase === "stats" || phase === "coins") && topScorers.length > 0 && (
          <div style={{
            marginBottom: "clamp(8px, 1.5vh, 16px)",
            opacity: phase === "stats" ? Math.min(animProgress * 2, 1) : 1,
          }}>
            <div style={{ fontSize: "clamp(6px, 1.2vw, 10px)", color: RETRO_GOLD, marginBottom: 6, letterSpacing: "1px" }}>
              GOAL SCORERS
            </div>
            {topScorers.map((gs, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 6px",
                fontSize: "clamp(5px, 1vw, 9px)",
                borderBottom: "1px solid #333",
              }}>
                <span style={{ color: teamColor(gs.player.team) }}>
                  {playerName(gs.player)} ({gs.player.posLabel})
                </span>
                <span style={{ color: RETRO_WHITE }}>
                  ⚽{gs.stats.goals} {gs.stats.assists > 0 ? `🅰️${gs.stats.assists}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Team Stats */}
        {(phase === "stats" || phase === "coins") && (
          <div style={{
            opacity: phase === "stats" ? Math.min(Math.max(animProgress - 0.3, 0) * 3, 1) : 1,
          }}>
            <div style={{ fontSize: "clamp(6px, 1.2vw, 10px)", color: RETRO_GOLD, marginBottom: 6, letterSpacing: "1px" }}>
              MATCH STATS
            </div>
            <StatBar label="ポゼッション" blueVal={`${teamStats.bluePoss}%`} redVal={`${teamStats.redPoss}%`} blueRatio={teamStats.bluePoss / 100} />
            <StatBar label="シュート" blueVal={`${st.stats.shotsTotal.blue}`} redVal={`${st.stats.shotsTotal.red}`} blueRatio={st.stats.shotsTotal.blue / Math.max(1, st.stats.shotsTotal.blue + st.stats.shotsTotal.red)} />
            <StatBar label="枠内シュート" blueVal={`${st.stats.shotsOnTarget.blue}`} redVal={`${st.stats.shotsOnTarget.red}`} blueRatio={st.stats.shotsOnTarget.blue / Math.max(1, st.stats.shotsOnTarget.blue + st.stats.shotsOnTarget.red)} />
            <StatBar label="パス成功率" blueVal={`${teamStats.bluePassRate}%`} redVal={`${teamStats.redPassRate}%`} blueRatio={teamStats.bluePassRate / 100} />
            <StatBar label="パス本数" blueVal={`${st.stats.passSuccess.blue}`} redVal={`${st.stats.passSuccess.red}`} blueRatio={st.stats.passSuccess.blue / Math.max(1, st.stats.passSuccess.blue + st.stats.passSuccess.red)} />
            <StatBar label="ドリブル成功" blueVal={`${st.stats.dribbleSuccess.blue}`} redVal={`${st.stats.dribbleSuccess.red}`} blueRatio={st.stats.dribbleSuccess.blue / Math.max(1, st.stats.dribbleSuccess.blue + st.stats.dribbleSuccess.red)} />
            <StatBar label="インターセプト" blueVal={`${st.stats.interceptions.blue}`} redVal={`${st.stats.interceptions.red}`} blueRatio={st.stats.interceptions.blue / Math.max(1, st.stats.interceptions.blue + st.stats.interceptions.red)} />
            <StatBar label="GKセーブ" blueVal={`${st.stats.gkSaves.blue}`} redVal={`${st.stats.gkSaves.red}`} blueRatio={st.stats.gkSaves.blue / Math.max(1, st.stats.gkSaves.blue + st.stats.gkSaves.red)} />
            <StatBar label="コーナーキック" blueVal={`${st.stats.corners}`} redVal="-" blueRatio={0.5} />
          </div>
        )}

        {/* Coins Section */}
        {phase === "coins" && (
          <div style={{
            marginTop: "clamp(8px, 1.5vh, 16px)",
            textAlign: "center",
            opacity: Math.min(animProgress * 2, 1),
          }}>
            <div style={{
              fontSize: "clamp(6px, 1.2vw, 10px)",
              color: RETRO_GOLD,
              marginBottom: 8,
              letterSpacing: "1px",
            }}>
              REWARD
            </div>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "rgba(245,197,66,0.15)",
              border: `2px solid ${RETRO_GOLD}`,
              borderRadius: 4,
            }}>
              <span style={{ fontSize: "clamp(16px, 3vw, 28px)" }}>🪙</span>
              <span style={{
                fontSize: "clamp(12px, 2.5vw, 24px)",
                color: RETRO_GOLD,
                fontWeight: "bold",
              }}>
                +{Math.round(coinsEarned * Math.min(animProgress * 2, 1))}
              </span>
            </div>
            <div style={{ fontSize: "clamp(5px, 0.9vw, 8px)", color: "#999", marginTop: 6 }}>
              {blueWin ? "勝利ボーナス +100" : isDraw ? "引き分けボーナス +30" : "参加報酬 +50"}
              {st.scoreBlue > 0 && ` / ゴールボーナス +${st.scoreBlue * 20}`}
            </div>
          </div>
        )}
      </div>

      {/* Close button */}
      {phase === "coins" && animProgress >= 0.5 && (
        <button
          onClick={onClose}
          style={{
            marginTop: "clamp(12px, 2vh, 24px)",
            background: RETRO_GOLD,
            color: RETRO_DARK,
            border: "none",
            fontFamily: RETRO_FONT,
            fontSize: "clamp(8px, 1.5vw, 14px)",
            padding: "clamp(6px, 1vh, 12px) clamp(16px, 4vw, 32px)",
            cursor: "pointer",
            letterSpacing: "2px",
            transition: "transform 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          OK
        </button>
      )}

      {/* Skip button */}
      {phase !== "coins" && (
        <button
          onClick={() => { setPhase("coins"); setAnimProgress(0); }}
          style={{
            marginTop: "clamp(8px, 1.5vh, 16px)",
            background: "transparent",
            color: "#666",
            border: "1px solid #444",
            fontFamily: RETRO_FONT,
            fontSize: "clamp(6px, 1vw, 10px)",
            padding: "4px 12px",
            cursor: "pointer",
          }}
        >
          SKIP ▶
        </button>
      )}
    </div>
  );
}

// Stat bar component
function StatBar({ label, blueVal, redVal, blueRatio }: { label: string; blueVal: string; redVal: string; blueRatio: number }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "clamp(5px, 0.9vw, 8px)",
        marginBottom: 2,
      }}>
        <span style={{ color: "#60a5fa" }}>{blueVal}</span>
        <span style={{ color: "#999" }}>{label}</span>
        <span style={{ color: "#f87171" }}>{redVal}</span>
      </div>
      <div style={{
        display: "flex",
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        background: "#333",
      }}>
        <div style={{
          width: `${blueRatio * 100}%`,
          background: "#60a5fa",
          transition: "width 0.5s ease",
        }} />
        <div style={{
          width: `${(1 - blueRatio) * 100}%`,
          background: "#f87171",
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}
