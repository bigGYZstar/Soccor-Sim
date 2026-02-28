/**
 * OpeningPackModal - 初回限定オープニングパック
 * 
 * 仕様:
 * - ゲーム開始時に1度だけ開封可能
 * - 全ポジション（GK×1, DF×4, MF×4, FW×2）から各1名ずつ
 * - ノーマル（N）レアリティのみ
 * - 11枚のカードが順番に表示される
 */

import { useState, useEffect } from 'react';
import type { Player } from '@/lib/cardData';
import { RARITY_CONFIG } from '@/lib/cardData';

interface OpeningPackModalProps {
  cards: Player[];
  onClose: () => void;
}

interface CardRevealState {
  flipped: boolean;
  visible: boolean;
}

export default function OpeningPackModal({ cards, onClose }: OpeningPackModalProps) {
  const [phase, setPhase] = useState<'intro' | 'reveal' | 'all'>('intro');
  const [revealIndex, setRevealIndex] = useState(-1);
  const [cardStates, setCardStates] = useState<CardRevealState[]>(
    cards.map(() => ({ flipped: false, visible: false }))
  );
  const [allRevealed, setAllRevealed] = useState(false);

  // Intro → start reveal after 1.5s
  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(() => setPhase('reveal'), 1500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Reveal cards one by one
  useEffect(() => {
    if (phase !== 'reveal') return;
    if (revealIndex >= cards.length - 1) {
      setAllRevealed(true);
      return;
    }
    const next = revealIndex + 1;
    const t = setTimeout(() => {
      setCardStates(prev => {
        const s = [...prev];
        s[next] = { flipped: false, visible: true };
        return s;
      });
      setRevealIndex(next);
      // Auto-flip after 0.3s
      setTimeout(() => {
        setCardStates(prev => {
          const s = [...prev];
          s[next] = { ...s[next], flipped: true };
          return s;
        });
      }, 300);
    }, next === 0 ? 200 : 350);
    return () => clearTimeout(t);
  }, [phase, revealIndex, cards.length]);

  const handleCardClick = (idx: number) => {
    if (!cardStates[idx].visible) return;
    setCardStates(prev => {
      const s = [...prev];
      s[idx] = { ...s[idx], flipped: true };
      return s;
    });
  };

  const positionLabel = (pos: string) => {
    const map: Record<string, string> = {
      GK: 'GK', DF: 'DF', CB: 'CB', LB: 'LB', RB: 'RB',
      MF: 'MF', CM: 'CM', CAM: 'CAM', CDM: 'CDM', LM: 'LM', RM: 'RM',
      FW: 'FW', ST: 'ST', LW: 'LW', RW: 'RW',
    };
    return map[pos.toUpperCase()] || pos;
  };

  const positionColor = (pos: string) => {
    const p = pos.toUpperCase();
    if (p === 'GK') return '#FFD700';
    if (['DF', 'CB', 'LB', 'RB'].includes(p)) return '#4FC3F7';
    if (['MF', 'CM', 'CAM', 'CDM', 'LM', 'RM'].includes(p)) return '#81C784';
    return '#FF8A65';
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch' as any,
        touchAction: 'pan-y',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
      }}
    >
      {/* Header */}
      <div style={{
        width: '100%', textAlign: 'center',
        padding: '24px 16px 8px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          fontSize: 'clamp(10px, 2.5vw, 13px)',
          color: '#FFD700', letterSpacing: '0.3em',
          fontFamily: '"Press Start 2P", monospace',
          marginBottom: 4,
        }}>
          ★ OPENING PACK ★
        </div>
        <div style={{
          fontSize: 'clamp(18px, 5vw, 28px)',
          color: '#FFFFFF',
          fontFamily: '"Press Start 2P", monospace',
          textShadow: '0 0 20px rgba(255,215,0,0.8)',
          lineHeight: 1.3,
        }}>
          スターターパック
        </div>
        <div style={{
          fontSize: 'clamp(9px, 2vw, 11px)',
          color: '#8B9DC3',
          marginTop: 6,
          fontFamily: 'monospace',
        }}>
          全ポジション 各1名 ・ ノーマル限定 ・ 11枚
        </div>
      </div>

      {/* Intro phase */}
      {phase === 'intro' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 24, padding: '40px 16px',
        }}>
          <div style={{
            fontSize: 'clamp(48px, 15vw, 80px)',
            animation: 'pulse 0.8s ease-in-out infinite',
          }}>⚽</div>
          <div style={{
            fontSize: 'clamp(12px, 3vw, 16px)',
            color: '#FFD700',
            fontFamily: '"Press Start 2P", monospace',
            textAlign: 'center',
            animation: 'blink 0.6s step-end infinite',
          }}>
            OPENING...
          </div>
        </div>
      )}

      {/* Card grid */}
      {phase !== 'intro' && (
        <div style={{
          width: '100%',
          maxWidth: 520,
          padding: '8px 12px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(6px, 2vw, 10px)',
        }}>
          {cards.map((card, idx) => {
            const state = cardStates[idx];
            const rarityConf = RARITY_CONFIG[card.rarity] || RARITY_CONFIG['N'];
            const posColor = positionColor(card.position);

            return (
              <div
                key={idx}
                onClick={() => handleCardClick(idx)}
                style={{
                  aspectRatio: '2/3',
                  perspective: '600px',
                  cursor: state.visible && !state.flipped ? 'pointer' : 'default',
                  opacity: state.visible ? 1 : 0,
                  transform: state.visible ? 'scale(1)' : 'scale(0.5)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease',
                }}
              >
                {/* Card flip container */}
                <div style={{
                  width: '100%', height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.5s ease',
                  transform: state.flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}>
                  {/* Card Back */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #1a2744 0%, #0d1b3e 50%, #1a2744 100%)',
                    border: '2px solid #2a3a6a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}>
                    <div style={{
                      fontSize: 'clamp(20px, 6vw, 32px)',
                      opacity: 0.6,
                    }}>⚽</div>
                  </div>

                  {/* Card Front */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    borderRadius: 8,
                    background: `linear-gradient(135deg, #1a2744 0%, #0d1b3e 60%, #1a2744 100%)`,
                    border: `2px solid ${rarityConf.borderColor}`,
                    boxShadow: `0 0 12px ${rarityConf.glowColor}, 0 4px 12px rgba(0,0,0,0.5)`,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    padding: '6px',
                  }}>
                    {/* Position badge */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: 'clamp(7px, 1.8vw, 9px)',
                        color: posColor,
                        fontFamily: '"Press Start 2P", monospace',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '2px 4px',
                        borderRadius: 3,
                        border: `1px solid ${posColor}44`,
                      }}>
                        {positionLabel(card.position)}
                      </span>
                      <span style={{
                        fontSize: 'clamp(6px, 1.5vw, 8px)',
                        color: rarityConf.color,
                        fontFamily: '"Press Start 2P", monospace',
                      }}>
                        {card.rarity}
                      </span>
                    </div>

                    {/* Overall */}
                    <div style={{
                      textAlign: 'center',
                      fontSize: 'clamp(18px, 5vw, 26px)',
                      fontWeight: 'bold',
                      color: '#FFFFFF',
                      fontFamily: '"Press Start 2P", monospace',
                      textShadow: `0 0 8px ${rarityConf.glowColor}`,
                      lineHeight: 1,
                      marginBottom: 4,
                    }}>
                      {card.overall}
                    </div>

                    {/* Player name */}
                    <div style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textAlign: 'center',
                      fontSize: 'clamp(7px, 1.8vw, 9px)',
                      color: '#E0E8FF',
                      fontFamily: 'monospace',
                      lineHeight: 1.3,
                      padding: '0 2px',
                      overflow: 'hidden',
                    }}>
                      {card.nameJa || card.name}
                    </div>

                    {/* Club */}
                    <div style={{
                      textAlign: 'center',
                      fontSize: 'clamp(6px, 1.5vw, 7px)',
                      color: '#6B7FA3',
                      fontFamily: 'monospace',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {card.team || card.league || ''}
                    </div>

                    {/* Stats mini */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 2, marginTop: 4,
                    }}>
                      {[
                        { label: 'SPD', value: card.stats.speed },
                        { label: 'SHT', value: card.stats.shoot },
                        { label: 'PAS', value: card.stats.pass },
                        { label: 'DRB', value: card.stats.dribble },
                        { label: 'DEF', value: card.stats.defense },
                        { label: 'PHY', value: card.stats.physical },
                      ].map(s => (
                        <div key={s.label} style={{
                          textAlign: 'center',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 2,
                          padding: '1px 0',
                        }}>
                          <div style={{
                            fontSize: 'clamp(5px, 1.2vw, 6px)',
                            color: '#6B7FA3',
                            fontFamily: 'monospace',
                          }}>{s.label}</div>
                          <div style={{
                            fontSize: 'clamp(7px, 1.8vw, 9px)',
                            color: '#C8D8FF',
                            fontFamily: '"Press Start 2P", monospace',
                          }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All revealed - show close button */}
      {allRevealed && (
        <div style={{
          width: '100%', maxWidth: 520,
          padding: '8px 16px 24px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12,
        }}>
          <div style={{
            fontSize: 'clamp(9px, 2.2vw, 11px)',
            color: '#8B9DC3',
            fontFamily: 'monospace',
            textAlign: 'center',
          }}>
            11枚の選手がコレクションに追加されました！
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #FFD700, #FFA500)',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 'clamp(10px, 2.5vw, 13px)',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(255,215,0,0.5)',
              letterSpacing: '0.1em',
            }}
          >
            ▶ コレクションへ
          </button>
        </div>
      )}
    </div>
  );
}
