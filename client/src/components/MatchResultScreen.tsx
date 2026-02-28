// ★ v10.5.0: Match Result Screen - SFC Style with All-Player Heatmaps, Ratings, Drill-down
// Design: Super Famicom (SNES) aesthetic - dark palette, pixel fonts, scanline effects
import { useState, useEffect, useMemo, useRef } from 'react';
import type { State, PlayerHeatmap } from '../game/types';

// --- SFC Design System --------------------------------------------------------
const F  = "'Press Start 2P', monospace";
const FD = "'DotGothic16', monospace";
const BG0    = "#0a0a14";
const BG1    = "#0e0e1c";
const BG2    = "#141428";
const BG3    = "#1a1a32";
const BORDER = "#2a2a5a";
const BORDER2 = "#3a3a7a";
const BLUE_TEAM = "#4488ff";
const RED_TEAM  = "#ff4455";
const GOLD   = "#f5c542";
const GREEN  = "#16c47f";
const WHITE  = "#eaeaea";
const GRAY   = "#7878aa";
const ACCENT = "#e94560";
const CYAN   = "#44ddff";

// --- Types --------------------------------------------------------------------
interface MatchResultProps {
  state: State;
  onClose: () => void;
  onCoinsEarned?: (coins: number) => void;
}
interface PlayerRating {
  playerIdx: number;
  team: number;
  num: number;
  name: string;
  posLabel: string;
  isGK: boolean;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passSuccess: number;
  dribbles: number;
  dribbleSuccess: number;
  tackles: number;
  tackleSuccess: number;
  interceptions: number;
  saves: number;
  progPasses: number;
  progPassSuccess: number;
  longPasses: number;
  longPassSuccess: number;
  keyPasses: number;
  chancesCreated: number;
}

// --- Rating Calculation -------------------------------------------------------
function calcRating(ps: {
  goals: number; assists: number; shots: number; shotsOnTarget: number;
  passes: number; passSuccess: number; dribbles: number; dribbleSuccess: number;
  tackles: number; tackleSuccess: number; interceptions: number; saves: number;
}, isGK: boolean): number {
  let r = 6.0;
  r += ps.goals * 1.2;
  r += ps.assists * 0.7;
  r += ps.shotsOnTarget * 0.15;
  r += ps.interceptions * 0.12;
  if (ps.passes > 0) {
    const pct = ps.passSuccess / ps.passes;
    r += (pct - 0.65) * 2.0;
  }
  if (ps.dribbles > 0) {
    const pct = ps.dribbleSuccess / ps.dribbles;
    r += (pct - 0.5) * 0.5;
  }
  if (isGK) {
    r += ps.saves * 0.3;
    if (ps.goals === 0) r += 0.3;
  }
  return Math.max(4.0, Math.min(10.0, Math.round(r * 10) / 10));
}

// --- Rating Badge -------------------------------------------------------------
function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = rating >= 8.5 ? '#ff8c00' : rating >= 7.5 ? GOLD : rating >= 6.5 ? GREEN : rating >= 5.5 ? WHITE : GRAY;
  const bg = rating >= 8.5 ? '#3a1800' : rating >= 7.5 ? '#2a2000' : rating >= 6.5 ? '#0a2a18' : BG3;
  const fs = size === 'lg' ? 16 : size === 'sm' ? 9 : 12;
  const pad = size === 'lg' ? '6px 10px' : size === 'sm' ? '2px 5px' : '4px 7px';
  return (
    <div style={{
      fontFamily: F, fontSize: fs, color,
      background: bg, border: `1px solid ${color}44`,
      padding: pad, minWidth: size === 'lg' ? 44 : 28,
      textAlign: 'center', flexShrink: 0,
      textShadow: `0 0 8px ${color}88`,
    }}>
      {rating.toFixed(1)}
    </div>
  );
}

