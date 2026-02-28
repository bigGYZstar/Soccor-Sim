/**
 * TopPage - SFC風トップページ
 * Design: スーパーファミコン風 RPGタイトル画面
 * - 深い宇宙紺背景 + ゴールドアクセント
 * - Press Start 2P + DotGothic16 フォント
 * - ピクセルアート風ボーダー・グロー効果
 * - 星フィールドアニメーション
 */
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useCollection } from '@/hooks/useCollection';

const FONT_PIXEL = "'Press Start 2P', monospace";
const FONT_DOT   = "'DotGothic16', monospace";
const FONT_MONO  = "'Silkscreen', monospace";
const C_BG_DEEP  = '#030810';
const C_BG_DARK  = '#0a1428';
const C_BG_PANEL = '#0f1e42';
const C_GOLD     = '#F5C542';
const C_GOLD_DIM = '#8B6914';
const C_RED      = '#E94560';
const C_BLUE     = '#4488FF';
const C_GREEN    = '#16C47F';
const C_TEXT     = '#D0D8F0';
const C_TEXT_DIM = '#4A5A7A';

// ── Star Field ────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + 0.3,
      speed: Math.random() * 0.25 + 0.04,
      phase: Math.random() * Math.PI * 2,
      twinkle: Math.random() * 0.02 + 0.005,
    }));
    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Deep space gradient
      const grad = ctx.createRadialGradient(canvas.width * 0.4, canvas.height * 0.3, 0, canvas.width * 0.5, canvas.height * 0.5, canvas.width);
      grad.addColorStop(0, '#0d1a3a');
      grad.addColorStop(0.6, '#070e20');
      grad.addColorStop(1, '#030810');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.phase += s.twinkle;
        const alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,225,255,${alpha * 0.85})`;
        ctx.fill();
        s.y += s.speed;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}

// ── Mode Card ─────────────────────────────────────────────────
function ModeCard({ title, subtitle, description, icon, accentColor, borderColor, onClick, delay, badge }: {
  title: string; subtitle: string; description: string; icon: React.ReactNode;
  accentColor: string; borderColor: string; onClick: () => void; delay: number; badge?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)} onTouchEnd={() => { setTimeout(() => setHovered(false), 200); }}
      style={{
        position: 'relative', flex: '1 1 180px', maxWidth: '230px', minWidth: '150px',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? (hovered ? 'translateY(-8px) scale(1.03)' : 'translateY(0)') : 'translateY(24px) scale(0.94)',
        transition: `opacity 0.5s ease ${delay}ms, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)`,
      }}
    >
      {/* Glow halo */}
      {hovered && <div style={{
        position: 'absolute', inset: -4, zIndex: 0,
        background: `radial-gradient(ellipse at center, ${accentColor}30 0%, transparent 70%)`,
        filter: 'blur(12px)',
      }} />}
      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: hovered
          ? `linear-gradient(160deg, ${accentColor}14 0%, ${C_BG_PANEL} 50%, ${C_BG_DARK} 100%)`
          : `linear-gradient(160deg, ${C_BG_PANEL} 0%, ${C_BG_DARK} 100%)`,
        border: `2px solid ${hovered ? accentColor : borderColor}`,
        boxShadow: hovered
          ? `0 10px 40px rgba(0,0,0,0.8), 0 0 24px ${accentColor}30, inset 0 1px 0 rgba(255,255,255,0.07)`
          : `0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`,
        padding: 'clamp(16px, 3vw, 28px) clamp(14px, 2.5vw, 22px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 'clamp(8px, 1.5vh, 14px)',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Inner double border */}
        <div style={{
          position: 'absolute', inset: 4,
          border: `1px solid ${hovered ? accentColor + '44' : borderColor + '33'}`,
          pointerEvents: 'none', transition: 'border-color 0.2s',
        }} />
        {/* Corner pixels */}
        {[{t:'6px',l:'6px'},{t:'6px',r:'6px'},{b:'6px',l:'6px'},{b:'6px',r:'6px'}].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute', width: 5, height: 5,
            background: hovered ? accentColor : borderColor + 'aa',
            transition: 'background 0.2s', ...pos as any,
          }} />
        ))}
        {/* Badge */}
        {badge && <div style={{
          position: 'absolute', top: -10, right: 8,
          background: C_RED, color: '#fff', fontFamily: FONT_PIXEL,
          fontSize: 'clamp(5px, 0.9vw, 7px)', padding: '3px 7px',
          border: '2px solid #FF6080', boxShadow: `0 0 10px ${C_RED}88`,
          letterSpacing: '0.05em', zIndex: 10,
        }}>{badge}</div>}
        {/* Icon */}
        <div style={{
          color: accentColor,
          filter: hovered ? `drop-shadow(0 0 10px ${accentColor}99)` : 'none',
          transition: 'filter 0.2s',
        }}>{icon}</div>
        {/* Subtitle label */}
        <div style={{
          fontFamily: FONT_PIXEL, fontSize: 'clamp(8px, 1.5vw, 11px)',
          color: accentColor, letterSpacing: '0.08em',
          textShadow: `1px 1px 0 #000, 0 0 8px ${accentColor}55`,
        }}>{subtitle}</div>
        {/* Japanese title */}
        <div style={{
          fontFamily: FONT_DOT, fontSize: 'clamp(18px, 3.5vw, 26px)',
          color: C_TEXT, fontWeight: 'bold', letterSpacing: '3px',
        }}>{title}</div>
        {/* Divider */}
        <div style={{ width: '80%', height: '1px', background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)` }} />
        {/* Description */}
        <div style={{
          fontFamily: FONT_DOT, fontSize: 'clamp(10px, 1.4vw, 12px)',
          color: '#6878A8', textAlign: 'center', lineHeight: 1.65,
        }}>{description}</div>
        {/* Select indicator */}
        <div style={{
          fontFamily: FONT_PIXEL, fontSize: 'clamp(6px, 0.9vw, 8px)',
          color: accentColor, opacity: hovered ? 1 : 0.4,
          letterSpacing: '0.12em', transition: 'opacity 0.2s',
        }}>▶ SELECT</div>
      </div>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────
function PitchIcon({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <rect x="4" y="8" width="44" height="36" rx="1" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <line x1="26" y1="8" x2="26" y2="44" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <circle cx="26" cy="26" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6"/>
      <rect x="4" y="17" width="9" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7"/>
      <rect x="39" y="17" width="9" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7"/>
      <circle cx="26" cy="26" r="2.5" fill="currentColor" opacity="0.7"/>
      <circle cx="4" cy="8" r="2" fill="currentColor" opacity="0.4"/>
      <circle cx="48" cy="8" r="2" fill="currentColor" opacity="0.4"/>
      <circle cx="4" cy="44" r="2" fill="currentColor" opacity="0.4"/>
      <circle cx="48" cy="44" r="2" fill="currentColor" opacity="0.4"/>
    </svg>
  );
}
function CardPackIcon({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <rect x="12" y="6" width="26" height="36" rx="2" fill="#1a2744" stroke="currentColor" strokeWidth="1.5" transform="rotate(-7 25 24)"/>
      <rect x="12" y="6" width="26" height="36" rx="2" fill="#1e2d4f" stroke="currentColor" strokeWidth="1.5" transform="rotate(3 25 24)"/>
      <rect x="12" y="8" width="26" height="36" rx="2" fill="#1a2850" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="18" x2="38" y2="18" stroke="currentColor" strokeWidth="1.5" opacity="0.7"/>
      <polygon points="25,22 27,27 33,27 28,30 30,36 25,32 20,36 22,30 17,27 23,27" fill="currentColor" opacity="0.85"/>
    </svg>
  );
}
function TeamBuildIcon({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <circle cx="26" cy="12" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="10" cy="36" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="42" cy="36" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="26" y1="18" x2="26" y2="27" stroke="currentColor" strokeWidth="1.5" opacity="0.6"/>
      <line x1="26" y1="27" x2="10" y2="31" stroke="currentColor" strokeWidth="1.5" opacity="0.6"/>
      <line x1="26" y1="27" x2="42" y2="31" stroke="currentColor" strokeWidth="1.5" opacity="0.6"/>
      <circle cx="26" cy="27" r="2.5" fill="currentColor" opacity="0.7"/>
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function TopPage() {
  const [, setLocation] = useLocation();
  const { coins, collection } = useCollection();
  const [visible, setVisible] = useState(false);
  const [blink, setBlink] = useState(true);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t); }, []);
  useEffect(() => { const t = setInterval(() => setBlink(b => !b), 550); return () => clearInterval(t); }, []);

  return (
    <div style={{
      position: 'relative', height: '100dvh', overflow: 'hidden',
      backgroundColor: C_BG_DEEP, fontFamily: FONT_DOT, color: C_TEXT,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <StarField />
      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.035) 3px, rgba(0,0,0,0.035) 4px)',
      }} />
      {/* Pixel grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.035,
        backgroundImage: `linear-gradient(rgba(68,136,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(68,136,255,0.6) 1px, transparent 1px)`,
        backgroundSize: '8px 8px',
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column',
        alignItems: 'center', width: '100%', maxWidth: '820px',
        padding: 'clamp(12px, 3vw, 36px)', gap: 'clamp(14px, 2.5vh, 28px)', boxSizing: 'border-box',
      }}>

        {/* ── Title Block ── */}
        <div style={{
          textAlign: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {/* Logo frame */}
          <div style={{
            display: 'inline-block', position: 'relative',
            border: `3px solid ${C_GOLD_DIM}`,
            padding: 'clamp(10px, 2vh, 20px) clamp(18px, 4vw, 44px)',
            background: `linear-gradient(180deg, rgba(245,197,66,0.07) 0%, rgba(245,197,66,0.02) 100%)`,
            boxShadow: `0 0 40px rgba(245,197,66,0.12), inset 0 1px 0 rgba(255,255,255,0.05)`,
            marginBottom: 'clamp(6px, 1.2vh, 14px)',
          }}>
            {/* Corner pixels */}
            {[{top:-2,left:-2},{top:-2,right:-2},{bottom:-2,left:-2},{bottom:-2,right:-2}].map((pos, i) => (
              <div key={i} style={{ position:'absolute', width:8, height:8, background:C_GOLD, ...pos as any }} />
            ))}
            <div style={{
              fontFamily: FONT_PIXEL, fontSize: 'clamp(15px, 4.2vw, 38px)',
              color: C_GOLD, letterSpacing: 'clamp(2px, 0.8vw, 7px)',
              textShadow: `3px 3px 0px #000, 0 0 24px rgba(245,197,66,0.45)`,
              lineHeight: 1.15,
            }}>SOCCER SIM</div>
            <div style={{
              fontFamily: FONT_DOT, fontSize: 'clamp(11px, 1.8vw, 15px)',
              color: C_GREEN, letterSpacing: '3px', marginTop: '6px',
            }}>⚽ サッカーシミュレーター ⚽</div>
          </div>

          {/* Status bar */}
          <div style={{
            display: 'flex', justifyContent: 'center',
            gap: 'clamp(8px, 2vw, 16px)', fontFamily: FONT_MONO,
            fontSize: 'clamp(8px, 1.2vw, 11px)',
          }}>
            {[
              { icon: '🪙', val: `${coins.toLocaleString()}`, border: C_GOLD_DIM, color: C_GOLD },
              { icon: '🃏', val: `${collection.length}枚`, border: '#2a4080', color: '#8B9DC3' },
            ].map(({ icon, val, border, color }) => (
              <div key={val} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'rgba(0,6,18,0.85)', border: `2px solid ${border}`,
                padding: '5px 12px', color,
                boxShadow: `0 0 6px ${border}44`,
              }}>
                <span>{icon}</span><span>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Mode Cards ── */}
        <div style={{
          display: 'flex', gap: 'clamp(10px, 2.5vw, 22px)',
          justifyContent: 'center', alignItems: 'stretch',
          width: '100%', flexWrap: 'wrap',
        }}>
          <ModeCard title="試合" subtitle="MATCH"
            description="11vs11のサッカーシミュレーション。フォーメーションを選んでキックオフ！"
            icon={<PitchIcon />} accentColor={C_BLUE} borderColor="#1a3366"
            onClick={() => setLocation('/match')} delay={350}
          />
          <ModeCard title="ガチャ" subtitle="GACHA"
            description="カードパックを開封して1034名の選手をコレクション！レアカードを引き当てろ！"
            icon={<CardPackIcon />} accentColor={C_GOLD} borderColor={C_GOLD_DIM}
            onClick={() => setLocation('/gacha')} delay={550}
          />
          <ModeCard title="編成" subtitle="TEAM BUILD"
            description="ガチャで集めた選手でチームを組んで、カスタムマッチに挑戦！"
            icon={<TeamBuildIcon />} accentColor={C_RED} borderColor="#5a1020"
            onClick={() => setLocation('/team-builder')} delay={750}
          />
        </div>

        {/* ── Blink prompt ── */}
        <div style={{
          opacity: visible ? (blink ? 1 : 0) : 0,
          transition: 'opacity 0.1s ease',
          fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1vw, 9px)',
          color: C_TEXT_DIM, letterSpacing: '0.12em', textAlign: 'center',
        }}>▼ SELECT MODE ▼</div>

        {/* ── Footer ── */}
        <div style={{
          fontFamily: FONT_DOT, fontSize: 'clamp(9px, 1vw, 11px)',
          color: '#1e2e4a', letterSpacing: '1px', textAlign: 'center',
          opacity: visible ? 1 : 0, transition: 'opacity 1s ease 1.2s',
        }}>© 2026 SOCCER SIM ENGINE v10.3.0</div>
      </div>
    </div>
  );
}
