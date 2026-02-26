import { useEffect, useRef, useState, useCallback } from 'react';

// --- game/ モジュールから必要なものをすべてインポート ---
import { State, V } from '../game/types';
import { P, FormationId, FORMATION_IDS, FORMATIONS } from '../game/constants';
import { v, vadd, vscl } from '../game/math';
import { mkState, doKickOff, update } from '../game/engine';

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
// Formation Preview (mini pitch with dots)
// ============================================================
function FormationPreview({ formationId, teamColor, mirror }: { formationId: FormationId; teamColor: string; mirror: boolean }) {
  const def = FORMATIONS[formationId];
  const pw = 140;
  const ph = 90;
  const mx = 10;
  const my = 10;

  return (
    <svg width={pw + mx * 2} height={ph + my * 2} style={{ display: "block", margin: "0 auto" }}>
      {/* Mini pitch */}
      <rect x={mx} y={my} width={pw} height={ph} fill="#145e30" stroke="#2a8c4a" strokeWidth={1.5} rx={3} />
      {/* Center line */}
      <line x1={mx + pw / 2} y1={my} x2={mx + pw / 2} y2={my + ph} stroke="#2a8c4a" strokeWidth={1} />
      {/* Center circle */}
      <circle cx={mx + pw / 2} cy={my + ph / 2} r={10} fill="none" stroke="#2a8c4a" strokeWidth={1} />
      {/* Players */}
      {def.positions.map((pos, i) => {
        // Normalize positions to fit mini pitch
        // Original coords: x in [-48, -5], y in [-28, 28]
        const nx = (pos.x + 52.5) / 105; // 0..1
        const ny = (pos.y + 34) / 68;    // 0..1
        const px = mirror ? mx + pw - nx * pw : mx + nx * pw;
        const py = my + ny * ph;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={i === 0 ? 5 : 4} fill={teamColor} stroke="white" strokeWidth={1} />
            <text x={px} y={py + 1} textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="5" fontFamily={RETRO_FONT}>{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// SFC-Style Start Screen
// ============================================================
function StartScreen({ onStart }: { onStart: (blueForm: FormationId, redForm: FormationId) => void }) {
  const [blueFormation, setBlueFormation] = useState<FormationId>("4-4-2");
  const [redFormation, setRedFormation] = useState<FormationId>("4-4-2");
  const [blinkVisible, setBlinkVisible] = useState(true);
  const [selectedSide, setSelectedSide] = useState<"blue" | "red" | null>(null);

  // SFC-style blinking text
  useEffect(() => {
    const interval = setInterval(() => setBlinkVisible(v => !v), 500);
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

  // Pixel border helper
  const pixelBorder = (color: string) => `3px solid ${color}`;

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: RETRO_BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: RETRO_FONT,
      color: RETRO_WHITE,
      position: "relative",
      overflow: "hidden",
      imageRendering: "pixelated" as any,
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

      {/* Title */}
      <div style={{ position: "relative", zIndex: 5, textAlign: "center", marginBottom: "2rem" }}>
        <div style={{
          fontSize: "clamp(16px, 4vw, 36px)",
          color: RETRO_GOLD,
          textShadow: `3px 3px 0px ${RETRO_ACCENT}, -1px -1px 0px #000`,
          letterSpacing: "4px",
          marginBottom: "0.5rem",
        }}>
          SOCCER SIM
        </div>
        <div style={{
          fontSize: "clamp(6px, 1.5vw, 10px)",
          color: RETRO_GREEN,
          letterSpacing: "2px",
        }}>
          ⚽ 11 vs 11 SIMULATION ENGINE ⚽
        </div>
      </div>

      {/* Formation Selection Panel */}
      <div style={{
        position: "relative", zIndex: 5,
        display: "flex",
        gap: "clamp(8px, 3vw, 40px)",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "0 1rem",
        maxWidth: "900px",
        width: "100%",
      }}>
        {/* Blue Team */}
        <div style={{
          background: "rgba(15,52,96,0.6)",
          border: pixelBorder(selectedSide === "blue" ? RETRO_GOLD : "#2563eb"),
          padding: "clamp(8px, 2vw, 20px)",
          minWidth: "180px",
          flex: "1 1 200px",
          maxWidth: "380px",
          cursor: "pointer",
          transition: "border-color 0.2s",
        }}
          onClick={() => setSelectedSide("blue")}
        >
          <div style={{
            textAlign: "center",
            fontSize: "clamp(8px, 1.8vw, 14px)",
            color: "#60a5fa",
            marginBottom: "0.8rem",
            textShadow: "1px 1px 0px #000",
          }}>
            ▶ BLUE TEAM
          </div>

          {/* Formation selector */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "8px", marginBottom: "0.8rem",
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); setBlueFormation(f => cycleFormation(f, -1)); }}
              style={{
                background: "transparent", border: "none", color: RETRO_GOLD,
                fontSize: "clamp(14px, 2.5vw, 24px)", cursor: "pointer",
                fontFamily: RETRO_FONT,
                padding: "4px 8px",
              }}
            >◀</button>
            <div style={{
              fontSize: "clamp(10px, 2vw, 16px)",
              color: RETRO_WHITE,
              minWidth: "100px",
              textAlign: "center",
              textShadow: "1px 1px 0px #000",
            }}>
              {blueFormation}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setBlueFormation(f => cycleFormation(f, 1)); }}
              style={{
                background: "transparent", border: "none", color: RETRO_GOLD,
                fontSize: "clamp(14px, 2.5vw, 24px)", cursor: "pointer",
                fontFamily: RETRO_FONT,
                padding: "4px 8px",
              }}
            >▶</button>
          </div>

          <FormationPreview formationId={blueFormation} teamColor="#2563eb" mirror={false} />
        </div>

        {/* VS */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "clamp(12px, 3vw, 28px)",
          color: RETRO_ACCENT,
          textShadow: "2px 2px 0px #000",
          fontFamily: RETRO_FONT,
          alignSelf: "center",
          padding: "0 4px",
        }}>
          VS
        </div>

        {/* Red Team */}
        <div style={{
          background: "rgba(96,15,15,0.6)",
          border: pixelBorder(selectedSide === "red" ? RETRO_GOLD : "#dc2626"),
          padding: "clamp(8px, 2vw, 20px)",
          minWidth: "180px",
          flex: "1 1 200px",
          maxWidth: "380px",
          cursor: "pointer",
          transition: "border-color 0.2s",
        }}
          onClick={() => setSelectedSide("red")}
        >
          <div style={{
            textAlign: "center",
            fontSize: "clamp(8px, 1.8vw, 14px)",
            color: "#f87171",
            marginBottom: "0.8rem",
            textShadow: "1px 1px 0px #000",
          }}>
            RED TEAM ◀
          </div>

          {/* Formation selector */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "8px", marginBottom: "0.8rem",
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); setRedFormation(f => cycleFormation(f, -1)); }}
              style={{
                background: "transparent", border: "none", color: RETRO_GOLD,
                fontSize: "clamp(14px, 2.5vw, 24px)", cursor: "pointer",
                fontFamily: RETRO_FONT,
                padding: "4px 8px",
              }}
            >◀</button>
            <div style={{
              fontSize: "clamp(10px, 2vw, 16px)",
              color: RETRO_WHITE,
              minWidth: "100px",
              textAlign: "center",
              textShadow: "1px 1px 0px #000",
            }}>
              {redFormation}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setRedFormation(f => cycleFormation(f, 1)); }}
              style={{
                background: "transparent", border: "none", color: RETRO_GOLD,
                fontSize: "clamp(14px, 2.5vw, 24px)", cursor: "pointer",
                fontFamily: RETRO_FONT,
                padding: "4px 8px",
              }}
            >▶</button>
          </div>

          <FormationPreview formationId={redFormation} teamColor="#dc2626" mirror={true} />
        </div>
      </div>

      {/* Kick Off Button */}
      <div style={{ position: "relative", zIndex: 5, marginTop: "2rem", textAlign: "center" }}>
        <button
          onClick={() => onStart(blueFormation, redFormation)}
          style={{
            background: blinkVisible ? RETRO_ACCENT : "#b8344d",
            border: pixelBorder(RETRO_GOLD),
            color: RETRO_WHITE,
            fontFamily: RETRO_FONT,
            fontSize: "clamp(10px, 2.2vw, 18px)",
            padding: "clamp(8px, 1.5vw, 16px) clamp(20px, 4vw, 48px)",
            cursor: "pointer",
            letterSpacing: "3px",
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
        marginTop: "1.5rem",
        fontSize: "clamp(5px, 1vw, 8px)",
        color: "rgba(234,234,234,0.4)",
        letterSpacing: "1px",
      }}>
        © 2026 SOCCER SIM ENGINE v8.9.2
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
  
  const padW = 2.5; const padH = 3.5;
  const sc = Math.min(w / (P.pitchHalfW * 2 + padW), h / (P.pitchHalfH * 2 + padH));
  const ox = w / 2;
  const oy = h / 2 + 0.75 * sc;

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

  // 5. 軌跡
  if (st.trail) {
    const s = w2s(st.trail.start); const e = w2s(st.trail.end);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    if (st.trail.shot) {
      ctx.strokeStyle = "rgba(255,100,100,0.8)"; ctx.lineWidth = 4; ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 6. 選手
  st.pl.forEach(p => {
    const pos = w2s(p.pos);
    const r = sval(P.playerRadius);
    
    if (st.ball.owner === p.slot + (p.team===1?11:0)) {
       ctx.beginPath();
       ctx.arc(pos.x, pos.y, r * 1.5, 0, Math.PI*2);
       ctx.strokeStyle = p.team === -1 ? "rgba(37,99,235,0.8)" : "rgba(220,38,38,0.8)";
       ctx.lineWidth = 3;
       ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI*2);
    const grad = ctx.createRadialGradient(pos.x-r*0.3, pos.y-r*0.3, r*0.1, pos.x, pos.y, r);
    if (p.team === -1) { 
      grad.addColorStop(0, p.isGK ? "#3b82f6" : "#60a5fa"); 
      grad.addColorStop(1, p.isGK ? "#1d4ed8" : "#2563eb"); 
    } else { 
      grad.addColorStop(0, p.isGK ? "#ef4444" : "#f87171"); 
      grad.addColorStop(1, p.isGK ? "#b91c1c" : "#dc2626"); 
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Feet
    if (p.leftFoot && p.rightFoot) {
      const footR = sval(P.footSize);
      const leftFootPos = w2s(p.leftFoot.pos);
      const rightFootPos = w2s(p.rightFoot.pos);
      
      ctx.beginPath();
      ctx.arc(leftFootPos.x, leftFootPos.y, Math.max(2, footR), 0, Math.PI * 2);
      if (p.team === -1) {
        ctx.fillStyle = p.footParams.dominantFoot === "L" ? "#93c5fd" : "#1e40af";
      } else {
        ctx.fillStyle = p.footParams.dominantFoot === "L" ? "#fca5a5" : "#7f1d1d";
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(rightFootPos.x, rightFootPos.y, Math.max(2, footR), 0, Math.PI * 2);
      if (p.team === -1) {
        ctx.fillStyle = p.footParams.dominantFoot === "R" ? "#93c5fd" : "#1e40af";
      } else {
        ctx.fillStyle = p.footParams.dominantFoot === "R" ? "#fca5a5" : "#7f1d1d";
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 背番号
    ctx.fillStyle = "white";
    ctx.font = `bold ${Math.max(8, r)}px 'Roboto Condensed'`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.num.toString(), pos.x, pos.y);
  });

  // 7. ボール
  const bp = w2s(st.ball.pos);
  const br = sval(P.ballRadius);
  
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.ellipse(bp.x, bp.y + br*0.5, br, br*0.6, 0, 0, Math.PI*2); ctx.fill();

  ctx.beginPath();
  ctx.arc(bp.x, bp.y, br, 0, Math.PI*2);
  const bgrad = ctx.createRadialGradient(bp.x-br*0.3, bp.y-br*0.3, 0, bp.x, bp.y, br);
  bgrad.addColorStop(0, "white"); bgrad.addColorStop(1, "#ccc");
  ctx.fillStyle = bgrad;
  ctx.fill();
  ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.stroke();

  // 8. GOAL! フラッシュ
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,220,${Math.min(0.8, st.flash * 0.5)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${st.flash})`;
    ctx.font = `italic 900 ${Math.max(30, w * 0.06)}px ${RETRO_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(st.flashTxt, ox, oy);
  }

  // 9. SFC-style HUD
  const hudW = Math.min(w * 0.65, sval(22));
  const hudH = Math.max(40, h * 0.06);
  const hx = (w - hudW)/2;
  const hy = 12;

  // HUD background with pixel border feel
  ctx.fillStyle = RETRO_DARK;
  ctx.fillRect(hx, hy, hudW, hudH);
  ctx.strokeStyle = RETRO_GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(hx, hy, hudW, hudH);
  
  // Team color bars
  ctx.fillStyle = "#2563eb"; ctx.fillRect(hx, hy, 5, hudH);
  ctx.fillStyle = "#dc2626"; ctx.fillRect(hx + hudW - 5, hy, 5, hudH);

  // Team names (retro font)
  const hudFontSize = Math.max(7, hudH * 0.28);
  ctx.fillStyle = "#60a5fa";
  ctx.font = `${hudFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "left"; ctx.fillText("BLUE", hx + 12, hy + hudH * 0.55);
  ctx.fillStyle = "#f87171";
  ctx.textAlign = "right"; ctx.fillText("RED", hx + hudW - 12, hy + hudH * 0.55);
  
  // Score
  const scoreFontSize = Math.max(10, hudH * 0.45);
  ctx.fillStyle = RETRO_WHITE;
  ctx.font = `${scoreFontSize}px ${RETRO_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL} - ${st.sR}`, w/2, hy + hudH * 0.6);

  // Timer tab
  const tabW = Math.max(80, hudW * 0.25);
  const tabH = Math.max(22, hudH * 0.55);
  ctx.fillStyle = RETRO_DARK;
  ctx.fillRect(w/2 - tabW/2, hy + hudH, tabW, tabH);
  ctx.strokeStyle = RETRO_GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(w/2 - tabW/2, hy + hudH, tabW, tabH);
  
  const min = Math.floor(st.time / 60);
  const sec = Math.floor(st.time % 60);
  const timerFontSize = Math.max(7, tabH * 0.5);
  ctx.fillStyle = RETRO_GREEN;
  ctx.font = `${timerFontSize}px ${RETRO_FONT}`;
  ctx.fillText(`${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`, w/2, hy + hudH + tabH * 0.65);
};

// ============================================================
// Game Screen (canvas-based simulation)
// ============================================================
function GameScreen({ blueFormation, redFormation, onBack }: { blueFormation: FormationId; redFormation: FormationId; onBack: () => void }) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(mkState(blueFormation, redFormation));
  const reqRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

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
      
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = vw + "px";
      canvas.style.height = vh + "px";
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const elapsed = (t - lastTimeRef.current) / 1000;
      lastTimeRef.current = t;
      
      const dt = Math.min(0.05, elapsed); 

      if (dt > 0.001) {
        update(stRef.current, dt);
        render(ctx, canvas, stRef.current);
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
      height: "100vh", 
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
      {/* Back button (retro style) */}
      <button
        onClick={onBack}
        style={{
          position: "absolute",
          bottom: "16px",
          left: "16px",
          background: RETRO_DARK,
          border: `2px solid ${RETRO_GOLD}`,
          color: RETRO_GOLD,
          fontFamily: RETRO_FONT,
          fontSize: "clamp(6px, 1.2vw, 10px)",
          padding: "6px 14px",
          cursor: "pointer",
          zIndex: 20,
          letterSpacing: "1px",
        }}
      >
        ◀ MENU
      </button>
    </div>
  );
}

// ============================================================
// React コンポーネント本体
// ============================================================
export default function Home() {
  const [screen, setScreen] = useState<"start" | "game">("start");
  const [blueFormation, setBlueFormation] = useState<FormationId>("4-4-2");
  const [redFormation, setRedFormation] = useState<FormationId>("4-4-2");

  const handleStart = useCallback((bf: FormationId, rf: FormationId) => {
    setBlueFormation(bf);
    setRedFormation(rf);
    setScreen("game");
  }, []);

  const handleBack = useCallback(() => {
    setScreen("start");
  }, []);

  if (screen === "start") {
    return <StartScreen onStart={handleStart} />;
  }

  return <GameScreen blueFormation={blueFormation} redFormation={redFormation} onBack={handleBack} />;
}
