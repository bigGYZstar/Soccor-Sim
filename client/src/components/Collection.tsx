/*
 * Collection - 獲得カードコレクション表示
 * Design: SFC RPG風 16bitドット絵スタイル
 * カードをクリックするとSFC風の選手詳細モーダル（bio・特殊能力）が表示される
 */

import { useState } from 'react';
import type { PlayerCard } from '@/lib/cardData';
import { RARITY_CONFIG } from '@/lib/cardData';

interface CollectionProps {
  cards: PlayerCard[];
  isOpen: boolean;
  onClose: () => void;
}

function RarityBadge({ rarity }: { rarity: string }) {
  const config = RARITY_CONFIG[rarity] ?? RARITY_CONFIG["N"];
  return (
    <span
      className="px-2 py-0.5 text-xs"
      style={{
        fontFamily: "'Silkscreen', monospace",
        fontSize: '8px',
        color: config.color,
        border: `1px solid ${config.borderColor}`,
        backgroundColor: `${config.glowColor}`,
        textShadow: `0 0 4px ${config.color}`,
      }}
    >
      {config.label}
    </span>
  );
}

// SFC風 選手詳細モーダル
function PlayerDetailModal({ card, onClose }: { card: PlayerCard; onClose: () => void }) {
  const config = RARITY_CONFIG[card.rarity] ?? RARITY_CONFIG["N"];
  const abilities: string[] = (card as any).specialAbilities ?? [];
  const bio: string = (card as any).bio ?? '';
  const posDetail = (card as any).positionDetail;
  const team: string = (card as any).team ?? '';
  const league: string = (card as any).league ?? '';

  const getBackGradient = (rarity: string) => {
    switch (rarity) {
      case 'ICON': return 'linear-gradient(180deg, #0a0820 0%, #12103a 50%, #0a0820 100%)';
      case 'HERO': return 'linear-gradient(180deg, #021510 0%, #04281a 50%, #021510 100%)';
      case 'UR': return 'linear-gradient(180deg, #1a0505 0%, #2d0a0a 50%, #1a0505 100%)';
      case 'SR': return 'linear-gradient(180deg, #1a1400 0%, #2d2200 50%, #1a1400 100%)';
      case 'R': return 'linear-gradient(180deg, #061520 0%, #0c2535 50%, #061520 100%)';
      default: return 'linear-gradient(180deg, #0a1020 0%, #121a30 50%, #0a1020 100%)';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm"
        style={{
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto' as const,
          WebkitOverflowScrolling: 'touch' as any,
          background: getBackGradient(card.rarity),
          border: `3px solid ${config.borderColor}`,
          boxShadow: `0 0 30px ${config.glowColor}, 0 0 60px ${config.glowColor}40`,
          animation: 'card-reveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 四隅ドット装飾 */}
        {[
          { top: 4, left: 4 }, { top: 4, right: 4 },
          { bottom: 4, left: 4 }, { bottom: 4, right: 4 },
        ].map((pos, i) => (
          <div key={i} className="absolute w-3 h-3" style={{ ...pos, backgroundColor: config.borderColor, boxShadow: `0 0 6px ${config.color}` }} />
        ))}

        {/* ヘッダー */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: `2px solid ${config.borderColor}` }}
        >
          <div>
            <div style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '18px',
              color: config.color,
              textShadow: `0 0 10px ${config.color}`,
            }}>
              {card.nameJa}
            </div>
            <div style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '9px',
              color: config.color,
              opacity: 0.7,
            }}>
              {card.name}
            </div>
          </div>
          <div className="text-right">
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '22px',
              color: config.color,
              textShadow: `0 0 12px ${config.color}`,
            }}>
              {card.overall}
            </div>
            <div style={{ fontSize: '20px' }}>{card.countryFlag}</div>
          </div>
        </div>

        {/* サブヘッダー：レアリティ・ポジション・クラブ */}
        <div
          className="px-5 py-2 flex items-center gap-3 flex-wrap"
          style={{ borderBottom: `1px solid ${config.borderColor}40`, backgroundColor: 'rgba(0,0,0,0.3)' }}
        >
          <RarityBadge rarity={card.rarity} />
          <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '9px', color: config.color }}>
            {card.position}
          </span>
          {team && (
            <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: '10px', color: '#8B9DC3' }}>
              {team}
            </span>
          )}
          {league && (
            <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '8px', color: '#5a6f8a' }}>
              [{league}]
            </span>
          )}
        </div>

        {/* ステータス */}
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${config.borderColor}30` }}>
          <div style={{
            fontFamily: "'Silkscreen', monospace",
            fontSize: '7px',
            color: config.color,
            opacity: 0.7,
            marginBottom: '6px',
            letterSpacing: '0.1em',
          }}>
            ── PARAMETERS ──
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {[
              { label: 'SPD', value: card.stats.speed },
              { label: 'SHT', value: card.stats.shoot },
              { label: 'PAS', value: card.stats.pass },
              { label: 'DRB', value: card.stats.dribble },
              { label: 'DEF', value: card.stats.defense },
              { label: 'PHY', value: card.stats.physical },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-1.5">
                <span style={{
                  fontFamily: "'Silkscreen', monospace",
                  fontSize: '8px',
                  color: config.color,
                  opacity: 0.8,
                  width: '24px',
                }}>
                  {stat.label}
                </span>
                <div className="flex-1 h-1.5 bg-black/50">
                  <div
                    className="h-full"
                    style={{
                      width: `${(stat.value / 99) * 100}%`,
                      backgroundColor: config.color,
                      boxShadow: `0 0 3px ${config.color}`,
                    }}
                  />
                </div>
                <span style={{
                  fontFamily: "'Silkscreen', monospace",
                  fontSize: '8px',
                  color: config.color,
                  width: '20px',
                  textAlign: 'right',
                }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ポジション詳細 */}
        {posDetail && (
          <div className="px-5 py-2 flex gap-2 flex-wrap" style={{ borderBottom: `1px solid ${config.borderColor}30` }}>
            {[
              `利き足: ${posDetail.foot === 'right' ? '右' : posDetail.foot === 'left' ? '左' : '両'}`,
              posDetail.role || card.positionJa || card.position,
              posDetail.side === 'left' ? '左サイド' : posDetail.side === 'right' ? '右サイド' : 'センター',
            ].map((tag, i) => (
              <span key={i} style={{
                fontFamily: "'DotGothic16', monospace",
                fontSize: '9px',
                color: config.color,
                border: `1px solid ${config.borderColor}50`,
                backgroundColor: 'rgba(0,0,0,0.35)',
                padding: '1px 6px',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 選手説明 */}
        {bio && (
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${config.borderColor}30` }}>
            <div style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '7px',
              color: config.color,
              opacity: 0.7,
              marginBottom: '6px',
              letterSpacing: '0.1em',
            }}>
              ── PROFILE ──
            </div>
            <p style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '11px',
              color: '#d4e8ff',
              lineHeight: 1.8,
              textShadow: '1px 1px 0 rgba(0,0,0,0.9)',
            }}>
              {bio}
            </p>
          </div>
        )}

        {/* 特殊能力 */}
        <div className="px-5 py-3">
          <div style={{
            fontFamily: "'Silkscreen', monospace",
            fontSize: '7px',
            color: config.color,
            opacity: 0.7,
            marginBottom: '6px',
            letterSpacing: '0.1em',
          }}>
            ── SPECIAL ABILITY ──
          </div>
          {abilities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {abilities.map((ability, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "'DotGothic16', monospace",
                    fontSize: '10px',
                    color: config.color,
                    border: `1px solid ${config.borderColor}80`,
                    backgroundColor: `${config.glowColor}25`,
                    boxShadow: `0 0 6px ${config.glowColor}40`,
                    padding: '2px 8px',
                    textShadow: `0 0 6px ${config.color}`,
                  }}
                >
                  ⚡ {ability}
                </div>
              ))}
            </div>
          ) : (
            <span style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '8px',
              color: config.color,
              opacity: 0.4,
            }}>
              なし
            </span>
          )}
        </div>

        {/* フッター */}
        <div
          className="text-center py-2"
          style={{
            borderTop: `2px solid ${config.borderColor}`,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '12px',
              color: config.color,
              border: `1px solid ${config.borderColor}`,
              backgroundColor: 'rgba(0,0,0,0.5)',
              padding: '4px 20px',
              cursor: 'pointer',
              textShadow: `0 0 6px ${config.color}`,
              transition: 'all 0.2s',
            }}
          >
            ▶ とじる
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Collection({ cards, isOpen, onClose }: CollectionProps) {
  const [selectedCard, setSelectedCard] = useState<PlayerCard | null>(null);

  if (!isOpen) return null;

  const sortedCards = [...cards].sort((a, b) => {
    const order: Record<string, number> = { ICON: 0, HERO: 1, UR: 2, SR: 3, R: 4, N: 5 };
    return (order[a.rarity] ?? 9) - (order[b.rarity] ?? 9) || b.overall - a.overall;
  });

  const rarityCount: Record<string, number> = { ICON: 0, HERO: 0, UR: 0, SR: 0, R: 0, N: 0 };
  cards.forEach(c => { rarityCount[c.rarity] = (rarityCount[c.rarity] ?? 0) + 1; });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
        <div className="rpg-window w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100dvh - 24px)' }}>
          {/* Header */}
          <div className="flex justify-between items-center mb-3 pb-2" style={{ borderBottom: '2px solid rgba(255,215,0,0.3)' }}>
            <h2
              style={{
                fontFamily: "'DotGothic16', monospace",
                fontSize: '18px',
                color: '#FFD700',
                textShadow: '0 0 10px rgba(255,215,0,0.3)',
              }}
            >
              カードコレクション
            </h2>
            <button
              onClick={onClose}
              className="pixel-btn"
              style={{ padding: '0.25rem 0.75rem', fontSize: '12px' }}
            >
              ✕ とじる
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mb-3 flex-wrap">
            {(['ICON', 'HERO', 'UR', 'SR', 'R', 'N'] as string[]).map(r => (
              <div key={r} className="flex items-center gap-2">
                <RarityBadge rarity={r} />
                <span
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '10px',
                    color: RARITY_CONFIG[r].color,
                  }}
                >
                  x{rarityCount[r]}
                </span>
              </div>
            ))}
            <div className="ml-auto">
              <span
                style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: '12px',
                  color: '#8B9DC3',
                }}
              >
                合計: {cards.length}枚
              </span>
            </div>
          </div>

          {/* ヒント */}
          <div className="mb-2">
            <span style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: '8px',
              color: '#4a6fa5',
            }}>
              ▶ カードをクリックすると詳細を表示
            </span>
          </div>

          {/* Card List */}
          <div className="overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4a6fa5 #0a1628' }}>
            {sortedCards.length === 0 ? (
              <div className="text-center py-8">
                <p style={{ fontFamily: "'DotGothic16', monospace", fontSize: '14px', color: '#8B9DC3' }}>
                  まだカードがありません。
                </p>
                <p style={{ fontFamily: "'DotGothic16', monospace", fontSize: '12px', color: '#5a6f8a', marginTop: '0.5rem' }}>
                  パックを開封してカードを集めましょう！
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedCards.map((card, i) => {
                  const config = RARITY_CONFIG[card.rarity] ?? RARITY_CONFIG["N"];
                  const abilities: string[] = (card as any).specialAbilities ?? [];
                  const team: string = (card as any).team ?? '';
                  return (
                    <div
                      key={`${card.id}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 transition-all cursor-pointer"
                      style={{
                        backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderLeft: `3px solid ${config.borderColor}`,
                      }}
                      onClick={() => setSelectedCard(card)}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = `${config.glowColor}15`;
                        (e.currentTarget as HTMLElement).style.borderLeftColor = config.color;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                        (e.currentTarget as HTMLElement).style.borderLeftColor = config.borderColor;
                      }}
                    >
                      <div
                        className="w-8 text-center"
                        style={{
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: '12px',
                          color: config.color,
                          textShadow: `0 0 5px ${config.glowColor}`,
                        }}
                      >
                        {card.overall}
                      </div>
                      <RarityBadge rarity={card.rarity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: '14px', color: '#E8D5B0' }}>
                            {card.nameJa}
                          </span>
                          {team && (
                            <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '8px', color: '#5a6f8a' }}>
                              {team}
                            </span>
                          )}
                        </div>
                        {abilities.length > 0 && (
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {abilities.slice(0, 2).map((ab, ai) => (
                              <span key={ai} style={{
                                fontFamily: "'DotGothic16', monospace",
                                fontSize: '8px',
                                color: config.color,
                                opacity: 0.8,
                                border: `1px solid ${config.borderColor}50`,
                                padding: '0 3px',
                                backgroundColor: 'rgba(0,0,0,0.3)',
                              }}>
                                ⚡{ab}
                              </span>
                            ))}
                            {abilities.length > 2 && (
                              <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '7px', color: config.color, opacity: 0.5 }}>
                                +{abilities.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-sm">{card.countryFlag}</span>
                      <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '10px', color: config.color }}>
                        {card.position}
                      </span>
                      <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: '8px', color: config.color, opacity: 0.5 }}>
                        ▶
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 選手詳細モーダル */}
      {selectedCard && (
        <PlayerDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  );
}
