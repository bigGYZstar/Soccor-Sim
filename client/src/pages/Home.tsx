import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';

// --- game/ モジュールから必要なものをすべてインポート ---
import { State, V, SpeedMode } from '../game/types';
import { P, FormationId, FORMATION_IDS, FORMATIONS } from '../game/constants';
import { v, vadd, vscl } from '../game/math';
import { mkState, mkCustomState, doKickOff, update } from '../game/engine';
import type { CardPlayerData } from '../game/engine';
import { useCollection } from '@/hooks/useCollection';
import MatchResultScreen from '@/components/MatchResultScreen';

// ============================================================
// SFC-style retro pixel font helper
// ============================================================
const RETRO_FONT = "'Press Start 2P', monospace";
const RETRO_BG = "#1a1a2e";
const RETRO_ACCENT = "#e94560";
const RETRO_BLUE = "#0f3460";
const RETRO_GOLD = "#f5c542";
const RETRO_GREEN = "#16c47f";
const RETRO_WHITE = "#eaeaea";
const RETRO_DARK = "#0f0f23";

// ============================================================
// Formation Preview (mini pitch with dots) - responsive
// ============================================================
function FormationPreview({ formationId, teamColor, mirror }: { formationId: FormationId; teamColor: string; mirror: boolean }) {
  const def = FORMATIONS[formationId];
  const pw = 140;
  const ph = 90;
  const mx = 10;
  const my = 10;

  return (
    <svg
      viewBox={`0 0 ${pw + mx * 2} ${ph + my * 2}`}
      style={{ display: "block", margin: "0 auto", width: "100%", maxWidth: "160px", height: "auto" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Mini pitch */}
      <rect x={mx} y={my} width={pw} height={ph} fill="#145e30" stroke="#2a8c4a" strokeWidth={1.5} rx={3} />
      {/* Center line */}
      <line x1={mx + pw / 2} y1={my} x2={mx + pw / 2} y2={my + ph} stroke="#2a8c4a" strokeWidth={1} />
      {/* Center circle */}
      <circle cx={mx + pw / 2} cy={my + ph / 2} r={10} fill="none" stroke="#2a8c4a" strokeWidth={1} />
      {/* Players */}
      {def.positions.map((pos, i) => {
        // Normalize positions to fit mini pitch
        // ★ v10.7.0: Invert Y to match match canvas
        const nx = (pos.x + 52.5) / 105; // 0..1
        const ny = (-pos.y + 34) / 68;   // 0..1 (Y inverted to match canvas)
        const px = mirror ? mx + pw - nx * pw : mx + nx * pw;
        const py = my + ny * ph;
        const jerseyNum = def.jerseyNumbers[i];
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={i === 0 ? 5 : 4} fill={teamColor} stroke="white" strokeWidth={1} />
            <text x={px} y={py + 1} textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="5" fontFamily={RETRO_FONT}>{jerseyNum}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// SFC-Style Start Screen (fully responsive)
// ============================================================
function StartScreen({ onStart }: { onStart: (blueForm: FormationId, redForm: FormationId) => void }) {
  const [, setLocation] = useLocation();
  const [blueFormation, setBlueFormation] = useState<FormationId>("4-4-2");
  const [redFormation, setRedFormation] = useState<FormationId>("4-4-2");
  const [blinkVisible, setBlinkVisible] = useState(true);

  // SFC-style blinking text
  useEffect(() => {
    const interval = setInterval(() => setBlinkVisible(prev => !prev), 500);
    return () => clearInterval(interval);
  }, []);

  const cycleFormation = (current: FormationId, dir: 1 | -1): FormationId => {
    const idx = FORMATION_IDS.indexOf(current);
    const next = (idx + dir + FORMATION_IDS.length) % FORMATION_IDS.length;
    return FORMATION_IDS[next];
  };

  // Scanline effect CSS
  const scanlineStyle: React.CSSProperties = {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
    pointerEvents: "none",
    zIndex: 10,
  };

  const pixelBorder = (color: string) => `3px solid ${color}`;

  // Team card component (reusable for both teams)
  const TeamCard = ({ team, formation, setFormation, color, borderColor, label }: {
    team: "blue" | "red";
    formation: FormationId;
    setFormation: (fn: (f: FormationId) => FormationId) => void;
    color: string;
    borderColor: string;
    label: string;
  }) => (
    <div style={{
      background: team === "blue" ? "rgba(15,52,96,0.6)" : "rgba(96,15,15,0.6)",
      border: pixelBorder(borderColor),
      padding: "clamp(6px, 2vw, 16px)",
      width: "100%",
      maxWidth: "340px",
      minWidth: 0,
      boxSizing: "border-box",
    }}>
      <div style={{
        textAlign: "center",
        fontSize: "clamp(7px, 1.6vw, 12px)",
        color,
        marginBottom: "clamp(4px, 1vw, 10px)",
        textShadow: "1px 1px 0px #000",
        whiteSpace: "nowrap",
      }}>
        {label}
      </div>

      {/* Formation selector */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "clamp(2px, 1vw, 8px)", marginBottom: "clamp(4px, 1vw, 10px)",
      }}>
        <button
          onClick={() => setFormation(f => cycleFormation(f, -1))}
          style={{
            background: "transparent", border: "none", color: RETRO_GOLD,
            fontSize: "clamp(12px, 2.2vw, 22px)", cursor: "pointer",
            fontFamily: RETRO_FONT,
            padding: "4px",
            lineHeight: 1,
          }}
        >◀</button>
        <div style={{
          fontSize: "clamp(9px, 1.8vw, 14px)",
          color: RETRO_WHITE,
          minWidth: "clamp(60px, 12vw, 100px)",
          textAlign: "center",
          textShadow: "1px 1px 0px #000",
        }}>
          {formation}
        </div>
        <button
          onClick={() => setFormation(f => cycleFormation(f, 1))}
          style={{
            background: "transparent", border: "none", color: RETRO_GOLD,
            fontSize: "clamp(12px, 2.2vw, 22px)", cursor: "pointer",
            fontFamily: RETRO_FONT,
            padding: "4px",
            lineHeight: 1,
          }}
        >▶</button>
      </div>

      <FormationPreview
        formationId={formation}
        teamColor={team === "blue" ? "#2563eb" : "#dc2626"}
        mirror={team === "red"}
      />
    </div>
  );

  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: RETRO_BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: RETRO_FONT,
      color: RETRO_WHITE,
      position: "relative",
      overflow: "hidden",
      imageRendering: "pixelated" as any,
      padding: "clamp(8px, 2vh, 24px) clamp(8px, 3vw, 24px)",
      boxSizing: "border-box",
    }}>
      {/* Scanline overlay */}
      <div style={scanlineStyle} />

      {/* Star field background */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(circle at 20% 30%, ${RETRO_BLUE} 0%, transparent 50%),
                     radial-gradient(circle at 80% 70%, #16213e 0%, transparent 50%)`,
        zIndex: 0,
      }} />

      {/* Back to Top button */}
      <div style={{ position: "absolute", top: "clamp(8px, 2vh, 16px)", left: "clamp(8px, 2vw, 16px)", zIndex: 20 }}>
        <button
          onClick={() => setLocation('/')}
          style={{
            background: RETRO_DARK,
            border: `2px solid ${RETRO_GOLD}`,
            color: RETRO_GOLD,
            fontFamily: RETRO_FONT,
            fontSize: "clamp(5px, 1vw, 9px)",
            padding: "clamp(3px, 0.6vh, 6px) clamp(6px, 1.5vw, 12px)",
            cursor: "pointer",
            letterSpacing: "1px",
          }}
        >
          ◀ TOP
        </button>
      </div>

      {/* Title */}
      <div style={{ position: "relative", zIndex: 5, textAlign: "center", marginBottom: "clamp(8px, 2vh, 24px)", flexShrink: 0 }}>
        <div style={{
          fontSize: "clamp(14px, 4vw, 36px)",
          color: RETRO_GOLD,
          textShadow: `3px 3px 0px ${RETRO_ACCENT}, -1px -1px 0px #000`,
          letterSpacing: "clamp(1px, 0.5vw, 4px)",
          marginBottom: "clamp(2px, 0.5vh, 8px)",
        }}>
          SOCCER SIM
        </div>
        <div style={{
          fontSize: "clamp(5px, 1.2vw, 10px)",
          color: RETRO_GREEN,
          letterSpacing: "clamp(0px, 0.3vw, 2px)",
        }}>
          ⚽ 11 vs 11 SIMULATION ENGINE ⚽
        </div>
      </div>

      {/* Formation Selection Panel */}
      <div style={{
        position: "relative", zIndex: 5,
        display: "flex",
        gap: "clamp(6px, 2vw, 32px)",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        maxWidth: "800px",
        flexShrink: 1,
        minHeight: 0,
      }}>
        {/* Blue Team */}
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "center" }}>
          <TeamCard
            team="blue"
            formation={blueFormation}
            setFormation={setBlueFormation}
            color="#60a5fa"
            borderColor="#2563eb"
            label="▶ BLUE TEAM"
          />
        </div>

        {/* VS */}
        <div style={{
          fontSize: "clamp(10px, 2.5vw, 24px)",
          color: RETRO_ACCENT,
          textShadow: "2px 2px 0px #000",
          fontFamily: RETRO_FONT,
          flexShrink: 0,
        }}>
          VS
        </div>

        {/* Red Team */}
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "center" }}>
          <TeamCard
            team="red"
            formation={redFormation}
            setFormation={setRedFormation}
            color="#f87171"
            borderColor="#dc2626"
            label="RED TEAM ◀"
          />
        </div>
      </div>

      {/* Kick Off Button */}
      <div style={{ position: "relative", zIndex: 5, marginTop: "clamp(8px, 2vh, 24px)", textAlign: "center", flexShrink: 0 }}>
        <button
          onClick={() => onStart(blueFormation, redFormation)}
          style={{
            background: blinkVisible ? RETRO_ACCENT : "#b8344d",
            border: pixelBorder(RETRO_GOLD),
            color: RETRO_WHITE,
            fontFamily: RETRO_FONT,
            fontSize: "clamp(8px, 2vw, 16px)",
            padding: "clamp(6px, 1.2vh, 14px) clamp(16px, 4vw, 44px)",
            cursor: "pointer",
            letterSpacing: "clamp(1px, 0.3vw, 3px)",
            textShadow: "2px 2px 0px #000",
            boxShadow: `0 4px 0px ${RETRO_DARK}, 0 6px 12px rgba(0,0,0,0.5)`,
            transition: "transform 0.1s",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(2px)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          ⚽ KICK OFF ⚽
        </button>
      </div>

      {/* Footer credits */}
      <div style={{
        position: "relative", zIndex: 5,
        marginTop: "clamp(4px, 1vh, 12px)",
        fontSize: "clamp(4px, 0.8vw, 7px)",
        color: "rgba(234,234,234,0.4)",
        letterSpacing: "1px",
        flexShrink: 0,
      }}>
        © 2026 SOCCER SIM ENGINE v9.1.0
      </div>
    </div>
  );
}