// --- Stat Bar -----------------------------------------------------------------
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>{label}</span>
      </div>
      <div style={{ height: 5, background: '#1a1a3a', border: `1px solid ${BORDER}` }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}88` }} />
      </div>
    </div>
  );
}

// --- Heatmap Canvas (Full) ----------------------------------------------------
function HeatmapCanvas({ hm, width = 280, height = 170 }: { hm: PlayerHeatmap; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Background - dark green pitch
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, width, height);
    // Pitch lines
    ctx.strokeStyle = '#1e4a1e';
    ctx.lineWidth = 0.8;
    // Center line
    ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    // Center circle
    ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.15, 0, Math.PI * 2); ctx.stroke();
    // Penalty areas
    const paW = width * 0.15; const paH = height * 0.5;
    ctx.strokeRect(0, (height - paH) / 2, paW, paH);
    ctx.strokeRect(width - paW, (height - paH) / 2, paW, paH);
    // Goal areas
    const gaW = width * 0.06; const gaH = height * 0.28;
    ctx.strokeRect(0, (height - gaH) / 2, gaW, gaH);
    ctx.strokeRect(width - gaW, (height - gaH) / 2, gaW, gaH);
    // Outer border
    ctx.strokeStyle = '#2a6a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    // Off-ball heatmap
    if (hm.offBall.length > 0) {
      const gridW = 24; const gridH = 14;
      const grid = new Float32Array(gridW * gridH);
      for (const pt of hm.offBall) {
        const gx = Math.floor(pt.x * gridW);
        const gy = Math.floor(pt.y * gridH);
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = gx + dx; const ny = gy + dy;
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const d = Math.sqrt(dx * dx + dy * dy);
              grid[ny * gridW + nx] += Math.max(0, 1 - d / 2.5);
            }
          }
        }
      }
      const maxD = Math.max(...Array.from(grid), 0.001);
      for (let gy2 = 0; gy2 < gridH; gy2++) {
        for (let gx2 = 0; gx2 < gridW; gx2++) {
          const density = grid[gy2 * gridW + gx2] / maxD;
          if (density < 0.05) continue;
          const px = (gx2 / gridW) * width;
          const py = (gy2 / gridH) * height;
          let r, g, b;
          if (density < 0.33) {
            const t = density / 0.33;
            r = 0; g = Math.round(60 + t * 140); b = Math.round(200 - t * 80);
          } else if (density < 0.66) {
            const t = (density - 0.33) / 0.33;
            r = Math.round(t * 255); g = 200; b = Math.round(120 - t * 120);
          } else {
            const t = (density - 0.66) / 0.34;
            r = 255; g = Math.round(200 - t * 180); b = 0;
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${density * 0.72})`;
          ctx.fillRect(px, py, width / gridW + 1, height / gridH + 1);
        }
      }
    }
    // On-ball events
    const markerColors: Record<string, string> = {
      pass: '#44aaff', shot: '#ff4444', dribble: '#ffaa00',
      receive: '#44ff88', tackle: '#ff88ff', intercept: '#ff88ff', save: '#ffffff',
    };
    ctx.globalAlpha = 0.92;
    for (const ev of hm.onBall) {
      const mc = markerColors[ev.type] || '#ffffff';
      ctx.fillStyle = mc;
      ctx.shadowColor = mc;
      ctx.shadowBlur = ev.type === 'shot' ? 6 : 3;
      ctx.beginPath();
      ctx.arc(ev.x * width, ev.y * height, ev.type === 'shot' ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }, [hm, width, height]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', imageRendering: 'pixelated', border: `1px solid ${BORDER}` }}
    />
  );
}

