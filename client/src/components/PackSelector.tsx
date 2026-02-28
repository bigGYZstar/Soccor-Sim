/*
 * PackSelector - パック種別選択コンポーネント
 * Design: SFC RPG風 16bitドット絵スタイル
 * RPGのショップ画面をモチーフにしたパック選択UI
 */

import { useState } from 'react';
import type { PackType, PackConfig } from '@/lib/cardData';
import { PACK_CONFIGS } from '@/lib/cardData';

interface PackSelectorProps {
  onSelect: (packType: PackType) => void;
  selectedPack: PackType;
}

const PACK_ORDER: PackType[] = ['normal', 'standard', 'ten', 'legend', 'jleague'];

export default function PackSelector({ onSelect, selectedPack }: PackSelectorProps) {
  const [hoveredPack, setHoveredPack] = useState<PackType | null>(null);
  const previewPack = hoveredPack ?? selectedPack;
  const preview = PACK_CONFIGS[previewPack];

  return (
    <div
      className="w-full max-w-4xl mx-auto"
      style={{ fontFamily: "'DotGothic16', monospace" }}
    >
      {/* Section Header */}
      <div className="text-center mb-4">
        <p
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            color: '#8B9DC3',
            letterSpacing: '2px',
          }}
        >
          ── PACK SELECT ──
        </p>
      </div>

      {/* Pack Grid */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {PACK_ORDER.map((packId) => {
          const cfg = PACK_CONFIGS[packId];
          const isSelected = selectedPack === packId;
          const isHovered = hoveredPack === packId;
          const isActive = isSelected || isHovered;

          return (
            <button
              key={packId}
              onClick={() => onSelect(packId)}
              onMouseEnter={() => setHoveredPack(packId)}
              onMouseLeave={() => setHoveredPack(null)}
              style={{
                background: isActive
                  ? `linear-gradient(135deg, rgba(0,10,40,0.95), rgba(0,20,60,0.95))`
                  : 'rgba(0,10,40,0.7)',
                border: `2px solid ${isActive ? cfg.borderColor : 'rgba(74,111,165,0.4)'}`,
                borderRadius: '0',
                padding: '10px 6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isActive
                  ? `0 0 12px ${cfg.glowColor}, inset 0 0 8px rgba(0,0,0,0.5)`
                  : 'none',
                transform: isActive ? 'translateY(-2px)' : 'none',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: cfg.color,
                    fontSize: '10px',
                    animation: 'pixel-cursor-blink 0.8s step-end infinite',
                    fontFamily: "'Press Start 2P', monospace",
                  }}
                >
                  ▼
                </div>
              )}

              {/* Icon */}
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{cfg.icon}</span>

              {/* Pack name */}
              <span
                style={{
                  fontSize: '9px',
                  color: isActive ? cfg.color : '#8B9DC3',
                  textAlign: 'center',
                  lineHeight: '1.3',
                  fontFamily: "'DotGothic16', monospace",
                  textShadow: isActive ? `0 0 8px ${cfg.glowColor}` : 'none',
                }}
              >
                {cfg.name}
              </span>

              {/* Card count badge */}
              <span
                style={{
                  fontSize: '8px',
                  color: '#fff',
                  background: cfg.badgeColor,
                  padding: '1px 4px',
                  fontFamily: "'Press Start 2P', monospace",
                }}
              >
                {cfg.badgeText}
              </span>
            </button>
          );
        })}
      </div>

      {/* Preview Panel */}
      <div
        style={{
          background: 'rgba(0,10,40,0.85)',
          border: `2px solid ${preview.borderColor}`,
          boxShadow: `0 0 16px ${preview.glowColor}`,
          padding: '12px 16px',
          transition: 'all 0.2s ease',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: '18px' }}>{preview.icon}</span>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '9px',
                  color: preview.color,
                  textShadow: `0 0 8px ${preview.glowColor}`,
                  letterSpacing: '1px',
                }}
              >
                {preview.nameEn}
              </span>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#E8D5B0',
                marginBottom: '6px',
                lineHeight: '1.5',
              }}
            >
              {preview.description}
            </p>
            <p
              style={{
                fontSize: '10px',
                color: '#5a6f8a',
              }}
            >
              排出率：{preview.rateDisplay}
            </p>
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '24px',
              color: preview.color,
              textShadow: `0 0 12px ${preview.glowColor}`,
              minWidth: '40px',
              textAlign: 'center',
            }}
          >
            {preview.badgeText}
          </div>
        </div>
      </div>
    </div>
  );
}
