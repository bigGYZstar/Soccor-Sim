/*
 * TopPage - サッカーシミュレーター トップページ
 * 「試合」と「ガチャ」の2つのモードを選択できるメインメニュー
 * Design: SFC RPG風 16bitドット絵スタイル
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';

// ============================================================
// SFC-style retro pixel font helper
// ============================================================
const RETRO_FONT = "'Press Start 2P', monospace";
const DOT_FONT = "'DotGothic16', monospace";
const RETRO_BG = "#0a0a18";
const RETRO_ACCENT = "#e94560";
const RETRO_BLUE = "#0f3460";
const RETRO_GOLD = "#f5c542";
const RETRO_GREEN = "#16c47f";
const RETRO_WHITE = "#eaeaea";
const RETRO_DARK = "#0f0f23";

// ============================================================
// Animated star field background
// ============================================================
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create stars
    const stars: { x: number; y: number; size: number; speed: number; brightness: number; twinkleSpeed: number; twinklePhase: number }[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.3 + 0.05,
        brightness: Math.random(),
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    let animFrame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw gradient background
      const grad = ctx.createRadialGradient(
        canvas.width * 0.3, canvas.height * 0.3, 0,
        canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.8
      );
      grad.addColorStop(0, '#0f1a3a');
      grad.addColorStop(0.5, '#0a0e24');
      grad.addColorStop(1, '#050510');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw stars
      for (const star of stars) {
        star.twinklePhase += star.twinkleSpeed;
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(star.twinklePhase));
        ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        star.y += star.speed;
        if (star.y > canvas.height + 5) {
          star.y = -5;
          star.x = Math.random() * canvas.width;
        }
      }

      animFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  );
}

// ============================================================
// Animated soccer ball icon
// ============================================================
function SoccerBallIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#fff" stroke="#333" strokeWidth="2" />
      <path d="M24 2 L28 12 L24 10 L20 12 Z" fill="#333" opacity="0.3" />
      <circle cx="24" cy="24" r="6" fill="#333" opacity="0.15" />
      {/* Pentagon pattern */}
      <polygon points="24,8 28,14 26,20 22,20 20,14" fill="#333" opacity="0.2" />
      <polygon points="36,18 38,24 34,28 28,26 30,20" fill="#333" opacity="0.2" />
      <polygon points="36,30 34,36 28,38 26,32 30,28" fill="#333" opacity="0.2" />
      <polygon points="12,18 18,20 20,26 14,28 10,24" fill="#333" opacity="0.2" />
      <polygon points="12,30 14,28 20,32 18,38 14,36" fill="#333" opacity="0.2" />
    </svg>
  );
}

// ============================================================
// Mode selection card component
// ============================================================
function ModeCard({
  title,
  subtitle,
  description,
  icon,
  accentColor,
  borderColor,
  onClick,
  delay,
}: {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  borderColor: string;
  onClick: () => void;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? hovered
            ? 'translateY(-6px) scale(1.03)'
            : 'translateY(0) scale(1)'
          : 'translateY(30px) scale(0.95)',
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        background: hovered
          ? `linear-gradient(145deg, rgba(20,25,50,0.95), rgba(15,20,40,0.98))`
          : 'rgba(10,14,30,0.9)',
        border: `3px solid ${hovered ? accentColor : borderColor}`,
        borderRadius: '0px',
        padding: 'clamp(20px, 3vh, 36px) clamp(16px, 3vw, 32px)',
        cursor: 'pointer',
        width: '100%',
        maxWidth: '320px',
        minHeight: 'clamp(200px, 30vh, 300px)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(10px, 1.5vh, 20px)',
        position: 'relative' as const,
        overflow: 'hidden',
        boxShadow: hovered
          ? `0 0 30px ${accentColor}44, 0 8px 32px rgba(0,0,0,0.6), inset 0 0 60px ${accentColor}11`
          : `0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
        imageRendering: 'pixelated' as any,
      }}
    >
      {/* Inner border (RPG window style) */}
      <div style={{
        position: 'absolute',
        inset: '4px',
        border: `2px solid ${hovered ? accentColor + '66' : borderColor + '44'}`,
        pointerEvents: 'none',
        transition: 'border-color 0.3s',
      }} />

      {/* Corner decorations */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
        <div key={pos} style={{
          position: 'absolute',
          [pos.includes('top') ? 'top' : 'bottom']: '8px',
          [pos.includes('left') ? 'left' : 'right']: '8px',
          width: '6px',
          height: '6px',
          background: hovered ? accentColor : borderColor + '88',
          transition: 'background 0.3s',
        }} />
      ))}

      {/* Icon */}
      <div style={{
        filter: hovered ? `drop-shadow(0 0 12px ${accentColor})` : 'none',
        transition: 'filter 0.3s',
      }}>
        {icon}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: RETRO_FONT,
        fontSize: 'clamp(14px, 3vw, 22px)',
        color: hovered ? accentColor : RETRO_WHITE,
        textShadow: hovered
          ? `0 0 20px ${accentColor}88, 2px 2px 0 #000`
          : '2px 2px 0 #000',
        letterSpacing: '3px',
        transition: 'color 0.3s, text-shadow 0.3s',
      }}>
        {title}
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: DOT_FONT,
        fontSize: 'clamp(11px, 1.8vw, 15px)',
        color: hovered ? accentColor + 'cc' : '#8899bb',
        letterSpacing: '1px',
        transition: 'color 0.3s',
      }}>
        {subtitle}
      </div>

      {/* Description */}
      <div style={{
        fontFamily: DOT_FONT,
        fontSize: 'clamp(9px, 1.2vw, 12px)',
        color: '#5a6f8a',
        lineHeight: '1.6',
        textAlign: 'center' as const,
        maxWidth: '260px',
      }}>
        {description}
      </div>

      {/* Bottom accent line */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '10%',
        right: '10%',
        height: '2px',
        background: hovered
          ? `linear-gradient(90deg, transparent, ${accentColor}, transparent)`
          : 'transparent',
        transition: 'background 0.3s',
      }} />
    </button>
  );
}

