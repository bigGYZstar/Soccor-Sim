/*
 * PlayerCardDisplay - サッカー選手カード表示コンポーネント
 * Design: SFC RPG風 16bitドット絵スタイル
 * レアリティに応じたボーダー色・グロー・アニメーションを適用
 * カードクリックで表裏フリップ → 裏面にbio・特殊能力をSFC風テキストで表示
 */

import { useState } from 'react';
import type { PlayerCard } from '@/lib/cardData';
import { RARITY_CONFIG } from '@/lib/cardData';
import PixelParticles from './PixelParticles';

interface PlayerCardDisplayProps {
  card: PlayerCard;
  revealed: boolean;
  index: number;
  onReveal?: () => void;
}

const CARD_BACK_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-3_1771940460000_na1fn_Y2FyZC1iYWNr.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTNfMTc3MTk0MDQ2MDAwMF9uYTFmbl9ZMkZ5WkMxaVlXTnIucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=XGZPapRGmmP0vfcNN1N~DW7R3SHIA724IfNIRbyc0ff-db6XyiT1ysK3g3s2Jr6FIdIA3kHK8MK3odWVCGBKnUsPO8hI9FJ~FhBGNvbJqRqe39Ehdh-CNGcyn~Zng5xiJdbE~cEV3FABfpLaPnsk2uKsgFYCpJtZ7673azmD4U2JQuegp-RvODhvZAIhwoyG7z95EqVqXvMkw8~jpvlljbyJqxJj3xwFyDYmyZK2vDy6JwdmNIbjXZgd8V-TKp1aM9usIZxLjlYBwYFrjYUQ~XZguyjHPRFdV21YKtdXD02q~592sxhBY9Rd3pL3dd-sq~e91fbZBqiQ4A7GnTuvUQ__';

function StatBar({ value, maxValue = 99, color }: { value: number; maxValue?: number; color: string }) {
  const percentage = (value / maxValue) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="w-full h-2 bg-black/50 relative" style={{ imageRendering: 'pixelated' }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      </div>
      <span className="text-xs w-6 text-right" style={{ fontFamily: "'Silkscreen', monospace", fontSize: '10px' }}>
        {value}
      </span>
    </div>
  );
}

function getRarityGradient(rarity: string): string {
  switch (rarity) {
    case 'ICON': return 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 20%, #0a0a1a 40%, #1a0a2a 60%, #0a1a2a 80%, #0a0a1a 100%)';
    case 'HERO': return 'linear-gradient(135deg, #001a15 0%, #003328 20%, #001a15 40%, #002a20 60%, #001a15 80%, #002a20 100%)';
    case 'UR': return 'linear-gradient(135deg, #2a0a0a 0%, #1a0000 30%, #2a0a0a 50%, #3a1010 70%, #2a0a0a 100%)';
    case 'SR': return 'linear-gradient(135deg, #2a1f00 0%, #1a1500 30%, #2a1f00 50%, #3a2f10 70%, #2a1f00 100%)';
    case 'R': return 'linear-gradient(135deg, #0d2b45 0%, #071d30 30%, #0d2b45 50%, #153a55 70%, #0d2b45 100%)';
    default: return 'linear-gradient(135deg, #1a2744 0%, #0f1a2e 30%, #1a2744 50%, #243450 70%, #1a2744 100%)';
  }
}

function getBackGradient(rarity: string): string {
  switch (rarity) {
    case 'ICON': return 'linear-gradient(180deg, #0a0820 0%, #12103a 40%, #0a0820 100%)';
    case 'HERO': return 'linear-gradient(180deg, #021510 0%, #04281a 40%, #021510 100%)';
    case 'UR': return 'linear-gradient(180deg, #1a0505 0%, #2d0a0a 40%, #1a0505 100%)';
    case 'SR': return 'linear-gradient(180deg, #1a1400 0%, #2d2200 40%, #1a1400 100%)';
    case 'R': return 'linear-gradient(180deg, #061520 0%, #0c2535 40%, #061520 100%)';
    default: return 'linear-gradient(180deg, #0a1020 0%, #121a30 40%, #0a1020 100%)';
  }
}

