/**
 * PackSelector - SFC風パック選択コンポーネント
 * Design: スーパーファミコン風 RPGショップ画面
 * - ピクセルアート風ボタン
 * - 10連ガチャ初回無料バッジ
 */

import { useState } from 'react';
import type { PackType } from '@/lib/cardData';
import { PACK_CONFIGS } from '@/lib/cardData';
import { useCollection } from '@/hooks/useCollection';

const FONT_PIXEL = "'Press Start 2P', monospace";
const FONT_DOT   = "'DotGothic16', monospace";
const C_GREEN    = '#16C47F';

interface PackSelectorProps {
  onSelect: (packType: PackType) => void;
  selectedPack: PackType;
  coins?: number;
}

const PACK_ORDER: PackType[] = ['normal', 'standard', 'ten', 'legend', 'jleague'];

export default function PackSelector({ onSelect, selectedPack, coins }: PackSelectorProps) {
  const [hovered, setHovered] = useState<PackType | null>(null);
  const { free10xUsed } = useCollection();
  const preview = PACK_CONFIGS[hovered ?? selectedPack];

  return (
    <div style={{ width: '100%', maxWidth: '720px', fontFamily: FONT_DOT }}>
      {/* Section label */}
      <div style={{
        textAlign: 'center', marginBottom: '10px',
        fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1.2vw, 9px)',
        color: '#4A5A7A', letterSpacing: '3px',
      }}>── PACK SELECT ──</div>

      {/* Pack buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 'clamp(4px, 1vw, 8px)',
        marginBottom: '10px',
      }}>
        {PACK_ORDER.map((packId) => {
          const cfg = PACK_CONFIGS[packId];
          const isSelected = selectedPack === packId;
          const isHov = hovered === packId;
          const isActive = isSelected || isHov;
          const isFree = packId === 'ten' && !free10xUsed;
          const canBuy = isFree || (coins !== undefined ? coins >= cfg.cost : true);

          return (
            <button
              key={packId}
              onClick={() => onSelect(packId)}
              onMouseEnter={() => setHovered(packId)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative',
                background: isActive
                  ? `linear-gradient(160deg, rgba(0,15,50,0.98), rgba(0,8,30,0.99))`
                  : 'rgba(0,8,24,0.85)',
                border: `2px solid ${isActive ? cfg.borderColor : 'rgba(40,60,100,0.6)'}`,
                padding: 'clamp(6px, 1.5vw, 12px) clamp(4px, 1vw, 8px)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? `0 0 14px ${cfg.glowColor}55, inset 0 0 10px rgba(0,0,0,0.5)` : 'none',
                transform: isActive ? 'translateY(-3px)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 'clamp(3px, 0.6vw, 5px)',
              }}
            >
              {/* Selected cursor */}
              {isSelected && (
                <div style={{
                  position: 'absolute', top: -10, left: '50%',
                  transform: 'translateX(-50%)',
                  color: cfg.color, fontFamily: FONT_PIXEL, fontSize: '8px',
                  animation: 'pixel-cursor-blink 0.8s step-end infinite',
                }}>▼</div>
              )}
              {/* FREE badge */}
              {isFree && (
                <div style={{
                  position: 'absolute', top: -8, right: -4,
                  background: C_GREEN, color: '#000',
                  fontFamily: FONT_PIXEL, fontSize: '5px',
                  padding: '2px 4px', letterSpacing: '0.05em',
                  boxShadow: `0 0 6px ${C_GREEN}88`,
                  zIndex: 5,
                }}>FREE</div>
              )}
              {/* Icon */}
              <span style={{ fontSize: 'clamp(16px, 3vw, 22px)', lineHeight: 1 }}>{cfg.icon}</span>
              {/* Name */}
              <span style={{
                fontFamily: FONT_DOT, fontSize: 'clamp(8px, 1.2vw, 10px)',
                color: isActive ? cfg.color : '#6878A8',
                textAlign: 'center', lineHeight: 1.3,
                textShadow: isActive ? `0 0 8px ${cfg.glowColor}` : 'none',
              }}>{cfg.name}</span>
              {/* Card count */}
              <span style={{
                fontFamily: FONT_PIXEL, fontSize: 'clamp(6px, 0.9vw, 8px)',
                color: '#fff', background: cfg.badgeColor,
                padding: '1px 4px',
              }}>{cfg.badgeText}</span>
              {/* Cost */}
              <span style={{
                fontFamily: FONT_PIXEL, fontSize: 'clamp(5px, 0.8vw, 7px)',
                color: isFree ? C_GREEN : (canBuy ? '#F5C542' : '#FF4444'),
              }}>
                {isFree ? '★FREE' : `🪙${cfg.cost}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Preview panel */}
      <div style={{
        background: 'rgba(0,8,28,0.9)',
        border: `2px solid ${preview.borderColor}`,
        boxShadow: `0 0 16px ${preview.glowColor}44`,
        padding: 'clamp(8px, 1.5vw, 14px) clamp(10px, 2vw, 18px)',
        transition: 'all 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '18px' }}>{preview.icon}</span>
              <span style={{
                fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1.2vw, 9px)',
                color: preview.color, textShadow: `0 0 8px ${preview.glowColor}`,
                letterSpacing: '1px',
              }}>{preview.nameEn}</span>
            </div>
            <div style={{
              fontFamily: FONT_DOT, fontSize: 'clamp(10px, 1.5vw, 13px)',
              color: '#C8B890', lineHeight: 1.6, marginBottom: '4px',
            }}>{preview.description}</div>
            <div style={{
              fontFamily: FONT_DOT, fontSize: 'clamp(9px, 1.2vw, 11px)',
              color: '#4A5A7A',
            }}>排出率：{preview.rateDisplay}</div>
          </div>
          <div style={{
            fontFamily: FONT_PIXEL, fontSize: 'clamp(18px, 3vw, 26px)',
            color: preview.color, textShadow: `0 0 12px ${preview.glowColor}`,
            minWidth: '36px', textAlign: 'center', flexShrink: 0,
          }}>{preview.badgeText}</div>
        </div>
      </div>
    </div>
  );
}