// ============================================================
// Card pack icon (SVG)
// ============================================================
function CardPackIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Back card */}
      <rect x="10" y="4" width="28" height="38" rx="2" fill="#1a2744" stroke="#FFD700" strokeWidth="1.5" transform="rotate(-8 24 24)" />
      {/* Middle card */}
      <rect x="10" y="4" width="28" height="38" rx="2" fill="#1e2d4f" stroke="#FFD700" strokeWidth="1.5" transform="rotate(4 24 24)" />
      {/* Front card */}
      <rect x="10" y="6" width="28" height="38" rx="2" fill="#243656" stroke="#FFD700" strokeWidth="2" />
      {/* Star on front card */}
      <polygon
        points="24,14 26,20 32,20 27,24 29,30 24,26 19,30 21,24 16,20 22,20"
        fill="#FFD700"
        opacity="0.8"
      />
      {/* Shine effect */}
      <line x1="14" y1="10" x2="20" y2="10" stroke="#FFD700" strokeWidth="1" opacity="0.4" />
      <line x1="14" y1="13" x2="18" y2="13" stroke="#FFD700" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

// ============================================================
// Pitch icon (SVG)
// ============================================================
function PitchIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Pitch background */}
      <rect x="2" y="6" width="44" height="36" rx="1" fill="#145e30" stroke="#2a8c4a" strokeWidth="1.5" />
      {/* Center line */}
      <line x1="24" y1="6" x2="24" y2="42" stroke="#2a8c4a" strokeWidth="1" />
      {/* Center circle */}
      <circle cx="24" cy="24" r="6" fill="none" stroke="#2a8c4a" strokeWidth="1" />
      {/* Center spot */}
      <circle cx="24" cy="24" r="1.5" fill="#2a8c4a" />
      {/* Goal areas */}
      <rect x="2" y="16" width="6" height="16" fill="none" stroke="#2a8c4a" strokeWidth="1" />
      <rect x="40" y="16" width="6" height="16" fill="none" stroke="#2a8c4a" strokeWidth="1" />
      {/* Players - blue team */}
      <circle cx="10" cy="18" r="2" fill="#4488ff" />
      <circle cx="10" cy="30" r="2" fill="#4488ff" />
      <circle cx="16" cy="24" r="2" fill="#4488ff" />
      <circle cx="18" cy="16" r="2" fill="#4488ff" />
      <circle cx="18" cy="32" r="2" fill="#4488ff" />
      {/* Players - red team */}
      <circle cx="38" cy="18" r="2" fill="#ff4444" />
      <circle cx="38" cy="30" r="2" fill="#ff4444" />
      <circle cx="32" cy="24" r="2" fill="#ff4444" />
      <circle cx="30" cy="16" r="2" fill="#ff4444" />
      <circle cx="30" cy="32" r="2" fill="#ff4444" />
      {/* Ball */}
      <circle cx="24" cy="24" r="1.5" fill="#fff" stroke="#333" strokeWidth="0.5" />
    </svg>
  );
}