// --- Mini Heatmap Canvas ------------------------------------------------------
function MiniHeatmapCanvas({ hm, width = 72, height = 44 }: { hm: PlayerHeatmap; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1e4a1e'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    if (hm.offBall.length > 0) {
      const gridW = 18; const gridH = 10;
      const grid = new Float32Array(gridW * gridH);
      for (const pt of hm.offBall) {
        const gx = Math.floor(pt.x * gridW);
        const gy = Math.floor(pt.y * gridH);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx; const ny = gy + dy;
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const d = Math.sqrt(dx * dx + dy * dy);
              grid[ny * gridW + nx] += Math.max(0, 1 - d / 1.5);
            }
          }
        }
      }
      const maxD = Math.max(...Array.from(grid), 0.001);
      for (let gy2 = 0; gy2 < gridH; gy2++) {
        for (let gx2 = 0; gx2 < gridW; gx2++) {
          const density = grid[gy2 * gridW + gx2] / maxD;
          if (density < 0.05) continue;
          const px = (gx2 / gridW) * width;
          const py = (gy2 / gridH) * height;
          let r, g, b;
          if (density < 0.33) { const t = density / 0.33; r = 0; g = Math.round(60 + t * 140); b = Math.round(200 - t * 80); }
          else if (density < 0.66) { const t = (density - 0.33) / 0.33; r = Math.round(t * 255); g = 200; b = Math.round(120 - t * 120); }
          else { const t = (density - 0.66) / 0.34; r = 255; g = Math.round(200 - t * 180); b = 0; }
          ctx.fillStyle = `rgba(${r},${g},${b},${density * 0.72})`;
          ctx.fillRect(px, py, width / gridW + 1, height / gridH + 1);
        }
      }
    }
    const mc: Record<string, string> = { pass: '#44aaff', shot: '#ff4444', dribble: '#ffaa00', receive: '#44ff88', tackle: '#ff88ff', intercept: '#ff88ff', save: '#ffffff' };
    ctx.globalAlpha = 0.9;
    for (const ev of hm.onBall) {
      ctx.fillStyle = mc[ev.type] || '#fff';
      ctx.beginPath();
      ctx.arc(ev.x * width, ev.y * height, ev.type === 'shot' ? 2 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [hm, width, height]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', imageRendering: 'pixelated', border: `1px solid ${BORDER}`, flexShrink: 0 }}
    />
  );
}