// ============================================================
// 描画レイヤー (UI依存)
// ============================================================
const render = (ctx: CanvasRenderingContext2D, cvs: HTMLCanvasElement, st: State) => {
  const w = cvs.clientWidth;
  const h = cvs.clientHeight;
  
  // ★ v11.4.0: Responsive layout - adapt padding based on orientation and screen size
  const isPortrait = h > w;
  // Portrait (mobile vertical): pitch is wider than tall relative to screen
  // Landscape (iPad/iPhone horizontal): standard layout
  const hudReserve = Math.max(60, h * 0.10); // Reserve space for HUD at top
  const logReserve = Math.max(50, h * 0.12); // Reserve space for log at bottom
  const padW = isPortrait ? 1.0 : 2.5;
  const padH = isPortrait ? 1.0 : 2.5;
  const availH = h - hudReserve - logReserve;
  const availW = w;
  const sc = Math.min(availW / (P.pitchHalfW * 2 + padW), availH / (P.pitchHalfH * 2 + padH));
  const ox = w / 2;
  // Center vertically in available area (between HUD and log)
  const oy = hudReserve + availH / 2;

  const w2s = (p: V) => ({ x: ox + p.x * sc, y: oy - p.y * sc });
  const sval = (val: number) => val * sc;

  // 1. 背景
  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, w, h);

  // 2. ピッチ (芝生)
  const plW = sval(P.pitchHalfW); const plH = sval(P.pitchHalfH);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#145e30";
  ctx.fillRect(-plW, -plH, plW*2, plH*2);
  ctx.fillStyle = "#1a6b3a";
  const stripes = 12;
  const sw = (P.pitchHalfW * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) ctx.fillRect(sval(-P.pitchHalfW + i * sw), -plH, sval(sw), plH*2);
  }
  
  // 3. ピッチの白線
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, sc * 0.02);
  ctx.strokeRect(-plW, -plH, plW*2, plH*2);
  
  ctx.beginPath();
  ctx.moveTo(0, -plH); ctx.lineTo(0, plH); ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(0, 0, sval(P.centreCircleR), 0, Math.PI*2); ctx.stroke();

  const drawArea = (sign: number) => {
    const gw = sval(P.penAreaW); const gh = sval(P.penAreaH);
    ctx.strokeRect(sign > 0 ? sval(P.pitchHalfW) - gw : sval(-P.pitchHalfW), -gh, gw, gh*2);
    
    const gaw = sval(P.goalAreaW); const gah = sval(P.goalAreaH);
    ctx.strokeRect(sign > 0 ? sval(P.pitchHalfW) - gaw : sval(-P.pitchHalfW), -gah, gaw, gah*2);
  };
  drawArea(1); drawArea(-1);
  ctx.restore();

  // 4. ゴールネット
  const drawGoal = (sign: number) => {
     const p = w2s(v(sign * P.pitchHalfW, 0));
     ctx.fillStyle = "rgba(255,255,255,0.2)";
     const gw = sval(P.goalDepth); const gh = sval(P.goalHalfH);
     ctx.fillRect(sign > 0 ? p.x : p.x - gw, p.y - gh, gw, gh*2);
     ctx.strokeRect(sign > 0 ? p.x : p.x - gw, p.y - gh, gw, gh*2);
  };
  drawGoal(1); drawGoal(-1);

  // 5. ★ v11.5.0: Enhanced trail rendering with curve visualization
  // Ball trail dots: color encodes spin direction, size encodes height
  if (st.ballTrail && st.ballTrail.length > 0) {
    const n = st.ballTrail.length;
    for (let i = 0; i < n; i++) {
      const dot = st.ballTrail[i];
      const dp = w2s(dot.pos);
      const alpha = Math.min(0.75, dot.t * 1.3);
      // ★ v11.5.0: Size grows with height (airborne = larger dot)
      const heightBonus = Math.min(1.5, (dot.z ?? 0) * 0.15);
      const r = Math.max(1.5, sval(0.13) * (0.4 + dot.t * 0.9 + heightBonus));
      // ★ v11.5.0: Color encodes spin direction
      // Strong right spin (spinX > 1.5): warm orange/red
      // Strong left spin (spinX < -1.5): cool cyan/blue
      // Neutral / no spin: white/yellow
      const spin = dot.spinX ?? 0;
      const spinStrength = Math.min(1.0, Math.abs(spin) / 4.0); // 0-1 normalized
      let r255: number, g255: number, b255: number;
      if (spin > 0.5) {
        // Right curve: yellow → orange → red
        r255 = 255;
        g255 = Math.round(255 - spinStrength * 180);
        b255 = Math.round(100 - spinStrength * 100);
      } else if (spin < -0.5) {
        // Left curve: yellow → cyan → blue
        r255 = Math.round(100 - spinStrength * 80);
        g255 = Math.round(200 + spinStrength * 55);
        b255 = 255;
      } else {
        // Neutral: white/pale yellow
        r255 = 255; g255 = 255; b255 = 200;
      }
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r255},${g255},${b255},${alpha})`;
      ctx.fill();
      // ★ v11.5.0: Connect consecutive dots with a line for smoother curve visualization
      if (i > 0 && dot.t > 0.15) {
        const prev = st.ballTrail[i - 1];
        const pp = w2s(prev.pos);
        const lineAlpha = alpha * 0.45;
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y);
        ctx.lineTo(dp.x, dp.y);
        ctx.strokeStyle = `rgba(${r255},${g255},${b255},${lineAlpha})`;
        ctx.lineWidth = Math.max(1, r * 0.7);
        ctx.stroke();
      }
    }
  }
  
  // Kick trail line (pass/shot/long pass)
  if (st.trail) {
    const s = w2s(st.trail.start); const e = w2s(st.trail.end);
    const alpha = Math.min(0.9, st.trail.t * 1.2);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    if (st.trail.shot) {
      // Shot: bright red, thick, solid
      ctx.strokeStyle = `rgba(255,80,80,${alpha})`; ctx.lineWidth = Math.max(3, sval(0.15)); ctx.setLineDash([]);
    } else if (st.trail.longPass) {
      // Long pass: cyan, medium, long dash
      ctx.strokeStyle = `rgba(100,220,255,${alpha})`; ctx.lineWidth = Math.max(2, sval(0.10)); ctx.setLineDash([8, 6]);
    } else {
      // Short pass: white, medium, short dash
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = Math.max(2, sval(0.10)); ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Arrow head at end point for pass direction
    if (!st.trail.shot) {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 10) {
        const nx = dx / len;
        const ny = dy / len;
        const arrowSize = Math.max(4, sval(0.25));
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - nx * arrowSize + ny * arrowSize * 0.5, e.y - ny * arrowSize - nx * arrowSize * 0.5);
        ctx.lineTo(e.x - nx * arrowSize - ny * arrowSize * 0.5, e.y - ny * arrowSize + nx * arrowSize * 0.5);
        ctx.closePath();
        ctx.fillStyle = st.trail.longPass ? `rgba(100,220,255,${alpha})` : `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
    }
  }

  // 6. 選手 (SFC-style pixel art with separated body and feet)
  // Helper: draw a pixel-art rectangle (snapped to pixel grid for retro feel)
  const px = (x: number) => Math.round(x);
  const drawPixelRect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px(x), px(y), Math.max(1, px(w)), Math.max(1, px(h)));
  };

  st.pl.forEach(p => {
    const pos = w2s(p.pos);
    const r = sval(P.playerRadius);
    const unit = Math.max(2.0, r * 0.45); // Pixel unit size (v9.4.0: increased for visibility)
    
    // Team colors (SFC palette - limited, saturated colors)
    const isBlue = p.isBlue;  // ★ v11.1.0: Use isBlue flag (never changes between halves)
    const shirtColor = isBlue 
      ? (p.isGK ? "#00a0e0" : "#2060d0") 
      : (p.isGK ? "#e0a000" : "#d02020");
    const shirtHighlight = isBlue
      ? (p.isGK ? "#40c0ff" : "#4080ff")
      : (p.isGK ? "#ffc040" : "#ff4040");
    const shirtShadow = isBlue
      ? (p.isGK ? "#006090" : "#103080")
      : (p.isGK ? "#906000" : "#801010");
    const shortsColor = isBlue ? "#1040a0" : "#f0f0f0";
    const skinColor = "#f0c090";
    const skinShadow = "#c09060";
    const hairColor = isBlue ? "#302010" : "#101010";
    const bootColor = isBlue ? "#f0f0f0" : "#101010";
    const bootHighlight = isBlue ? "#ffffff" : "#303030";
    
    // Ball holder indicator
    if (st.ball.owner === p.slot + (p.team===1?11:0)) {
      ctx.strokeStyle = isBlue ? "#60a0ff" : "#ff6060";
      ctx.lineWidth = Math.max(2, unit * 0.8);
      ctx.strokeRect(pos.x - r*1.3, pos.y - r*1.6, r*2.6, r*2.8);
    }
    
    // Shadow on ground
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + unit*3.5, unit*2.5, unit*1.0, 0, 0, Math.PI*2);
    ctx.fill();
    
    // === FEET (drawn first, behind body) - SFC-style spikes ===
    if (p.leftFoot && p.rightFoot) {
      const leftFootPos = w2s(p.leftFoot.pos);
      const rightFootPos = w2s(p.rightFoot.pos);
      const footW = Math.max(3, unit * 2.2);
      const footH = Math.max(2, unit * 1.4);
      const studH = Math.max(1, unit * 0.5);
      const sockColor = isBlue ? "#f0f0f0" : "#d02020";
      const soleColor = "#303030";
      const studColor = "#808080";
      const laceColor = isBlue ? "#e0e0e0" : "#404040";
      
      // Check which foot is kicking or trapping (animating)
      const leftKicking = p.leftFoot.animTimer > 0 && p.leftFoot.animType === "kick";
      const rightKicking = p.rightFoot.animTimer > 0 && p.rightFoot.animType === "kick";
      const leftTrapping = p.leftFoot.animTimer > 0 && p.leftFoot.animType === "trap";
      const rightTrapping = p.rightFoot.animTimer > 0 && p.rightFoot.animType === "trap";
      
      // Draw each boot with spike detail
      [{ fp: leftFootPos, kicking: leftKicking, trapping: leftTrapping, foot: p.leftFoot, side: "L" },
       { fp: rightFootPos, kicking: rightKicking, trapping: rightTrapping, foot: p.rightFoot, side: "R" }].forEach(({ fp, kicking, trapping, foot, side }) => {
        const bootY = fp.y - footH/2 + unit*1.5;
        const kickGlow = kicking ? 0.5 : 0;
        
        // Socks (shin guard area above boot)
        drawPixelRect(fp.x - unit*0.8, bootY - unit*1.4, unit*1.6, unit*1.4, sockColor);
        
        // Boot upper (main body)
        drawPixelRect(fp.x - footW/2, bootY, footW, footH, bootColor);
        // Boot highlight stripe (top edge)
        drawPixelRect(fp.x - footW/2, bootY, footW, Math.max(1, unit*0.3), bootHighlight);
        // Lace detail (center dots)
        drawPixelRect(fp.x - unit*0.3, bootY + unit*0.1, unit*0.6, unit*0.4, laceColor);
        
        // Sole plate (dark bottom)
        drawPixelRect(fp.x - footW/2, bootY + footH, footW, Math.max(1, unit*0.4), soleColor);
        
        // Studs (3 small rectangles under sole)
        for (let s = 0; s < 3; s++) {
          const sx = fp.x - footW/2 + (footW * (s + 0.5) / 3) - unit*0.2;
          drawPixelRect(sx, bootY + footH + unit*0.4, Math.max(1, unit*0.4), studH, studColor);
        }
        
        // Kick glow effect - highlight the kicking foot
        if (kicking) {
          ctx.fillStyle = `rgba(255,255,100,${kickGlow})`;
          ctx.fillRect(fp.x - footW/2 - 1, bootY - 1, footW + 2, footH + 2);
        }
        
        // ★ v9.17.0: Trap animation - much more visible with expanding ring and foot label
        if (trapping && foot.animTimer > 0) {
          const trapAlpha = Math.min(1.0, foot.animTimer / 0.20); // Slower fade
          const isBadTrap = st.ball.free && st.ball.lastTouchTeam === p.team;
          const expandT = 1.0 - foot.animTimer / 0.30; // 0→1 as animation progresses
          const ringRadius = unit * (3.0 + expandT * 4.0); // Expanding ring
          
          if (isBadTrap) {
            // Bad trap: large red flash with expanding ring
            ctx.fillStyle = `rgba(255,60,30,${trapAlpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(fp.x, bootY + footH/2, ringRadius, 0, Math.PI * 2);
            ctx.fill();
            // Red expanding ring
            ctx.strokeStyle = `rgba(255,80,40,${trapAlpha * 0.8})`;
            ctx.lineWidth = Math.max(2, unit * 0.5);
            ctx.beginPath();
            ctx.arc(fp.x, bootY + footH/2, ringRadius * 1.3, 0, Math.PI * 2);
            ctx.stroke();
            // "MISS" text
            ctx.fillStyle = `rgba(255,100,50,${trapAlpha})`;
            ctx.font = `bold ${Math.max(6, unit * 2.5)}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText("MISS", fp.x, bootY - unit * 2);
          } else {
            // Good trap: bright cyan circle with expanding ring
            ctx.fillStyle = `rgba(0,220,255,${trapAlpha * 0.4})`;
            ctx.beginPath();
            ctx.arc(fp.x, bootY + footH/2, ringRadius, 0, Math.PI * 2);
            ctx.fill();
            // Cyan expanding ring
            ctx.strokeStyle = `rgba(0,255,220,${trapAlpha * 0.7})`;
            ctx.lineWidth = Math.max(2, unit * 0.5);
            ctx.beginPath();
            ctx.arc(fp.x, bootY + footH/2, ringRadius * 1.3, 0, Math.PI * 2);
            ctx.stroke();
            // Foot label (L or R)
            ctx.fillStyle = `rgba(0,255,200,${trapAlpha})`;
            ctx.font = `bold ${Math.max(6, unit * 2.5)}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText(side, fp.x, bootY - unit * 2);
          }
        }
      });
    }
    
    // === BODY (torso - shirt) ===
    const bodyW = unit * 4;
    const bodyH = unit * 3;
    // Main shirt
    drawPixelRect(pos.x - bodyW/2, pos.y - unit*1.5, bodyW, bodyH, shirtColor);
    // Shirt highlight (left side light)
    drawPixelRect(pos.x - bodyW/2, pos.y - unit*1.5, unit*1.2, bodyH - unit*0.5, shirtHighlight);
    // Shirt shadow (right side)
    drawPixelRect(pos.x + bodyW/2 - unit*1.0, pos.y - unit*0.5, unit*1.0, bodyH - unit*1.0, shirtShadow);
    
    // Shorts
    drawPixelRect(pos.x - bodyW/2 + unit*0.3, pos.y + unit*1.5, bodyW - unit*0.6, unit*1.5, shortsColor);
    
    // === HEAD ===
    const headW = unit * 2.8;
    const headH = unit * 2.5;
    // Hair (behind head)
    drawPixelRect(pos.x - headW/2 - unit*0.2, pos.y - unit*4.2, headW + unit*0.4, unit*1.5, hairColor);
    // Face/skin
    drawPixelRect(pos.x - headW/2, pos.y - unit*3.8, headW, headH, skinColor);
    // Face shadow
    drawPixelRect(pos.x + headW/2 - unit*0.8, pos.y - unit*3.0, unit*0.8, unit*1.5, skinShadow);
    
    // === JERSEY NUMBER (on shirt) ===
    // ★ v11.5.0: Responsive font sizes - portrait mode uses larger relative sizes
    ctx.fillStyle = "#ffffff";
    // Portrait: unit is smaller, so boost font size for readability
    const numFontScale = isPortrait ? 2.6 : 2.2;
    const fontSize = Math.max(isPortrait ? 5 : 6, unit * numFontScale);
    ctx.font = `bold ${fontSize}px ${RETRO_FONT}, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.num.toString(), pos.x, pos.y + unit*0.2);

    // ★ v10.1.0: Show player name from gacha card below the sprite
    // ★ v11.5.0: Portrait mode - show name only for ball holder or GK to reduce clutter
    const showName = p.cardName && (!isPortrait || st.ball.owner === p.slot + (p.team===1?11:0) || p.isGK);
    if (showName) {
      const nameFontScale = isPortrait ? 1.6 : 1.4;
      const nameFontSize = Math.max(isPortrait ? 4 : 5, unit * nameFontScale);
      ctx.font = `bold ${nameFontSize}px 'DotGothic16', monospace`;
      ctx.fillStyle = isBlue ? '#88ccff' : '#ffaaaa';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      // Portrait: show up to 5 chars; landscape: 4 chars
      const maxChars = isPortrait ? 5 : 4;
      const displayName = p.cardName!.length > maxChars ? p.cardName!.slice(0, maxChars) : p.cardName!;
      ctx.fillText(displayName, pos.x, pos.y + unit * 3.5);
    }
    
    // ★ v11.16.0: Set piece motion overlays (throw-in arms / kick windup)
    const sp = st.setPieceRestart;
    if (sp && sp.takerIdx >= 0 && st.pl[sp.takerIdx].idx === p.idx) {
      // This player is the set piece taker
      if (sp.kind === "THROWIN" && (sp.phase === "windup" || sp.phase === "kick")) {
        // Throw-in: draw raised arms above head
        const armRaise = sp.throwArmAngle; // 0=down, 1=fully raised
        const armW = Math.max(2, unit * 1.2);
        const armH = Math.max(3, unit * 2.5);
        const armY = pos.y - unit * 1.5; // Start at shoulder height
        // Left arm (raised diagonally)
        const leftArmEndX = pos.x - unit * 2.0 * (1 - armRaise * 0.5);
        const leftArmEndY = armY - armH * armRaise;
        ctx.save();
        ctx.strokeStyle = skinColor;
        ctx.lineWidth = Math.max(2, unit * 1.4);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pos.x - unit * 1.5, armY);
        ctx.lineTo(leftArmEndX, leftArmEndY);
        ctx.stroke();
        // Right arm
        const rightArmEndX = pos.x + unit * 2.0 * (1 - armRaise * 0.5);
        const rightArmEndY = armY - armH * armRaise;
        ctx.beginPath();
        ctx.moveTo(pos.x + unit * 1.5, armY);
        ctx.lineTo(rightArmEndX, rightArmEndY);
        ctx.stroke();
        // Hands at top (small circles)
        if (armRaise > 0.5) {
          ctx.fillStyle = skinColor;
          ctx.beginPath();
          ctx.arc(leftArmEndX, leftArmEndY, Math.max(2, unit * 0.8), 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(rightArmEndX, rightArmEndY, Math.max(2, unit * 0.8), 0, Math.PI * 2);
          ctx.fill();
          // Ball held above head
          const ballAboveY = leftArmEndY - unit * 1.5;
          const ballAboveX = (leftArmEndX + rightArmEndX) / 2;
          const ballAboveR = Math.max(3, unit * 1.5);
          ctx.fillStyle = "#f8f8f8";
          ctx.beginPath();
          ctx.arc(ballAboveX, ballAboveY, ballAboveR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#303030";
          ctx.lineWidth = Math.max(1, ballAboveR * 0.2);
          ctx.stroke();
        }
        ctx.restore();
      } else if ((sp.kind === "GOALKICK" || sp.kind === "CORNER") && (sp.phase === "windup" || sp.phase === "kick")) {
        // Kick windup: draw kicking leg raised back
        const kickProgress = sp.kickRunProgress; // 0=start, 1=kick
        const legSwing = Math.sin(kickProgress * Math.PI); // 0->1->0 swing
        const legW = Math.max(2, unit * 1.4);
        const legH = Math.max(4, unit * 2.8);
        const legY = pos.y + unit * 1.5; // Hip height
        // Kicking leg swings back then forward
        const kickLegX = pos.x + (p.isBlue ? -1 : 1) * unit * 1.5;
        const kickLegEndX = kickLegX + legSwing * unit * 2.5 * (p.isBlue ? -1 : 1);
        const kickLegEndY = legY + legH * (1 - legSwing * 0.5);
        ctx.save();
        ctx.strokeStyle = shortsColor;
        ctx.lineWidth = legW;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(kickLegX, legY);
        ctx.lineTo(kickLegEndX, kickLegEndY);
        ctx.stroke();
        // Boot at end of kicking leg
        ctx.fillStyle = bootColor;
        ctx.fillRect(kickLegEndX - unit, kickLegEndY - unit * 0.5, unit * 2.5, unit * 1.2);
        // Glow on kicking foot
        if (sp.phase === "kick") {
          ctx.fillStyle = "rgba(255,255,100,0.6)";
          ctx.beginPath();
          ctx.arc(kickLegEndX, kickLegEndY, unit * 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      
      // Phase label above taker
      if (sp.phase === "walk" || sp.phase === "setup") {
        const labelFontSize = Math.max(5, unit * 1.8);
        ctx.save();
        ctx.font = `bold ${labelFontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const phaseLabel = sp.phase === "walk" ? "..." : "●";
        ctx.fillStyle = isBlue ? "rgba(100,200,255,0.9)" : "rgba(255,150,100,0.9)";
        ctx.fillText(phaseLabel, pos.x, pos.y - unit * 5.5);
        ctx.restore();
      }
    }
  });

  // 7. ボール (SFC-style with Z-axis height visualization)
  const bp = w2s(st.ball.pos);
  const br = sval(P.ballRadius);
  const ballZ = st.ball.z || 0;
  const ballLift = sval(ballZ * 0.5); // Visual lift for Z-axis (0.5m per meter height)
  
  // Ground shadow (gets smaller and lighter as ball goes higher)
  const shadowScale = Math.max(0.3, 1.0 - ballZ * 0.1);
  const shadowAlpha = Math.max(0.1, 0.5 - ballZ * 0.05);
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(bp.x, bp.y + br*0.5, br * shadowScale, br * 0.5 * shadowScale, 0, 0, Math.PI*2);
  ctx.fill();

  // Ball (lifted by Z-axis)
  const ballY = bp.y - ballLift;
  const ballR = Math.max(2, br * 1.1);
  
  // SFC-style ball: white pentagon pattern
  ctx.beginPath();
  ctx.arc(bp.x, ballY, ballR, 0, Math.PI*2);
  ctx.fillStyle = "#f8f8f8";
  ctx.fill();
  ctx.strokeStyle = "#303030"; ctx.lineWidth = Math.max(1, ballR * 0.15); ctx.stroke();
  
  // Pentagon pattern (simplified SFC-style)
  const penR = ballR * 0.35;
  // Rotate pentagon pattern based on spin
  const spinAngle = (st.ball.spinX || 0) * st.time * 0.5;
  ctx.fillStyle = "#202020";
  // Center pentagon
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = spinAngle + (i / 5) * Math.PI * 2 - Math.PI/2;
    const px = bp.x + Math.cos(a) * penR;
    const py = ballY + Math.sin(a) * penR;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // Side pentagons (smaller)
  for (let j = 0; j < 5; j++) {
    const baseA = spinAngle + (j / 5) * Math.PI * 2 - Math.PI/2;
    const cx = bp.x + Math.cos(baseA) * ballR * 0.65;
    const cy = ballY + Math.sin(baseA) * ballR * 0.65;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = spinAngle + (i / 5) * Math.PI * 2;
      const px = cx + Math.cos(a) * penR * 0.5;
      const py = cy + Math.sin(a) * penR * 0.5;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 8. GOAL! フラッシュ
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,220,${Math.min(0.8, st.flash * 0.5)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${st.flash})`;
    ctx.font = `italic 900 ${Math.max(30, w * 0.06)}px ${RETRO_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(st.flashTxt, ox, oy);
  }

  // 9. SFC-style HUD (responsive) - v11.4.0: Responsive for portrait/landscape
  // Layout: [BLU label | BLU score | dash | RED score | RED label] top row
  //         [MM:SS  |  1ST/2ND] bottom tab
  const hudW = Math.min(w * 0.80, Math.max(180, sval(26)));
  const hudRowH = Math.max(24, Math.min(h * 0.06, 40));  // Top row height
  const tabH = Math.max(18, Math.min(h * 0.04, 28));     // Bottom tab height
  const hx = (w - hudW) / 2;
  const hy = Math.max(4, (hudReserve - hudRowH - tabH) / 2);

  // Top row background
  ctx.fillStyle = RETRO_DARK;
  ctx.fillRect(hx, hy, hudW, hudRowH);
  ctx.strokeStyle = RETRO_GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(hx, hy, hudW, hudRowH);

  // Team color bars (left=blue, right=red)
  ctx.fillStyle = "#2563eb"; ctx.fillRect(hx, hy, 5, hudRowH);
  ctx.fillStyle = "#dc2626"; ctx.fillRect(hx + hudW - 5, hy, 5, hudRowH);

  // Font sizes for top row
  const labelFontSize = Math.max(6, hudRowH * 0.30);
  const scoreFontSize = Math.max(10, hudRowH * 0.52);
  const centerX = w / 2;

  // BLU label (left side)
  ctx.fillStyle = "#60a5fa";
  ctx.font = `${labelFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("BLU", hx + 10, hy + hudRowH * 0.62);

  // Blue score
  ctx.fillStyle = RETRO_WHITE;
  ctx.font = `${scoreFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${st.scoreBlue}`, centerX - scoreFontSize * 0.7, hy + hudRowH * 0.72);

  // Dash separator
  ctx.fillStyle = RETRO_WHITE;
  ctx.textAlign = "center";
  ctx.fillText("-", centerX, hy + hudRowH * 0.72);

  // Red score
  ctx.fillStyle = RETRO_WHITE;
  ctx.textAlign = "left";
  ctx.fillText(`${st.scoreRed}`, centerX + scoreFontSize * 0.3, hy + hudRowH * 0.72);

  // RED label (right side)
  ctx.fillStyle = "#f87171";
  ctx.font = `${labelFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("RED", hx + hudW - 10, hy + hudRowH * 0.62);

  // Bottom tab: timer + half indicator side by side
  const tabW = Math.max(100, hudW * 0.38);
  const tabX = w / 2 - tabW / 2;
  const tabY = hy + hudRowH;
  ctx.fillStyle = RETRO_DARK;
  ctx.fillRect(tabX, tabY, tabW, tabH);
  ctx.strokeStyle = RETRO_GOLD;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tabX, tabY, tabW, tabH);

  // Timer (left side of tab)
  const matchMin = Math.floor(st.matchClock || 0);
  const matchSec = Math.floor(((st.matchClock || 0) % 1) * 60);
  const timerFontSize = Math.max(7, tabH * 0.52);
  ctx.fillStyle = RETRO_GREEN;
  ctx.font = `${timerFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(`${matchMin.toString().padStart(2,'0')}:${matchSec.toString().padStart(2,'0')}`, tabX + 8, tabY + tabH * 0.72);

  // Half indicator (right side of tab)
  const halfText = st.matchPhase === "halftime" ? "HT" : st.matchPhase === "fulltime" ? "FT" : st.half === 1 ? "1ST" : "2ND";
  const halfFontSize = Math.max(6, tabH * 0.44);
  ctx.fillStyle = RETRO_GOLD;
  ctx.font = `${halfFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(halfText, tabX + tabW - 8, tabY + tabH * 0.72);

  // ★ v9.9.0: SFC-style Action Log overlay (bottom-left)
  if (st.actionLog && st.actionLog.length > 0) {
    ctx.save();
    // ★ v10.7.0: Enlarged log box for better readability
    const logFontSize = Math.max(9, Math.min(14, w * 0.014));
    const logLineH = logFontSize * 1.7;
    const logPadX = 10;
    const logPadY = 6;
    const maxVisible = Math.min(8, st.actionLog.length);
    const visibleLogs = st.actionLog.slice(-maxVisible);
    
    // ★ v11.4.0: Log panel - responsive, anchored to bottom of pitch area
    const logPanelW = w - 16;  // 画面ほぼ全幅（左右8pxマージン）
    const logPanelH = maxVisible * logLineH + logPadY * 2;
    const logX = 8;
    // Position log just below pitch area (within logReserve zone)
    const pitchBottom = oy + sval(P.pitchHalfH);
    const logY = Math.max(pitchBottom + 4, h - logPanelH - 44); // Below pitch or above control bar
    
    // Semi-transparent background with retro border
    ctx.fillStyle = "rgba(10, 10, 20, 0.82)";
    ctx.fillRect(logX, logY, logPanelW, logPanelH);
    ctx.strokeStyle = "rgba(245, 197, 66, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(logX, logY, logPanelW, logPanelH);
    
    // Scanline effect on log panel
    for (let sy = logY; sy < logY + logPanelH; sy += 3) {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(logX, sy, logPanelW, 1);
    }
    
    ctx.font = `${logFontSize}px ${RETRO_FONT}`;
    ctx.textAlign = "left";
    
    for (let i = 0; i < visibleLogs.length; i++) {
      const entry = visibleLogs[i];
      const fadeAlpha = Math.min(1.0, entry.ttl / 1.0); // Fade out in last 1s
      const lineY = logY + logPadY + (i + 0.75) * logLineH;
      
      // Team color indicator bar
      const teamColor = entry.team === -1 ? "rgba(59,130,246," : "rgba(239,68,68,";
      ctx.fillStyle = teamColor + (fadeAlpha * 0.8) + ")";
      ctx.fillRect(logX + 2, lineY - logFontSize * 0.6, 3, logFontSize * 0.8);
      
      // Excitement-based text color
      let textColor: string;
      if (entry.excitement >= 3) {
        // Spectacular: gold with glow pulse
        const pulse = 0.7 + 0.3 * Math.sin(st.time * 8);
        textColor = `rgba(245,197,66,${fadeAlpha * pulse})`;
      } else if (entry.excitement >= 2) {
        // Exciting: bright accent
        textColor = `rgba(233,69,96,${fadeAlpha})`;
      } else if (entry.excitement >= 1) {
        // Notable: green
        textColor = `rgba(22,196,127,${fadeAlpha})`;
      } else {
        // Normal: white
        textColor = `rgba(200,200,210,${fadeAlpha * 0.85})`;
      }
      
      ctx.fillStyle = textColor;
      
      // Truncate text to fit panel
      let text = entry.detail;
      while (ctx.measureText(text).width > logPanelW - logPadX * 2 - 10 && text.length > 5) {
        text = text.slice(0, -2);
      }
      
      ctx.fillText(text, logX + logPadX + 6, lineY);
    }
    
    ctx.restore();
  }
  
  // ★ v9.11.0: Screen effect overlay (dribble breakthrough, goals)
  if (st.screenEffect && st.screenEffect.timer > 0) {
    ctx.save();
    const eff = st.screenEffect;
    const progress = 1.0 - (eff.timer / (eff.type === "goal" ? 2.5 : 1.5));
    
    if (eff.type === "dribbleSuccess") {
      // Flash overlay - quick white flash that fades
      if (progress < 0.15) {
        const flashAlpha = (1.0 - progress / 0.15) * 0.4;
        ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
      
      // Speed lines radiating from center
      if (progress < 0.6) {
        const lineAlpha = (1.0 - progress / 0.6) * 0.3;
        ctx.strokeStyle = `rgba(255, 220, 100, ${lineAlpha})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + st.time * 3;
          const innerR = w * 0.15 * progress;
          const outerR = w * 0.5 * (0.3 + progress * 0.7);
          ctx.beginPath();
          ctx.moveTo(w/2 + Math.cos(angle) * innerR, h/2 + Math.sin(angle) * innerR);
          ctx.lineTo(w/2 + Math.cos(angle) * outerR, h/2 + Math.sin(angle) * outerR);
          ctx.stroke();
        }
      }
      
      // Big text with shake effect
      const textAlpha = progress < 0.1 ? progress / 0.1 : progress > 0.7 ? (1.0 - progress) / 0.3 : 1.0;
      const shakeX = progress < 0.3 ? (Math.random() - 0.5) * 4 : 0;
      const shakeY = progress < 0.3 ? (Math.random() - 0.5) * 4 : 0;
      const fontSize = Math.max(16, Math.min(36, w * 0.04));
      const scale = progress < 0.15 ? 1.0 + (1.0 - progress / 0.15) * 0.5 : 1.0;
      
      ctx.font = `bold ${fontSize * scale}px ${RETRO_FONT}`;
      ctx.textAlign = "center";
      // Text shadow
      ctx.fillStyle = `rgba(0, 0, 0, ${textAlpha * 0.8})`;
      ctx.fillText(eff.text, w/2 + shakeX + 2, h * 0.35 + shakeY + 2);
      // Main text - team color
      const teamGold = eff.team === -1 ? `rgba(96, 165, 250, ${textAlpha})` : `rgba(248, 113, 113, ${textAlpha})`;
      ctx.fillStyle = teamGold;
      ctx.fillText(eff.text, w/2 + shakeX, h * 0.35 + shakeY);
      // Gold outline
      ctx.strokeStyle = `rgba(245, 197, 66, ${textAlpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.strokeText(eff.text, w/2 + shakeX, h * 0.35 + shakeY);
    } else if (eff.type === "goal") {
      // Goal: dramatic full-screen flash
      if (progress < 0.1) {
        const flashAlpha = (1.0 - progress / 0.1) * 0.6;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
      
      // Pulsing border glow
      const pulseAlpha = 0.2 + 0.15 * Math.sin(st.time * 10);
      const borderW = 6;
      ctx.strokeStyle = `rgba(245, 197, 66, ${pulseAlpha})`;
      ctx.lineWidth = borderW;
      ctx.strokeRect(borderW/2, borderW/2, w - borderW, h - borderW);
      
      // Big GOAL text
      const goalAlpha = progress < 0.08 ? progress / 0.08 : progress > 0.8 ? (1.0 - progress) / 0.2 : 1.0;
      const goalSize = Math.max(24, Math.min(56, w * 0.06));
      const goalScale = progress < 0.12 ? 1.0 + (1.0 - progress / 0.12) * 0.8 : 1.0;
      const goalShakeX = progress < 0.2 ? (Math.random() - 0.5) * 6 : 0;
      const goalShakeY = progress < 0.2 ? (Math.random() - 0.5) * 6 : 0;
      
      ctx.font = `bold ${goalSize * goalScale}px ${RETRO_FONT}`;
      ctx.textAlign = "center";
      // Shadow
      ctx.fillStyle = `rgba(0, 0, 0, ${goalAlpha * 0.9})`;
      ctx.fillText(eff.text, w/2 + goalShakeX + 3, h * 0.4 + goalShakeY + 3);
      // Main text gold
      ctx.fillStyle = `rgba(245, 197, 66, ${goalAlpha})`;
      ctx.fillText(eff.text, w/2 + goalShakeX, h * 0.4 + goalShakeY);
    } else if (eff.type === "none" && (eff.text === "HALF TIME" || eff.text === "FULL TIME")) {
      // ★ v9.22.0: Halftime / Fulltime overlay
      // Dark overlay
      ctx.fillStyle = `rgba(0, 0, 0, 0.7)`;
      ctx.fillRect(0, 0, w, h);
      
      // Main text
      const htSize = Math.max(20, Math.min(48, w * 0.05));
      ctx.font = `bold ${htSize}px ${RETRO_FONT}`;
      ctx.textAlign = "center";
      // Shadow
      ctx.fillStyle = `rgba(0, 0, 0, 0.9)`;
      ctx.fillText(eff.text, w/2 + 3, h * 0.38 + 3);
      // Main text - white
      ctx.fillStyle = RETRO_WHITE;
      ctx.fillText(eff.text, w/2, h * 0.38);
      // Gold underline
      ctx.strokeStyle = RETRO_GOLD;
      ctx.lineWidth = 3;
      const textW = ctx.measureText(eff.text).width;
      ctx.beginPath();
      ctx.moveTo(w/2 - textW/2, h * 0.38 + 8);
      ctx.lineTo(w/2 + textW/2, h * 0.38 + 8);
      ctx.stroke();
      
      // Score display below
      const scoreSize = Math.max(16, Math.min(36, w * 0.04));
      ctx.font = `bold ${scoreSize}px ${RETRO_FONT}`;
      ctx.fillStyle = "#60a5fa";
      ctx.textAlign = "right";
      ctx.fillText(`BLU`, w/2 - scoreSize * 1.5, h * 0.50);
      ctx.fillStyle = RETRO_WHITE;
      ctx.textAlign = "center";
      ctx.fillText(`${st.scoreBlue} - ${st.scoreRed}`, w/2, h * 0.50);
      ctx.fillStyle = "#f87171";
      ctx.textAlign = "left";
      ctx.fillText(`RED`, w/2 + scoreSize * 1.5, h * 0.50);
      
      // Subtitle
      if (eff.text === "HALF TIME") {
        const subSize = Math.max(8, Math.min(16, w * 0.016));
        ctx.font = `${subSize}px ${RETRO_FONT}`;
        ctx.fillStyle = RETRO_GOLD;
        ctx.textAlign = "center";
        ctx.fillText("SIDES CHANGING...", w/2, h * 0.58);
      } else {
        const subSize = Math.max(8, Math.min(16, w * 0.016));
        ctx.font = `${subSize}px ${RETRO_FONT}`;
        ctx.fillStyle = RETRO_GOLD;
        ctx.textAlign = "center";
        const winner = st.scoreBlue > st.scoreRed ? "BLU WINS!" : st.scoreRed > st.scoreBlue ? "RED WINS!" : "DRAW";
        ctx.fillText(winner, w/2, h * 0.58);
      }
    }
    
    ctx.restore();
  }
};

// ============================================================
// Speed Toggle Button (SFC retro style)
// ============================================================
// ★ v11.18.0: 6-stage speed modes (added VSLOW)
const SPEED_MODES: SpeedMode[] = ["REAL", "VSLOW", "LOW", "MID", "FAST", "VFAST"];
const SPEED_LABELS: Record<SpeedMode, string> = {
  REAL:  "REAL",
  VSLOW: "V.SLOW",   // ★ v11.18.0: Very slow x0.10
  LOW:   "SLOW",
  MID:   "NORMAL",
  FAST:  "FAST",
  VFAST: "V.FAST",
};
const SPEED_COLORS: Record<SpeedMode, string> = {
  REAL:  "#a78bfa",  // Soft purple for real-time
  VSLOW: "#38bdf8",  // ★ v11.18.0: Light blue for very slow
  LOW:   "#60a5fa",  // Blue for slow
  MID:   RETRO_GREEN, // Green for normal
  FAST:  RETRO_ACCENT, // Orange for fast
  VFAST: "#f87171",  // Red for very fast
};

function SpeedToggle({ speed, onToggle, onSetMode }: { speed: SpeedMode; onToggle: () => void; onSetMode: (m: SpeedMode) => void }) {
  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
      {SPEED_MODES.map(mode => {
        const isActive = speed === mode;
        return (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            style={{
              background: isActive ? SPEED_COLORS[mode] : RETRO_DARK,
              border: `1.5px solid ${SPEED_COLORS[mode]}`,
              color: isActive ? "#000" : SPEED_COLORS[mode],
              fontFamily: RETRO_FONT,
              fontSize: "clamp(4px, 0.85vw, 8px)",
              padding: "clamp(2px, 0.5vh, 5px) clamp(3px, 0.8vw, 7px)",
              cursor: "pointer",
              letterSpacing: "0.5px",
              transition: "background 0.15s, color 0.15s",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
              opacity: isActive ? 1.0 : 0.55,
              fontWeight: isActive ? "bold" : "normal",
            }}
          >
            {SPEED_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Game Screen (canvas-based simulation) - fully responsive
// ============================================================
function GameScreen({ blueFormation, redFormation, onBack, blueCards, redCards, onCoinsEarned }: {
  blueFormation: FormationId;
  redFormation: FormationId;
  onBack: () => void;
  blueCards?: (CardPlayerData | null)[];
  redCards?: (CardPlayerData | null)[];
  onCoinsEarned?: (coins: number) => void;
}) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(
    blueCards && redCards
      ? mkCustomState(blueFormation, redFormation, blueCards, redCards)
      : mkState(blueFormation, redFormation)
  );
  const reqRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [speed, setSpeed] = useState<SpeedMode>("MID");
  const [showResult, setShowResult] = useState(false);
  const resultShownRef = useRef(false);

  // Sync speed to state ref
  useEffect(() => {
    stRef.current.speed = speed;
  }, [speed]);

  // ★ v11.6.0: Each button directly sets the speed mode
  const toggleSpeed = useCallback(() => {
    // Cycle through modes (for single-button fallback)
    setSpeed(prev => {
      const idx = SPEED_MODES.indexOf(prev);
      return SPEED_MODES[(idx + 1) % SPEED_MODES.length];
    });
  }, []);
  
  const setSpeedMode = useCallback((mode: SpeedMode) => {
    setSpeed(mode);
  }, []);

  useEffect(() => {
    const canvas = cvsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    doKickOff(stRef.current);

    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      
      // ★ v11.4.0: Fix DPR accumulation bug - reset canvas size before scaling
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = vw + "px";
      canvas.style.height = vh + "px";
      
      // ★ v11.4.0: Get fresh context reference and reset transform before scaling
      const ctx2 = canvas.getContext('2d');
      if (ctx2) {
        ctx2.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx2.scale(dpr, dpr);
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const elapsed = (t - lastTimeRef.current) / 1000;
      lastTimeRef.current = t;
      
      // ★ v11.6.0: dt cap - 0.05s (20fps minimum) for all speed modes
      // REAL mode: speedMul=1.0, so dt*1.0 = real elapsed time (true 1:1 simulation)
      // VFAST mode: speedMul=45, so dt*45 = 45x compressed time per frame
      const dt = Math.min(0.05, elapsed); 

      if (dt > 0.001) {
        update(stRef.current, dt);
        render(ctx, canvas, stRef.current);
        // ★ v10.2.0: Detect fulltime and show result screen after overlay fades
        if (stRef.current.matchPhase === "fulltime" && !resultShownRef.current) {
          if (stRef.current.screenEffect && stRef.current.screenEffect.timer <= 0) {
            resultShownRef.current = true;
            // Small delay to let the final frame render
            setTimeout(() => setShowResult(true), 800);
          }
        }
      }
      reqRef.current = requestAnimationFrame(loop);
    };
    
    reqRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [blueFormation, redFormation]);

  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      width: "100vw", 
      height: "100dvh", 
      background: "#0a0a10",
      overflow: "hidden",
      position: "relative",
    }}>
      <canvas 
        ref={cvsRef}
        style={{ 
          display: "block", 
          background: "#0a0a10", 
          touchAction: "none" 
        }}
      />
      {/* Bottom control bar */}
      <div style={{
        position: "absolute",
        bottom: "clamp(8px, 2vh, 16px)",
        left: "clamp(8px, 2vw, 16px)",
        right: "clamp(8px, 2vw, 16px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 20,
        pointerEvents: "none",
      }}>
        {/* Menu button */}
        <button
          onClick={onBack}
          style={{
            background: RETRO_DARK,
            border: `2px solid ${RETRO_GOLD}`,
            color: RETRO_GOLD,
            fontFamily: RETRO_FONT,
            fontSize: "clamp(5px, 1vw, 9px)",
            padding: "clamp(3px, 0.6vh, 6px) clamp(6px, 1.5vw, 12px)",
            cursor: "pointer",
            letterSpacing: "1px",
            pointerEvents: "auto",
            lineHeight: 1.2,
          }}
        >
          ◀ MENU
        </button>

        {/* Speed toggle */}
        <div style={{ pointerEvents: "auto" }}>
          <SpeedToggle speed={speed} onToggle={toggleSpeed} onSetMode={setSpeedMode} />
        </div>
      </div>
      {/* ★ v10.2.0: Match Result Screen */}
      {showResult && (
        <MatchResultScreen
          state={stRef.current}
          onClose={onBack}
          onCoinsEarned={onCoinsEarned}
        />
      )}
    </div>
  );
}

// ============================================================
// React コンポーネント本体
// ============================================================
export default function Home() {
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<"start" | "game">("start");
  const [blueFormation, setBlueFormation] = useState<FormationId>("4-4-2");
  const [redFormation, setRedFormation] = useState<FormationId>("4-4-2");
  const [customBlueCards, setCustomBlueCards] = useState<(CardPlayerData | null)[] | undefined>(undefined);
  const [customRedCards, setCustomRedCards] = useState<(CardPlayerData | null)[] | undefined>(undefined);

  const { blueTeam, redTeam, addCoins } = useCollection();

  const handleCoinsEarned = useCallback((coins: number) => {
    addCoins(coins);
  }, [addCoins]);

  // Check for custom match mode from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'custom') {
      // Load team data from useCollection
      const blueCards: (CardPlayerData | null)[] = blueTeam.slots.map(s => {
        if (!s) return null;
        return {
          name: s.card.nameJa,
          nameEn: s.card.name,
          overall: s.card.overall,
          rarity: s.card.rarity,
          stats: s.card.stats,
          position: s.card.position,
          foot: s.card.positionDetail?.foot,
        };
      });
      const redCards: (CardPlayerData | null)[] = redTeam.slots.map(s => {
        if (!s) return null;
        return {
          name: s.card.nameJa,
          nameEn: s.card.name,
          overall: s.card.overall,
          rarity: s.card.rarity,
          stats: s.card.stats,
          position: s.card.position,
          foot: s.card.positionDetail?.foot,
        };
      });

      setCustomBlueCards(blueCards);
      setCustomRedCards(redCards);
      setBlueFormation(blueTeam.formationId as FormationId);
      setRedFormation(redTeam.formationId as FormationId);
      setScreen("game");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = useCallback((bf: FormationId, rf: FormationId) => {
    setBlueFormation(bf);
    setRedFormation(rf);
    setCustomBlueCards(undefined);
    setCustomRedCards(undefined);
    setScreen("game");
  }, []);

  const handleBack = useCallback(() => {
    // If custom match, go back to team builder
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'custom') {
      setLocation('/team-builder');
    } else {
      setScreen("start");
    }
  }, [setLocation]);

  if (screen === "start") {
    return <StartScreen onStart={handleStart} />;
  }

  return <GameScreen
    blueFormation={blueFormation}
    redFormation={redFormation}
    onBack={handleBack}
    blueCards={customBlueCards}
    redCards={customRedCards}
    onCoinsEarned={handleCoinsEarned}
  />;
}
