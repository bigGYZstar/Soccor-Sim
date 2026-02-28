/*
 * TeamBuilderPage - チーム編成画面
 * ガチャで集めた選手カードをフォーメーションの各ポジションに配置する
 * Design: SFC RPG風 16bitドット絵スタイル
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { FORMATIONS, FORMATION_IDS } from '@/game/constants';
import type { FormationId } from '@/game/constants';
import type { Player as CardPlayer } from '@/lib/cardData';
import { RARITY_CONFIG } from '@/lib/cardData';
import { useCollection, type CollectedCard, type TeamLineup } from '@/hooks/useCollection';

// ============================================================
// Style constants
// ============================================================
const RETRO_FONT = "'Press Start 2P', monospace";
const DOT_FONT = "'DotGothic16', monospace";

// Position category mapping for filtering
function posCategory(role: string): string {
  if (role === 'GK') return 'GK';
  if (['DEF', 'LB', 'RB', 'CB', 'LCB', 'RCB', 'LWB', 'RWB'].some(r => role.includes(r) || role === r)) return 'DF';
  if (['MID', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'LCM', 'RCM', 'LCDM', 'RCDM', 'LAM', 'RAM'].some(r => role.includes(r) || role === r)) return 'MF';
  return 'FW';
}

// Map card position to engine role category
function cardPosToCategory(pos: string): string {
  const p = pos.toUpperCase();
  if (p === 'GK') return 'GK';
  if (['DF', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].some(r => p.includes(r))) return 'DF';
  if (['MF', 'CM', 'CDM', 'CAM', 'DM', 'AM', 'LM', 'RM', 'WM'].some(r => p.includes(r))) return 'MF';
  return 'FW';
}

// Check position compatibility (how well a card fits a slot)
function positionFit(cardPos: string, slotRole: string): 'perfect' | 'good' | 'ok' | 'poor' {
  const cardCat = cardPosToCategory(cardPos);
  const slotCat = posCategory(slotRole);
  if (cardCat === slotCat) return 'perfect';
  // Adjacent categories
  if ((cardCat === 'MF' && (slotCat === 'FW' || slotCat === 'DF')) ||
      (cardCat === 'FW' && slotCat === 'MF') ||
      (cardCat === 'DF' && slotCat === 'MF')) return 'good';
  return 'poor';
}

const FIT_COLORS = {
  perfect: '#00ff88',
  good: '#FFD700',
  ok: '#ff8800',
  poor: '#ff4444',
};

const RARITY_ORDER: Record<string, number> = { ICON: 6, HERO: 5, UR: 4, SR: 3, R: 2, N: 1 };

// ============================================================
// Formation pitch display with clickable positions
// ============================================================
function FormationPitch({
  formationId,
  slots,
  activeSlot,
  onSlotClick,
  teamColor,
  teamLabel,
}: {
  formationId: FormationId;
  slots: (CollectedCard | null)[];
  activeSlot: number | null;
  onSlotClick: (idx: number) => void;
  teamColor: string;
  teamLabel: string;
}) {
  const formation = FORMATIONS[formationId];
  // Normalize positions to 0-100 range for display
  const positions = formation.positions.map(p => ({
    x: ((p.x + 52.5) / 105) * 100,  // 0 = left goal, 100 = right goal
    y: ((p.y + 34) / 68) * 100,      // 0 = top, 100 = bottom
  }));

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: '360px',
      aspectRatio: '1.2 / 1',
      background: 'linear-gradient(180deg, #145e30 0%, #0d4a24 100%)',
      border: `3px solid ${teamColor}`,
      borderRadius: '0px',
      overflow: 'hidden',
      boxShadow: `0 0 20px ${teamColor}33, inset 0 0 30px rgba(0,0,0,0.3)`,
    }}>
      {/* Pitch markings */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {/* Center line */}
        <line x1="50" y1="0" x2="50" y2="100" stroke="#2a8c4a" strokeWidth="0.5" />
        {/* Center circle */}
        <circle cx="50" cy="50" r="12" fill="none" stroke="#2a8c4a" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="1" fill="#2a8c4a" />
        {/* Penalty areas */}
        <rect x="0" y="25" width="16" height="50" fill="none" stroke="#2a8c4a" strokeWidth="0.5" />
        <rect x="84" y="25" width="16" height="50" fill="none" stroke="#2a8c4a" strokeWidth="0.5" />
        {/* Goal areas */}
        <rect x="0" y="35" width="6" height="30" fill="none" stroke="#2a8c4a" strokeWidth="0.5" />
        <rect x="94" y="35" width="6" height="30" fill="none" stroke="#2a8c4a" strokeWidth="0.5" />
      </svg>

      {/* Team label */}
      <div style={{
        position: 'absolute',
        top: '4px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: RETRO_FONT,
        fontSize: '8px',
        color: teamColor,
        textShadow: '1px 1px 0 #000',
        letterSpacing: '1px',
        zIndex: 5,
      }}>
        {teamLabel}
      </div>

      {/* Player positions */}
      {positions.map((pos, idx) => {
        const card = slots[idx];
        const isActive = activeSlot === idx;
        const label = formation.posLabels[idx];
        const rarityConfig = card ? (RARITY_CONFIG[card.card.rarity] ?? RARITY_CONFIG['N']) : null;

        return (
          <button
            key={idx}
            onClick={() => onSlotClick(idx)}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              width: card ? '40px' : '32px',
              height: card ? '40px' : '32px',
              borderRadius: '50%',
              background: card
                ? `radial-gradient(circle, ${rarityConfig?.color || teamColor}44, ${teamColor}cc)`
                : isActive
                  ? `${teamColor}cc`
                  : `${teamColor}66`,
              border: `2px solid ${isActive ? '#fff' : card ? (rarityConfig?.color || teamColor) : teamColor}`,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: isActive ? 10 : 2,
              transition: 'all 0.2s',
              boxShadow: isActive
                ? `0 0 15px ${teamColor}, 0 0 30px ${teamColor}66`
                : card
                  ? `0 0 8px ${rarityConfig?.color || teamColor}66`
                  : 'none',
              animation: isActive ? 'pulse 1s infinite' : 'none',
              padding: 0,
            }}
          >
            {card ? (
              <>
                <span style={{
                  fontFamily: RETRO_FONT,
                  fontSize: '6px',
                  color: '#fff',
                  textShadow: '1px 1px 0 #000',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '36px',
                }}>
                  {card.card.overall}
                </span>
                <span style={{
                  fontFamily: DOT_FONT,
                  fontSize: '7px',
                  color: '#fff',
                  textShadow: '1px 1px 0 #000',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '36px',
                }}>
                  {card.card.nameJa.slice(0, 3)}
                </span>
              </>
            ) : (
              <span style={{
                fontFamily: RETRO_FONT,
                fontSize: '6px',
                color: '#fff',
                textShadow: '1px 1px 0 #000',
              }}>
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Player card list for selection
// ============================================================
function PlayerList({
  cards,
  selectedSlotRole,
  onSelect,
  assignedUids,
  filterPos,
  setFilterPos,
  sortBy,
  setSortBy,
}: {
  cards: CollectedCard[];
  selectedSlotRole: string | null;
  onSelect: (card: CollectedCard) => void;
  assignedUids: Set<string>;
  filterPos: string;
  setFilterPos: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    let list = [...cards];

    // Filter by position
    if (filterPos !== 'ALL') {
      list = list.filter(c => cardPosToCategory(c.card.position) === filterPos);
    }

    // Sort
    if (sortBy === 'overall') {
      list.sort((a, b) => b.card.overall - a.card.overall);
    } else if (sortBy === 'rarity') {
      list.sort((a, b) => (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0));
    } else if (sortBy === 'fit' && selectedSlotRole) {
      const fitOrder = { perfect: 0, good: 1, ok: 2, poor: 3 };
      list.sort((a, b) => {
        const fa = fitOrder[positionFit(a.card.position, selectedSlotRole)];
        const fb = fitOrder[positionFit(b.card.position, selectedSlotRole)];
        if (fa !== fb) return fa - fb;
        return b.card.overall - a.card.overall;
      });
    }

    return list;
  }, [cards, filterPos, sortBy, selectedSlotRole]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      width: '100%',
    }}>
      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {['ALL', 'GK', 'DF', 'MF', 'FW'].map(pos => (
          <button
            key={pos}
            onClick={() => setFilterPos(pos)}
            style={{
              fontFamily: RETRO_FONT,
              fontSize: '7px',
              padding: '4px 8px',
              background: filterPos === pos ? '#FFD700' : 'rgba(0,10,40,0.8)',
              color: filterPos === pos ? '#000' : '#8899bb',
              border: `1px solid ${filterPos === pos ? '#FFD700' : '#334466'}`,
              cursor: 'pointer',
            }}
          >
            {pos}
          </button>
        ))}
        <span style={{ width: '8px' }} />
        {['overall', 'rarity', ...(selectedSlotRole ? ['fit'] : [])].map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            style={{
              fontFamily: DOT_FONT,
              fontSize: '10px',
              padding: '3px 6px',
              background: sortBy === s ? '#4488ff44' : 'transparent',
              color: sortBy === s ? '#4488ff' : '#556688',
              border: `1px solid ${sortBy === s ? '#4488ff' : '#223344'}`,
              cursor: 'pointer',
            }}
          >
            {s === 'overall' ? 'OVR' : s === 'rarity' ? 'レア度' : '適性'}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div style={{
        maxHeight: '300px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        paddingRight: '4px',
      }}>
        {filtered.length === 0 && (
          <div style={{
            fontFamily: DOT_FONT,
            fontSize: '12px',
            color: '#556688',
            textAlign: 'center',
            padding: '20px',
          }}>
            {cards.length === 0
              ? 'コレクションが空です。ガチャで選手を集めましょう！'
              : 'この条件に合う選手がいません'}
          </div>
        )}
        {filtered.map(c => {
          const isAssigned = assignedUids.has(c.uid);
          const rarityConfig = RARITY_CONFIG[c.card.rarity] ?? RARITY_CONFIG['N'];
          const fit = selectedSlotRole ? positionFit(c.card.position, selectedSlotRole) : null;

          return (
            <button
              key={c.uid}
              onClick={() => !isAssigned && onSelect(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                background: isAssigned ? 'rgba(0,10,40,0.4)' : 'rgba(0,10,40,0.8)',
                border: `1px solid ${isAssigned ? '#223344' : rarityConfig.borderColor + '66'}`,
                cursor: isAssigned ? 'not-allowed' : 'pointer',
                opacity: isAssigned ? 0.4 : 1,
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {/* OVR */}
              <span style={{
                fontFamily: RETRO_FONT,
                fontSize: '10px',
                color: rarityConfig.color,
                textShadow: `0 0 4px ${rarityConfig.color}44`,
                minWidth: '28px',
              }}>
                {c.card.overall}
              </span>

              {/* Position */}
              <span style={{
                fontFamily: RETRO_FONT,
                fontSize: '7px',
                color: '#8899bb',
                minWidth: '28px',
              }}>
                {c.card.position}
              </span>

              {/* Name */}
              <span style={{
                fontFamily: DOT_FONT,
                fontSize: '12px',
                color: '#ddd',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {c.card.nameJa}
              </span>

              {/* Flag */}
              <span style={{ fontSize: '12px' }}>{c.card.countryFlag}</span>

              {/* Fit indicator */}
              {fit && (
                <span style={{
                  fontFamily: RETRO_FONT,
                  fontSize: '6px',
                  color: FIT_COLORS[fit],
                  minWidth: '16px',
                  textAlign: 'right',
                }}>
                  {fit === 'perfect' ? '◎' : fit === 'good' ? '○' : '△'}
                </span>
              )}

              {/* Assigned indicator */}
              {isAssigned && (
                <span style={{
                  fontFamily: DOT_FONT,
                  fontSize: '9px',
                  color: '#556688',
                }}>
                  配置済
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Main TeamBuilderPage
// ============================================================
export default function TeamBuilderPage() {
  const [, setLocation] = useLocation();
  const {
    collection,
    uniquePlayers,
    blueTeam,
    redTeam,
    assignToSlot,
    setFormation,
    filledSlots,
  } = useCollection();

  const [activeTeam, setActiveTeam] = useState<'blue' | 'red'>('blue');
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [filterPos, setFilterPos] = useState('ALL');
  const [sortBy, setSortBy] = useState('overall');

  const currentTeam = activeTeam === 'blue' ? blueTeam : redTeam;
  const currentFormationId = currentTeam.formationId as FormationId;
  const formation = FORMATIONS[currentFormationId];

  // Get unique players for selection
  const uniqueCards = useMemo(() => uniquePlayers(), [uniquePlayers]);

  // Get all assigned UIDs across both teams
  const assignedUids = useMemo(() => {
    const uids = new Set<string>();
    for (const s of blueTeam.slots) if (s) uids.add(s.uid);
    for (const s of redTeam.slots) if (s) uids.add(s.uid);
    return uids;
  }, [blueTeam, redTeam]);

  // Auto-set filter when slot is selected
  useEffect(() => {
    if (activeSlot !== null && formation) {
      const role = formation.roles[activeSlot];
      const cat = posCategory(formation.posLabels[activeSlot]);
      setFilterPos(cat);
      setSortBy('fit');
    }
  }, [activeSlot, formation]);

  const handleSlotClick = useCallback((idx: number) => {
    setActiveSlot(prev => prev === idx ? null : idx);
  }, []);

  const handlePlayerSelect = useCallback((card: CollectedCard) => {
    if (activeSlot === null) return;
    assignToSlot(activeTeam, activeSlot, card);
    // Move to next empty slot
    const team = activeTeam === 'blue' ? blueTeam : redTeam;
    const nextEmpty = team.slots.findIndex((s, i) => i > activeSlot && s === null);
    if (nextEmpty >= 0) {
      setActiveSlot(nextEmpty);
    } else {
      const firstEmpty = team.slots.findIndex((s, i) => s === null && i !== activeSlot);
      setActiveSlot(firstEmpty >= 0 ? firstEmpty : null);
    }
  }, [activeSlot, activeTeam, assignToSlot, blueTeam, redTeam]);

  const handleFormationChange = useCallback((dir: number) => {
    const idx = FORMATION_IDS.indexOf(currentFormationId);
    const next = FORMATION_IDS[(idx + dir + FORMATION_IDS.length) % FORMATION_IDS.length];
    setFormation(activeTeam, next);
    setActiveSlot(null);
  }, [currentFormationId, activeTeam, setFormation]);

  const handleClearTeam = useCallback(() => {
    for (let i = 0; i < 11; i++) {
      assignToSlot(activeTeam, i, null);
    }
    setActiveSlot(null);
  }, [activeTeam, assignToSlot]);

  // Auto-fill: assign best players by position fit
  const handleAutoFill = useCallback(() => {
    const team = activeTeam === 'blue' ? blueTeam : redTeam;
    const used = new Set<string>();
    // Collect already assigned from the OTHER team
    const otherTeam = activeTeam === 'blue' ? redTeam : blueTeam;
    for (const s of otherTeam.slots) if (s) used.add(s.uid);

    const available = uniqueCards.filter(c => !used.has(c.uid));

    for (let i = 0; i < 11; i++) {
      if (team.slots[i]) {
        used.add(team.slots[i]!.uid);
      }
    }

    for (let i = 0; i < 11; i++) {
      if (team.slots[i]) continue;
      const slotRole = formation.posLabels[i];
      // Find best available player for this slot
      const candidates = available
        .filter(c => !used.has(c.uid))
        .sort((a, b) => {
          const fitOrder = { perfect: 0, good: 1, ok: 2, poor: 3 };
          const fa = fitOrder[positionFit(a.card.position, slotRole)];
          const fb = fitOrder[positionFit(b.card.position, slotRole)];
          if (fa !== fb) return fa - fb;
          return b.card.overall - a.card.overall;
        });

      if (candidates.length > 0) {
        assignToSlot(activeTeam, i, candidates[0]);
        used.add(candidates[0].uid);
      }
    }
    setActiveSlot(null);
  }, [activeTeam, blueTeam, redTeam, uniqueCards, formation, assignToSlot]);

  const blueFilledCount = filledSlots('blue');
  const redFilledCount = filledSlots('red');
  const canStartMatch = blueFilledCount === 11 && redFilledCount === 11;

  const handleStartMatch = useCallback(() => {
    // Navigate to match with team data (stored in localStorage via useCollection)
    setLocation('/match?mode=custom');
  }, [setLocation]);

  const selectedSlotRole = activeSlot !== null ? formation.posLabels[activeSlot] : null;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #050510 0%, #0a0e24 50%, #0f1a3a 100%)',
      fontFamily: DOT_FONT,
      color: '#eaeaea',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #1a2744',
        background: 'rgba(0,5,20,0.8)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <button
          onClick={() => setLocation('/')}
          style={{
            fontFamily: RETRO_FONT,
            fontSize: '8px',
            padding: '4px 10px',
            background: 'rgba(0,10,40,0.8)',
            border: '2px solid #4488ff',
            color: '#88aacc',
            cursor: 'pointer',
          }}
        >
          ◀ TOP
        </button>

        <div style={{
          fontFamily: RETRO_FONT,
          fontSize: '10px',
          color: '#FFD700',
          textShadow: '0 0 10px rgba(255,215,0,0.3)',
          letterSpacing: '2px',
        }}>
          TEAM BUILDER
        </div>

        <div style={{
          fontFamily: DOT_FONT,
          fontSize: '11px',
          color: '#556688',
        }}>
          所持: {uniqueCards.length}名
        </div>
      </header>

      {/* Team tabs */}
      <div style={{
        display: 'flex',
        gap: '0',
        padding: '0 12px',
        background: 'rgba(0,5,20,0.6)',
      }}>
        {(['blue', 'red'] as const).map(team => (
          <button
            key={team}
            onClick={() => { setActiveTeam(team); setActiveSlot(null); }}
            style={{
              flex: 1,
              padding: '8px',
              fontFamily: RETRO_FONT,
              fontSize: '9px',
              color: activeTeam === team
                ? (team === 'blue' ? '#4488ff' : '#ff4444')
                : '#445566',
              background: activeTeam === team ? 'rgba(0,10,40,0.8)' : 'transparent',
              border: 'none',
              borderBottom: activeTeam === team
                ? `3px solid ${team === 'blue' ? '#4488ff' : '#ff4444'}`
                : '3px solid transparent',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.2s',
            }}
          >
            {team === 'blue' ? `▶ BLUE (${blueFilledCount}/11)` : `RED ◀ (${redFilledCount}/11)`}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        gap: '12px',
        overflowY: 'auto',
      }}>
        {/* Formation selector + pitch */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
          {/* Formation selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <button
              onClick={() => handleFormationChange(-1)}
              style={{
                fontFamily: RETRO_FONT,
                fontSize: '12px',
                color: '#FFD700',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              ◀
            </button>
            <span style={{
              fontFamily: RETRO_FONT,
              fontSize: '12px',
              color: '#FFD700',
              letterSpacing: '2px',
              minWidth: '80px',
              textAlign: 'center',
            }}>
              {currentFormationId}
            </span>
            <button
              onClick={() => handleFormationChange(1)}
              style={{
                fontFamily: RETRO_FONT,
                fontSize: '12px',
                color: '#FFD700',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              ▶
            </button>
          </div>

          {/* Pitch */}
          <FormationPitch
            formationId={currentFormationId}
            slots={currentTeam.slots}
            activeSlot={activeSlot}
            onSlotClick={handleSlotClick}
            teamColor={activeTeam === 'blue' ? '#4488ff' : '#ff4444'}
            teamLabel={activeTeam === 'blue' ? 'BLUE TEAM' : 'RED TEAM'}
          />

          {/* Action buttons */}
          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            <button
              onClick={handleAutoFill}
              disabled={uniqueCards.length === 0}
              style={{
                fontFamily: DOT_FONT,
                fontSize: '11px',
                padding: '6px 14px',
                background: uniqueCards.length > 0 ? 'rgba(0,100,200,0.3)' : 'rgba(0,10,40,0.4)',
                border: '2px solid #4488ff',
                color: uniqueCards.length > 0 ? '#88ccff' : '#334466',
                cursor: uniqueCards.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              自動編成
            </button>
            <button
              onClick={handleClearTeam}
              style={{
                fontFamily: DOT_FONT,
                fontSize: '11px',
                padding: '6px 14px',
                background: 'rgba(100,0,0,0.3)',
                border: '2px solid #884444',
                color: '#cc8888',
                cursor: 'pointer',
              }}
            >
              クリア
            </button>
          </div>
        </div>

        {/* Slot info */}
        {activeSlot !== null && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0,10,40,0.8)',
            border: `2px solid ${activeTeam === 'blue' ? '#4488ff' : '#ff4444'}`,
          }}>
            <div style={{
              fontFamily: RETRO_FONT,
              fontSize: '8px',
              color: activeTeam === 'blue' ? '#4488ff' : '#ff4444',
              marginBottom: '4px',
            }}>
              SLOT {activeSlot + 1}: {formation.posLabels[activeSlot]}
            </div>
            {currentTeam.slots[activeSlot] && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '11px', color: '#aaa' }}>
                  現在: {currentTeam.slots[activeSlot]!.card.nameJa}
                  ({currentTeam.slots[activeSlot]!.card.overall})
                </span>
                <button
                  onClick={() => assignToSlot(activeTeam, activeSlot, null)}
                  style={{
                    fontFamily: DOT_FONT,
                    fontSize: '10px',
                    padding: '2px 8px',
                    background: 'rgba(100,0,0,0.3)',
                    border: '1px solid #884444',
                    color: '#cc8888',
                    cursor: 'pointer',
                  }}
                >
                  解除
                </button>
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#556688' }}>
              下のリストから選手をタップして配置
            </div>
          </div>
        )}

        {/* Player selection list */}
        <div style={{
          background: 'rgba(0,5,20,0.6)',
          border: '2px solid #1a2744',
          padding: '8px',
        }}>
          <div style={{
            fontFamily: RETRO_FONT,
            fontSize: '8px',
            color: '#FFD700',
            marginBottom: '8px',
            letterSpacing: '1px',
          }}>
            ── SELECT PLAYER ──
          </div>
          <PlayerList
            cards={uniqueCards}
            selectedSlotRole={selectedSlotRole}
            onSelect={handlePlayerSelect}
            assignedUids={assignedUids}
            filterPos={filterPos}
            setFilterPos={setFilterPos}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        padding: '12px',
        borderTop: '2px solid #1a2744',
        background: 'rgba(0,5,20,0.9)',
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'sticky',
        bottom: 0,
      }}>
        <button
          onClick={() => setLocation('/match')}
          style={{
            fontFamily: DOT_FONT,
            fontSize: '12px',
            padding: '8px 16px',
            background: 'rgba(0,10,40,0.8)',
            border: '2px solid #556688',
            color: '#8899bb',
            cursor: 'pointer',
          }}
        >
          クイックマッチ
        </button>

        <button
          onClick={handleStartMatch}
          disabled={!canStartMatch}
          style={{
            fontFamily: RETRO_FONT,
            fontSize: '10px',
            padding: '10px 24px',
            background: canStartMatch
              ? 'linear-gradient(180deg, #e94560, #c23050)'
              : 'rgba(0,10,40,0.4)',
            border: `3px solid ${canStartMatch ? '#FFD700' : '#334466'}`,
            color: canStartMatch ? '#FFD700' : '#445566',
            cursor: canStartMatch ? 'pointer' : 'not-allowed',
            letterSpacing: '2px',
            textShadow: canStartMatch ? '0 0 10px rgba(255,215,0,0.5)' : 'none',
            boxShadow: canStartMatch ? '0 0 20px rgba(233,69,96,0.4)' : 'none',
            transition: 'all 0.3s',
          }}
        >
          ⚽ KICK OFF ⚽
        </button>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
