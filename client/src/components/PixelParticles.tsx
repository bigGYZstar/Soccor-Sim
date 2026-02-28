/*
 * PixelParticles - ドット絵風パーティクルエフェクト
 * Design: SFC RPG風 16bitスタイル
 * レアリティに応じた色と量のパーティクルを表示
 */

import { useEffect, useState } from 'react';
import type { Rarity } from '@/lib/cardData';
import { RARITY_CONFIG } from '@/lib/cardData';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  dx: number;
  dy: number;
}

interface PixelParticlesProps {
  rarity: string;
  active: boolean;
  count?: number;
}

const RARITY_COLORS: Record<string, string[]> = {
  N: ['#6B7FA0', '#8B9DC3', '#A5B4D4'],
  R: ['#29B6F6', '#4FC3F7', '#81D4FA', '#03A9F4'],
  SR: ['#FFD700', '#FFC107', '#FFEB3B', '#FF9800', '#FFE082'],
  UR: ['#FF4444', '#FF6B6B', '#FFD700', '#FF9800', '#E040FB', '#7C4DFF', '#00E5FF'],
  HERO: ['#00FFCC', '#00E5B0', '#33FFD1', '#00FFAA', '#80FFE5', '#00FFF0'],
  ICON: ['#FFFFFF', '#FFD700', '#FFF0A0', '#FFFDE0', '#C0E8FF', '#FFD0FF', '#D0FFD0'],
};

export default function PixelParticles({ rarity, active, count }: PixelParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const config = RARITY_CONFIG[rarity] ?? RARITY_CONFIG["N"];
    const colors = RARITY_COLORS[rarity] ?? RARITY_COLORS["N"];
    const particleCount = count ?? (config.shakeIntensity + 1) * 12;

    const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 60,
      y: 50 + (Math.random() - 0.5) * 60,
      size: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
      duration: 0.8 + Math.random() * 1.2,
      dx: (Math.random() - 0.5) * 200,
      dy: (Math.random() - 0.5) * 200 - 50,
    }));

    setParticles(newParticles);
  }, [active, rarity, count]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animation: `float-up ${p.duration}s ease-out ${p.delay}s forwards`,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            imageRendering: 'pixelated',
            transform: `translate(${p.dx}px, 0)`,
          }}
        />
      ))}
    </div>
  );
}