// ============================================================
// Team build icon (SVG)
// ============================================================
function TeamBuildIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Clipboard */}
      <rect x="10" y="6" width="28" height="36" rx="2" fill="#1a2744" stroke="#e94560" strokeWidth="1.5" />
      {/* Clipboard top */}
      <rect x="18" y="3" width="12" height="6" rx="1" fill="#e94560" />
      {/* Formation dots */}
      <circle cx="24" cy="16" r="2" fill="#4488ff" />
      <circle cx="18" cy="22" r="2" fill="#4488ff" />
      <circle cx="30" cy="22" r="2" fill="#4488ff" />
      <circle cx="16" cy="28" r="2" fill="#4488ff" />
      <circle cx="24" cy="28" r="2" fill="#4488ff" />
      <circle cx="32" cy="28" r="2" fill="#4488ff" />
      {/* Arrow */}
      <line x1="24" y1="33" x2="24" y2="38" stroke="#FFD700" strokeWidth="1.5" />
      <polygon points="24,40 21,36 27,36" fill="#FFD700" />
    </svg>
  );
}

// ============================================================
// Main TopPage Component
// ============================================================
export default function TopPage() {
  const [, setLocation] = useLocation();
  const [titleVisible, setTitleVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTitleVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: RETRO_FONT,
      color: RETRO_WHITE,
      position: 'relative',
      overflow: 'hidden',
      imageRendering: 'pixelated' as any,
      padding: 'clamp(12px, 3vh, 32px) clamp(12px, 4vw, 32px)',
      boxSizing: 'border-box',
    }}>
      {/* Animated star field */}
      <StarField />

      {/* Scanline overlay */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
        pointerEvents: 'none',
        zIndex: 100,
      }} />

      {/* Title section */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        textAlign: 'center',
        marginBottom: 'clamp(20px, 4vh, 48px)',
        opacity: titleVisible ? 1 : 0,
        transform: titleVisible ? 'translateY(0)' : 'translateY(-20px)',
        transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        {/* Main title */}
        <div style={{
          fontSize: 'clamp(18px, 5vw, 42px)',
          color: RETRO_GOLD,
          textShadow: `3px 3px 0px ${RETRO_ACCENT}, -1px -1px 0px #000, 0 0 30px rgba(245,197,66,0.3)`,
          letterSpacing: 'clamp(2px, 0.8vw, 6px)',
          marginBottom: 'clamp(4px, 1vh, 12px)',
        }}>
          SOCCER SIM
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: DOT_FONT,
          fontSize: 'clamp(9px, 1.5vw, 14px)',
          color: RETRO_GREEN,
          letterSpacing: '2px',
        }}>
          ⚽ サッカーシミュレーター ⚽
        </div>

        {/* Decorative line */}
        <div style={{
          width: 'clamp(80px, 20vw, 200px)',
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${RETRO_GOLD}88, transparent)`,
          margin: 'clamp(8px, 1.5vh, 16px) auto 0',
        }} />
      </div>

      {/* Mode selection cards */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        gap: 'clamp(12px, 3vw, 32px)',
        justifyContent: 'center',
        alignItems: 'stretch',
        width: '100%',
        maxWidth: '720px',
        flexWrap: 'wrap' as const,
      }}>
        {/* Match mode */}
        <ModeCard
          title="試合"
          subtitle="MATCH"
          description="11vs11のサッカーシミュレーション。フォーメーションを選んでキックオフ！"
          icon={<PitchIcon size={56} />}
          accentColor="#4488ff"
          borderColor="#2255aa"
          onClick={() => setLocation('/match')}
          delay={500}
        />

        {/* Gacha mode */}
        <ModeCard
          title="ガチャ"
          subtitle="GACHA"
          description="カードパックを開封して1034名の選手をコレクション！レアカードを引き当てろ！"
          icon={<CardPackIcon size={56} />}
          accentColor="#FFD700"
          borderColor="#8B6914"
          onClick={() => setLocation('/gacha')}
          delay={700}
        />

        {/* Team Builder mode */}
        <ModeCard
          title="編成"
          subtitle="TEAM BUILD"
          description="ガチャで集めた選手でチームを組んで、カスタムマッチに挑戦！"
          icon={<TeamBuildIcon size={56} />}
          accentColor="#e94560"
          borderColor="#8b2030"
          onClick={() => setLocation('/team-builder')}
          delay={900}
        />
      </div>

      {/* Footer */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        marginTop: 'clamp(16px, 3vh, 32px)',
        textAlign: 'center',
        opacity: titleVisible ? 1 : 0,
        transition: 'opacity 1s ease 1s',
      }}>
        <div style={{
          fontFamily: DOT_FONT,
          fontSize: 'clamp(8px, 1vw, 11px)',
          color: '#3a4a6a',
          letterSpacing: '1px',
        }}>
          © 2026 SOCCER SIM ENGINE v10.0.0
        </div>
      </div>
    </div>
  );
}