// SFC風ドットボーダーコンポーネント
function PixelBorder({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        border: `2px solid ${color}`,
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.8), inset 0 0 8px ${color}40`,
      }}
    >
      {/* 四隅のドット装飾 */}
      {[
        { top: 2, left: 2 },
        { top: 2, right: 2 },
        { bottom: 2, left: 2 },
        { bottom: 2, right: 2 },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute w-2 h-2"
          style={{
            ...pos,
            backgroundColor: color,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

// SFC風タイプライターテキスト
function PixelText({ text, color, size = '9px', className = '' }: { text: string; color: string; size?: string; className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "'DotGothic16', 'Press Start 2P', monospace",
        fontSize: size,
        color,
        textShadow: `1px 1px 0 rgba(0,0,0,0.9), 0 0 6px ${color}60`,
        lineHeight: 1.6,
      }}
    >
      {text}
    </span>
  );
}

export default function PlayerCardDisplay({ card, revealed, index, onReveal }: PlayerCardDisplayProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const config = RARITY_CONFIG[card.rarity as keyof typeof RARITY_CONFIG] ?? RARITY_CONFIG["N"];

  const handleClick = () => {
    if (!revealed) {
      onReveal?.();
      return;
    }
    setIsFlipped(!isFlipped);
  };

  const statColor = config.color;
  const abilities: string[] = (card as any).specialAbilities ?? [];
  const bio: string = (card as any).bio ?? '';
  const posDetail = (card as any).positionDetail;

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{
        perspective: '1000px',
        width: 'clamp(110px, 28vw, 160px)',
        height: 'clamp(180px, 48vw, 270px)',
      }}
      onClick={handleClick}
    >
      <div
        className="w-full h-full relative transition-transform duration-700"
        style={{
          transformStyle: 'preserve-3d',
          transform: revealed && !isFlipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
          animation: revealed ? `card-reveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.15}s both` : 'none',
        }}
      >
        {/* ===== Card Front ===== */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: 'hidden',
            border: `3px solid ${config.borderColor}`,
            background: getRarityGradient(card.rarity),
            boxShadow: `0 0 15px ${config.glowColor}, inset 0 0 10px ${config.glowColor}`,
            animation: card.rarity === 'ICON' ? 'rainbow-border 1.5s linear infinite, glow-pulse 1s ease-in-out infinite' :
                       card.rarity === 'HERO' ? 'rainbow-border 2.5s linear infinite, glow-pulse 1.5s ease-in-out infinite' :
                       card.rarity === 'UR' ? 'rainbow-border 3s linear infinite, glow-pulse 2s ease-in-out infinite' :
                       card.rarity === 'SR' ? 'glow-pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          <PixelParticles
            rarity={card.rarity}
            active={revealed && (card.rarity === 'SR' || card.rarity === 'UR' || card.rarity === 'HERO' || card.rarity === 'ICON')}
            count={card.rarity === 'ICON' ? 60 : card.rarity === 'HERO' ? 45 : card.rarity === 'UR' ? 30 : 15}
          />

          {/* Rarity Label */}
          <div
            className="text-center py-1 text-xs tracking-widest"
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '9px',
              color: config.color,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderBottom: `2px solid ${config.borderColor}`,
              textShadow: `0 0 8px ${config.color}`,
            }}
          >
            {config.label}
          </div>

          {/* Player Info Area */}
          <div className="px-2 pt-1.5 pb-6" style={{ overflow: 'hidden', height: 'calc(100% - 26px)' }}>
            {/* Overall & Position */}
            <div className="flex justify-between items-start mb-1">
              <div
                className="text-2xl font-bold leading-none"
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '18px',
                  color: config.color,
                  textShadow: `0 0 10px ${config.color}, 2px 2px 0 rgba(0,0,0,0.8)`,
                }}
              >
                {card.overall}
              </div>
              <div className="text-right">
                <div
                  className="text-xs"
                  style={{
                    fontFamily: "'Silkscreen', monospace",
                    fontSize: '10px',
                    color: config.color,
                  }}
                >
                  {card.position}
                </div>
                <div className="text-lg leading-none">{card.countryFlag}</div>
              </div>
            </div>

            {/* Player Name */}
            <div
              className="text-center mb-1 py-1"
              style={{
                borderTop: `1px solid ${config.borderColor}40`,
                borderBottom: `1px solid ${config.borderColor}40`,
              }}
            >
              <div
                className="text-sm leading-tight"
                style={{
                  fontFamily: "'DotGothic16', monospace",
                  color: '#fff',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {card.nameJa}
              </div>
              <div
                className="text-xs opacity-70"
                style={{
                  fontFamily: "'Silkscreen', monospace",
                  fontSize: '8px',
                  color: config.color,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {card.name}
              </div>
            </div>

            {/* Stats */}
            <div style={{ marginTop: '2px' }}>
              {[
                { label: 'SPD', value: card.stats.speed },
                { label: 'SHT', value: card.stats.shoot },
                { label: 'PAS', value: card.stats.pass },
                { label: 'DRB', value: card.stats.dribble },
                { label: 'DEF', value: card.stats.defense },
                { label: 'PHY', value: card.stats.physical },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-1">
                  <span
                    className="w-7 text-right"
                    style={{
                      fontFamily: "'Silkscreen', monospace",
                      fontSize: '8px',
                      color: config.color,
                      opacity: 0.8,
                    }}
                  >
                    {stat.label}
                  </span>
                  <div className="flex-1">
                    <StatBar value={stat.value} color={statColor} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Position Label + flip hint */}
          <div
            className="absolute bottom-0 left-0 right-0 text-center py-0.5"
            style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '10px',
              color: config.color,
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderTop: `1px solid ${config.borderColor}40`,
            }}
          >
            {revealed ? (
              <span style={{ fontSize: '8px', opacity: 0.7, fontFamily: "'Silkscreen', monospace" }}>
                ▶ TAP TO FLIP
              </span>
            ) : (
              <span>{card.positionJa} {card.countryFlag}</span>
            )}
          </div>
        </div>

        {/* ===== Card Back (SFC風 選手説明) ===== */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            border: `3px solid ${config.borderColor}`,
            background: getBackGradient(card.rarity),
            boxShadow: `0 0 15px ${config.glowColor}80`,
          }}
        >
          <PixelBorder color={config.borderColor} />

          {/* ヘッダー：選手名 */}
          <div
            className="text-center py-1.5 px-2"
            style={{
              borderBottom: `2px solid ${config.borderColor}`,
              backgroundColor: 'rgba(0,0,0,0.6)',
            }}
          >
            <div style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '11px',
              color: config.color,
              textShadow: `0 0 8px ${config.color}`,
              letterSpacing: '0.05em',
            }}>
              {card.nameJa}
            </div>
            <div style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '7px',
              color: config.color,
              opacity: 0.7,
            }}>
              {card.rarity} | OVR {card.overall} | {card.position}
            </div>
          </div>

          {/* メインコンテンツ */}
          <div className="px-2 py-1.5 flex flex-col gap-1.5" style={{ height: 'calc(100% - 52px)', overflow: 'hidden' }}>

            {/* 選手説明 bio */}
            {bio && (
              <div
                className="p-1.5"
                style={{
                  border: `1px solid ${config.borderColor}60`,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  position: 'relative',
                }}
              >
                {/* SFC風ウィンドウ装飾 */}
                <div style={{
                  position: 'absolute',
                  top: -1,
                  left: 4,
                  backgroundColor: getBackGradient(card.rarity).includes('#') ? 'transparent' : '#000',
                  padding: '0 2px',
                }}>
                  <span style={{
                    fontFamily: "'Silkscreen', monospace",
                    fontSize: '6px',
                    color: config.color,
                    opacity: 0.9,
                  }}>★ PROFILE</span>
                </div>
                <p style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: '9px',
                  color: '#d4e8ff',
                  lineHeight: 1.6,
                  textShadow: '1px 1px 0 rgba(0,0,0,0.9)',
                  marginTop: '2px',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: 'vertical' as any,
                }}>
                  {bio}
                </p>
              </div>
            )}

            {/* ポジション詳細 */}
            {posDetail && (
              <div
                className="flex gap-1"
                style={{ flexWrap: 'wrap' }}
              >
                <div
                  className="px-1.5 py-0.5"
                  style={{
                    border: `1px solid ${config.borderColor}50`,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                  }}
                >
                  <PixelText
                    text={`利き足: ${posDetail.foot === 'right' ? '右' : posDetail.foot === 'left' ? '左' : '両'}`}
                    color={config.color}
                    size="8px"
                  />
                </div>
                <div
                  className="px-1.5 py-0.5"
                  style={{
                    border: `1px solid ${config.borderColor}50`,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                  }}
                >
                  <PixelText
                    text={posDetail.role || card.positionJa || card.position}
                    color={config.color}
                    size="8px"
                  />
                </div>
              </div>
            )}

            {/* 特殊能力バッジ */}
            {abilities.length > 0 && (
              <div
                className="p-1.5"
                style={{
                  border: `1px solid ${config.borderColor}60`,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: -1,
                  left: 4,
                  padding: '0 2px',
                }}>
                  <span style={{
                    fontFamily: "'Silkscreen', monospace",
                    fontSize: '6px',
                    color: config.color,
                    opacity: 0.9,
                  }}>⚡ SPECIAL</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1" style={{ maxHeight: '60px', overflow: 'hidden' }}>
                  {abilities.slice(0, 6).map((ability, i) => (
                    <div
                      key={i}
                      className="px-1 py-0.5"
                      style={{
                        backgroundColor: `${config.glowColor}30`,
                        border: `1px solid ${config.borderColor}80`,
                        boxShadow: `0 0 4px ${config.glowColor}40`,
                      }}
                    >
                      <span style={{
                        fontFamily: "'DotGothic16', monospace",
                        fontSize: '8px',
                        color: config.color,
                        textShadow: `0 0 4px ${config.color}`,
                      }}>
                        {ability}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 特殊能力なし */}
            {abilities.length === 0 && (
              <div
                className="p-1.5 text-center"
                style={{
                  border: `1px solid ${config.borderColor}30`,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                }}
              >
                <span style={{
                  fontFamily: "'Silkscreen', monospace",
                  fontSize: '7px',
                  color: config.color,
                  opacity: 0.5,
                }}>
                  NO SPECIAL ABILITY
                </span>
              </div>
            )}
          </div>

          {/* フッター：戻るヒント */}
          <div
            className="absolute bottom-0 left-0 right-0 text-center py-0.5"
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '7px',
              color: config.color,
              opacity: 0.6,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderTop: `1px solid ${config.borderColor}40`,
            }}
          >
            ◀ TAP TO RETURN
          </div>
        </div>
      </div>
    </div>
  );
}