// --- Player Detail Panel ------------------------------------------------------
function PlayerDetailPanel({ rating, hm, onBack }: {
  rating: PlayerRating; hm: PlayerHeatmap | undefined; onBack: () => void;
}) {
  const teamColor = rating.team === -1 ? BLUE_TEAM : RED_TEAM;
  const passRate = rating.passes > 0 ? Math.round((rating.passSuccess / rating.passes) * 100) : 0;
  const dribRate = rating.dribbles > 0 ? Math.round((rating.dribbleSuccess / rating.dribbles) * 100) : 0;
  const shotRate = rating.shots > 0 ? Math.round((rating.shotsOnTarget / rating.shots) * 100) : 0;
  const tackleRate = rating.tackles > 0 ? Math.round((rating.tackleSuccess / rating.tackles) * 100) : 0;
  const progPassRate = rating.progPasses > 0 ? Math.round((rating.progPassSuccess / rating.progPasses) * 100) : 0;
  const longPassRate = rating.longPasses > 0 ? Math.round((rating.longPassSuccess / rating.longPasses) * 100) : 0;
  const canvasW = Math.min(320, (typeof window !== 'undefined' ? window.innerWidth : 400) - 80);
  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        borderBottom: `1px solid ${BORDER}`, paddingBottom: 8,
      }}>
        <button onClick={onBack} style={{
          fontFamily: F, fontSize: 6, color: GRAY, background: 'none',
          border: `1px solid ${BORDER}`, padding: '3px 7px', cursor: 'pointer',
        }}>◀</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: F, fontSize: 7, color: teamColor }}>#{rating.num}</span>
            <span style={{ fontFamily: FD, fontSize: 15, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rating.name}
            </span>
          </div>
          <div style={{ fontFamily: F, fontSize: 5, color: GRAY, marginTop: 2 }}>
            {rating.posLabel} · {rating.team === -1 ? 'BLUE' : 'RED'}
          </div>
        </div>
        <RatingBadge rating={rating.rating} size="lg" />
      </div>

      {/* Key Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'GOAL', value: rating.goals, color: GOLD },
          { label: 'ASST', value: rating.assists, color: GREEN },
          { label: 'SHOT', value: rating.shots, color: ACCENT },
          { label: 'SAVE', value: rating.saves, color: CYAN },
          { label: 'PASS', value: rating.passes, color: BLUE_TEAM },
          { label: 'INTP', value: rating.interceptions, color: '#ff88ff' },
          { label: 'DRIB', value: rating.dribbles, color: '#ffaa00' },
          { label: 'KPAS', value: rating.keyPasses, color: '#44ffaa' },
        ].map(s => (
          <div key={s.label} style={{
            background: BG2, border: `1px solid ${BORDER}`,
            padding: '5px 3px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: F, fontSize: 11, color: s.color,
              textShadow: `0 0 6px ${s.color}55`,
            }}>{s.value}</div>
            <div style={{ fontFamily: F, fontSize: 5, color: GRAY, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pass Stats */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, padding: '8px 10px', marginBottom: 6 }}>
        <div style={{ fontFamily: F, fontSize: 5, color: GRAY, marginBottom: 6, letterSpacing: 1 }}>-- PASS STATS --</div>
        <StatBar label={`パス成功率 ${passRate}%  (${rating.passSuccess}/${rating.passes})`} value={passRate} max={100} color={BLUE_TEAM} />
        <StatBar label={`ロングパス ${rating.longPasses}本  成功率 ${longPassRate}%`} value={longPassRate} max={100} color="#88aaff" />
        <StatBar label={`プログレッシブパス ${rating.progPasses}本  成功率 ${progPassRate}%`} value={progPassRate} max={100} color={CYAN} />
      </div>

      {/* Attack Stats */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, padding: '8px 10px', marginBottom: 6 }}>
        <div style={{ fontFamily: F, fontSize: 5, color: GRAY, marginBottom: 6, letterSpacing: 1 }}>-- ATTACK STATS --</div>
        <StatBar label={`枠内シュート率 ${shotRate}%  (${rating.shotsOnTarget}/${rating.shots})`} value={shotRate} max={100} color={ACCENT} />
        <StatBar label={`ドリブル成功率 ${dribRate}%  (${rating.dribbleSuccess}/${rating.dribbles})`} value={dribRate} max={100} color="#ffaa00" />
        <StatBar label={`タックル成功率 ${tackleRate}%  (${rating.tackleSuccess}/${rating.tackles})`} value={tackleRate} max={100} color="#ff88ff" />
      </div>

      {/* Heatmap */}
      {hm && (
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, padding: '8px 10px' }}>
          <div style={{ fontFamily: F, fontSize: 5, color: GRAY, marginBottom: 6, letterSpacing: 1 }}>-- HEAT MAP --</div>
          <HeatmapCanvas hm={hm} width={canvasW} height={Math.round(canvasW * 0.58)} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 6 }}>
            {[
              { color: '#44aaff', label: 'パス' },
              { color: '#ff4444', label: 'シュート' },
              { color: '#ffaa00', label: 'ドリブル' },
              { color: '#44ff88', label: 'トラップ' },
              { color: '#ff88ff', label: 'インターセプト' },
              { color: '#ffffff', label: 'セーブ' },
            ].map(it => (
              <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Player List Row (with mini heatmap) --------------------------------------
function PlayerRow({ rating, hm, onClick }: { rating: PlayerRating; hm: PlayerHeatmap | undefined; onClick: () => void }) {
  const teamColor = rating.team === -1 ? BLUE_TEAM : RED_TEAM;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px', cursor: 'pointer',
        borderBottom: `1px solid ${BORDER}`,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = BG3)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Mini heatmap */}
      {hm ? (
        <MiniHeatmapCanvas hm={hm} width={60} height={37} />
      ) : (
        <div style={{ width: 60, height: 37, background: '#0a1a0a', border: `1px solid ${BORDER}`, flexShrink: 0 }} />
      )}
      {/* Player info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ fontFamily: F, fontSize: 6, color: teamColor }}>#{rating.num}</span>
          <span style={{ fontFamily: FD, fontSize: 12, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rating.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>{rating.posLabel}</span>
          {rating.goals > 0 && <span style={{ fontFamily: F, fontSize: 5, color: GOLD }}>⚽{rating.goals}</span>}
          {rating.assists > 0 && <span style={{ fontFamily: F, fontSize: 5, color: GREEN }}>A{rating.assists}</span>}
          {rating.saves > 0 && <span style={{ fontFamily: F, fontSize: 5, color: CYAN }}>S{rating.saves}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>P{rating.passes}</span>
          <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>S{rating.shots}</span>
          <span style={{ fontFamily: F, fontSize: 5, color: GRAY }}>I{rating.interceptions}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <RatingBadge rating={rating.rating} size="sm" />
        <span style={{ fontFamily: F, fontSize: 6, color: GRAY }}>▶</span>
      </div>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------
export default function MatchResultScreen({ state, onClose, onCoinsEarned }: MatchResultProps) {
  const [view, setView] = useState<'overview' | 'players' | 'detail'>('overview');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRating | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState(false);
  const [showCoinAnim, setShowCoinAnim] = useState(false);
  const st = state;
  const blueWin = st.scoreBlue > st.scoreRed;
  const redWin = st.scoreRed > st.scoreBlue;
  const isDraw = !blueWin && !redWin;

  // Calculate player ratings
  const ratings = useMemo<PlayerRating[]>(() => {
    return st.pl.map(p => {
      const ps = st.stats.playerStats[p.idx] || {
        playerIdx: p.idx, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
        passes: 0, passSuccess: 0, dribbles: 0, dribbleSuccess: 0,
        tackles: 0, tackleSuccess: 0, interceptions: 0, saves: 0,
      };
      return {
        playerIdx: p.idx,
        team: p.team,
        num: p.num,
        name: p.cardName || `#${p.num}`,
        posLabel: p.posLabel || (p.isGK ? 'GK' : p.role),
        isGK: p.isGK,
        rating: calcRating(ps, p.isGK),
        goals: ps.goals,
        assists: ps.assists,
        shots: ps.shots,
        shotsOnTarget: ps.shotsOnTarget,
        passes: ps.passes,
        passSuccess: ps.passSuccess,
        dribbles: ps.dribbles,
        dribbleSuccess: ps.dribbleSuccess,
        tackles: ps.tackles,
        tackleSuccess: ps.tackleSuccess,
        interceptions: ps.interceptions,
        saves: ps.saves,
        progPasses: (ps as any).progPasses || 0,
        progPassSuccess: (ps as any).progPassSuccess || 0,
        longPasses: (ps as any).longPasses || 0,
        longPassSuccess: (ps as any).longPassSuccess || 0,
        keyPasses: (ps as any).keyPasses || 0,
        chancesCreated: (ps as any).chancesCreated || 0,
      };
    }).sort((a, b) => b.rating - a.rating);
  }, [st]);

  const mvp = ratings[0];
  const blueRatings = useMemo(() => ratings.filter(r => r.team === -1), [ratings]);
  const redRatings = useMemo(() => ratings.filter(r => r.team === 1), [ratings]);

  // Coin reward
  const coinReward = blueWin ? 150 : isDraw ? 80 : 50;
  useEffect(() => {
    if (!coinsAwarded) {
      setCoinsAwarded(true);
      setShowCoinAnim(true);
      onCoinsEarned?.(coinReward);
      setTimeout(() => setShowCoinAnim(false), 2500);
    }
  }, []);

  // Stats
  const totalPoss = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
  const possession = {
    blue: totalPoss > 0 ? Math.round((st.stats.possessionFrames.blue / totalPoss) * 100) : 50,
    red: totalPoss > 0 ? Math.round((st.stats.possessionFrames.red / totalPoss) * 100) : 50,
  };
  const passRate = {
    blue: st.stats.passAttempts.blue > 0 ? Math.round((st.stats.passSuccess.blue / st.stats.passAttempts.blue) * 100) : 0,
    red: st.stats.passAttempts.red > 0 ? Math.round((st.stats.passSuccess.red / st.stats.passAttempts.red) * 100) : 0,
  };

  // Helper to get heatmap for a player
  const getHeatmap = (playerIdx: number) =>
    st.heatmaps ? st.heatmaps.find(h => h.playerIdx === playerIdx) : undefined;

  // --- Overview -------------------------------------------------------------
  const OverviewView = () => (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Score */}
      <div style={{
        background: `linear-gradient(135deg, ${BG2}, ${BG3})`,
        border: `2px solid ${BORDER2}`,
        padding: '12px', textAlign: 'center', marginBottom: 10,
      }}>
        <div style={{ fontFamily: F, fontSize: 7, color: GRAY, marginBottom: 8, letterSpacing: 3 }}>FULL TIME</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div>
            <div style={{ fontFamily: F, fontSize: 7, color: BLUE_TEAM, marginBottom: 4, letterSpacing: 1 }}>BLUE</div>
            <div style={{ fontFamily: F, fontSize: 42, color: blueWin ? GOLD : WHITE, lineHeight: 1, textShadow: blueWin ? `0 0 20px ${GOLD}88` : 'none' }}>
              {st.scoreBlue}
            </div>
          </div>
          <div style={{ fontFamily: F, fontSize: 20, color: GRAY }}>-</div>
          <div>
            <div style={{ fontFamily: F, fontSize: 7, color: RED_TEAM, marginBottom: 4, letterSpacing: 1 }}>RED</div>
            <div style={{ fontFamily: F, fontSize: 42, color: redWin ? GOLD : WHITE, lineHeight: 1, textShadow: redWin ? `0 0 20px ${GOLD}88` : 'none' }}>
              {st.scoreRed}
            </div>
          </div>
        </div>
        <div style={{
          fontFamily: F, fontSize: 9, marginTop: 10,
          color: blueWin ? GOLD : redWin ? ACCENT : GRAY,
          textShadow: blueWin || redWin ? `0 0 12px currentColor` : 'none',
        }}>
          {blueWin ? '★ BLUE WIN ★' : redWin ? '★ RED WIN ★' : '-- DRAW --'}
        </div>
        {showCoinAnim && (
          <div style={{ fontFamily: F, fontSize: 8, color: GOLD, marginTop: 6, animation: 'pulse 0.5s infinite' }}>
            +{coinReward} COINS!
          </div>
        )}
      </div>

      {/* MVP */}
      {mvp && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1a00, #2a2800)',
          border: `2px solid ${GOLD}`,
          padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ fontFamily: F, fontSize: 6, color: GOLD, marginBottom: 8, letterSpacing: 2 }}>★ MAN OF THE MATCH ★</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40,
              background: mvp.team === -1 ? '#1133aa' : '#aa1133',
              border: `2px solid ${GOLD}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: F, fontSize: 10, color: WHITE, flexShrink: 0,
            }}>
              {mvp.num}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FD, fontSize: 16, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mvp.name}
              </div>
              <div style={{ fontFamily: F, fontSize: 6, color: GRAY, marginTop: 2 }}>
                {mvp.posLabel} · {mvp.team === -1 ? 'BLUE' : 'RED'}
              </div>
              <div style={{ fontFamily: F, fontSize: 6, color: GRAY, marginTop: 2 }}>
                {mvp.goals > 0 ? `⚽${mvp.goals}G ` : ''}{mvp.assists > 0 ? `A${mvp.assists} ` : ''}{mvp.saves > 0 ? `S${mvp.saves}` : ''}
              </div>
            </div>
            <RatingBadge rating={mvp.rating} size="lg" />
          </div>
        </div>
      )}

      {/* Match Stats */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontFamily: F, fontSize: 6, color: GRAY, marginBottom: 10, letterSpacing: 2 }}>-- MATCH STATS --</div>
        {[
          { label: 'ポゼッション', blue: possession.blue, red: possession.red, suffix: '%' },
          { label: 'シュート', blue: st.stats.shotsTotal.blue, red: st.stats.shotsTotal.red },
          { label: '枠内シュート', blue: st.stats.shotsOnTarget.blue, red: st.stats.shotsOnTarget.red },
          { label: 'パス成功率', blue: passRate.blue, red: passRate.red, suffix: '%' },
          { label: 'インターセプト', blue: st.stats.interceptions.blue, red: st.stats.interceptions.red },
        ].map(s => {
          const total = (s.blue as number) + (s.red as number);
          const bluePct = total > 0 ? ((s.blue as number) / total) * 100 : 50;
          return (
            <div key={s.label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontFamily: F, fontSize: 7, color: BLUE_TEAM }}>{s.blue}{s.suffix || ''}</span>
                <span style={{ fontFamily: F, fontSize: 6, color: GRAY }}>{s.label}</span>
                <span style={{ fontFamily: F, fontSize: 7, color: RED_TEAM }}>{s.red}{s.suffix || ''}</span>
              </div>
              <div style={{ display: 'flex', height: 4, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
                <div style={{ width: `${bluePct}%`, background: BLUE_TEAM, boxShadow: `0 0 4px ${BLUE_TEAM}88` }} />
                <div style={{ flex: 1, background: RED_TEAM }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setView('players')} style={{
          flex: 1, fontFamily: F, fontSize: 7, color: WHITE,
          background: BG2, border: `2px solid ${BLUE_TEAM}`,
          padding: '10px 6px', cursor: 'pointer',
          boxShadow: `0 0 8px ${BLUE_TEAM}44`,
        }}>
          選手詳細 ▶
        </button>
        <button onClick={onClose} style={{
          flex: 1, fontFamily: F, fontSize: 7, color: BG0,
          background: GOLD, border: 'none',
          padding: '10px 6px', cursor: 'pointer',
          boxShadow: `0 0 12px ${GOLD}66`,
        }}>
          とじる
        </button>
      </div>
    </div>
  );

  // --- Players View ---------------------------------------------------------
  const PlayersView = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '7px 12px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        background: BG0,
      }}>
        <button onClick={() => setView('overview')} style={{
          fontFamily: F, fontSize: 6, color: GRAY, background: 'none',
          border: `1px solid ${BORDER}`, padding: '3px 7px', cursor: 'pointer',
        }}>◀</button>
        <span style={{ fontFamily: F, fontSize: 7, color: WHITE }}>選手評価</span>
        <span style={{ fontFamily: F, fontSize: 5, color: GRAY, marginLeft: 'auto' }}>タップで詳細</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ borderRight: `1px solid ${BORDER}` }}>
          <div style={{
            padding: '5px 8px', background: '#0a1a3a',
            fontFamily: F, fontSize: 6, color: BLUE_TEAM,
            position: 'sticky', top: 0, zIndex: 1,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            BLUE TEAM
          </div>
          {blueRatings.map(r => (
            <PlayerRow
              key={r.playerIdx}
              rating={r}
              hm={getHeatmap(r.playerIdx)}
              onClick={() => { setSelectedPlayer(r); setView('detail'); }}
            />
          ))}
        </div>
        <div>
          <div style={{
            padding: '5px 8px', background: '#3a0a0a',
            fontFamily: F, fontSize: 6, color: RED_TEAM,
            position: 'sticky', top: 0, zIndex: 1,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            RED TEAM
          </div>
          {redRatings.map(r => (
            <PlayerRow
              key={r.playerIdx}
              rating={r}
              hm={getHeatmap(r.playerIdx)}
              onClick={() => { setSelectedPlayer(r); setView('detail'); }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  // --- Detail View ----------------------------------------------------------
  const DetailView = () => {
    if (!selectedPlayer) return null;
    return (
      <PlayerDetailPanel
        rating={selectedPlayer}
        hm={getHeatmap(selectedPlayer.playerIdx)}
        onBack={() => setView('players')}
      />
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 500,
        height: '94dvh', maxHeight: 740,
        background: BG1,
        border: `3px solid ${BORDER2}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: `0 0 0 1px ${BORDER}, 0 0 40px rgba(68,136,255,0.2), 0 0 80px rgba(0,0,0,0.6)`,
      }}>
        {/* Title bar */}
        <div style={{
          padding: '8px 12px',
          background: `linear-gradient(90deg, ${BG0}, #0a0a20)`,
          borderBottom: `2px solid ${BORDER2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: F, fontSize: 8, color: GOLD, letterSpacing: 2, textShadow: `0 0 10px ${GOLD}88` }}>
            {view === 'overview' ? '★ RESULT ★' : view === 'players' ? '選手評価' : '選手詳細'}
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['overview', 'players'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontFamily: F, fontSize: 5,
                  color: view === v ? BG0 : GRAY,
                  background: view === v ? GOLD : 'transparent',
                  border: `1px solid ${view === v ? GOLD : BORDER}`,
                  padding: '3px 6px', cursor: 'pointer',
                }}
              >
                {v === 'overview' ? '概要' : '選手'}
              </button>
            ))}
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {view === 'overview' && <OverviewView />}
          {view === 'players' && <PlayersView />}
          {view === 'detail' && <DetailView />}
        </div>
      </div>
    </div>
  );
}
