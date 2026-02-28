/**
 * GachaPage - SFC風ガチャページ
 * Design: スーパーファミコン風 RPGショップ画面
 * - 深い宇宙紺背景 + ゴールドアクセント
 * - Press Start 2P + DotGothic16 フォント
 * - ピクセルアート風ウィンドウ枠
 * - 10連ガチャ初回無料
 * - オープニングパック: 画面隅のバナーからポップアップ選択式
 */

import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import type { PlayerCard, PackType, Player } from '@/lib/cardData';
import { PACK_CONFIGS, drawOpeningPack } from '@/lib/cardData';
import PackOpening from '@/components/PackOpening';
import PackSelector from '@/components/PackSelector';
import Collection from '@/components/Collection';
import OpeningPackModal from '@/components/OpeningPackModal';
import { useCollection } from '@/hooks/useCollection';

// ── Design constants ──────────────────────────────────────────
const FONT_PIXEL = "'Press Start 2P', monospace";
const FONT_DOT   = "'DotGothic16', monospace";
const C_BG       = '#030810';
const C_GOLD     = '#F5C542';
const C_GOLD_DIM = '#8B6914';
const C_BLUE     = '#4488FF';
const C_RED      = '#E94560';
const C_GREEN    = '#16C47F';
const C_TEXT     = '#D0D8F0';
const C_TEXT_DIM = '#4A5A7A';
const C_PANEL    = '#0a1428';
const C_BORDER   = '#1a3060';

// ── SFC-style window border component ────────────────────────
function SfcWindow({ children, style, accent = C_GOLD_DIM }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}) {
  return (
    <div style={{
      position: 'relative',
      background: `linear-gradient(160deg, rgba(15,30,66,0.97) 0%, rgba(8,16,40,0.99) 100%)`,
      border: `2px solid ${accent}`,
      boxShadow: `0 4px 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)`,
      ...style,
    }}>
      {/* Inner border */}
      <div style={{
        position: 'absolute', inset: 3,
        border: `1px solid ${accent}33`,
        pointerEvents: 'none',
      }} />
      {/* Corner pixels */}
      {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', width: 6, height: 6,
          background: accent, ...pos as any,
        }} />
      ))}
      {children}
    </div>
  );
}

// ── Opening Pack Banner (small, bottom-right corner) ─────────
function OpeningPackBanner({ onOpen }: { onOpen: () => void }) {
  const [blink, setBlink] = useState(true);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        right: '12px',
        zIndex: 200,
        cursor: 'pointer',
        transform: hovered ? 'scale(1.05) translateY(-2px)' : 'scale(1)',
        transition: 'transform 0.2s ease',
      }}
    >
      <SfcWindow accent={C_GREEN} style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Blinking star */}
          <div style={{
            fontFamily: FONT_PIXEL, fontSize: '14px', color: C_GREEN,
            opacity: blink ? 1 : 0.3, transition: 'opacity 0.1s',
          }}>★</div>
          <div>
            <div style={{
              fontFamily: FONT_PIXEL, fontSize: 'clamp(6px, 1vw, 8px)',
              color: C_GREEN, letterSpacing: '0.05em',
              textShadow: `0 0 8px ${C_GREEN}88`,
            }}>OPENING PACK</div>
            <div style={{
              fontFamily: FONT_DOT, fontSize: 'clamp(9px, 1.3vw, 11px)',
              color: '#A0C0A0', marginTop: '2px',
            }}>スターターパックを受け取る</div>
          </div>
          <div style={{
            fontFamily: FONT_PIXEL, fontSize: '10px', color: C_GREEN,
            opacity: blink ? 1 : 0.3, transition: 'opacity 0.1s',
          }}>▶</div>
        </div>
      </SfcWindow>
    </div>
  );
}

// ── Opening Pack Confirm Dialog ───────────────────────────────
function OpeningPackConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,4,16,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <SfcWindow accent={C_GREEN} style={{ maxWidth: '360px', width: '100%', padding: '24px 20px' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header */}
          <div>
            <div style={{
              fontFamily: FONT_PIXEL, fontSize: 'clamp(9px, 2vw, 12px)',
              color: C_GREEN, letterSpacing: '0.08em',
              textShadow: `0 0 12px ${C_GREEN}88`,
              marginBottom: '8px',
            }}>★ OPENING PACK ★</div>
            <div style={{
              fontFamily: FONT_DOT, fontSize: 'clamp(14px, 2.5vw, 18px)',
              color: C_TEXT, fontWeight: 'bold',
            }}>スターターパック</div>
          </div>
          {/* Description */}
          <div style={{
            background: 'rgba(0,20,60,0.7)', border: `1px solid ${C_GREEN}44`,
            padding: '12px', fontFamily: FONT_DOT,
            fontSize: 'clamp(10px, 1.6vw, 13px)', color: '#A0C0A0',
            lineHeight: 1.7, textAlign: 'left',
          }}>
            <div>📦 全ポジション 各1名</div>
            <div>⚽ GK×1 / DF×4 / MF×4 / FW×2</div>
            <div>🎴 ノーマル限定 11枚</div>
            <div style={{ marginTop: '8px', color: C_GREEN, fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1vw, 9px)' }}>
              ★ 1回限り ★ 無料
            </div>
          </div>
          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={onConfirm}
              style={{
                fontFamily: FONT_PIXEL, fontSize: 'clamp(8px, 1.3vw, 10px)',
                background: `linear-gradient(180deg, ${C_GREEN}22 0%, rgba(0,20,40,0.9) 100%)`,
                border: `2px solid ${C_GREEN}`, color: C_GREEN,
                padding: '10px 20px', cursor: 'pointer',
                letterSpacing: '0.05em',
                boxShadow: `0 0 12px ${C_GREEN}44`,
              }}
            >▶ 受け取る</button>
            <button
              onClick={onCancel}
              style={{
                fontFamily: FONT_PIXEL, fontSize: 'clamp(8px, 1.3vw, 10px)',
                background: 'rgba(0,10,30,0.9)',
                border: `2px solid ${C_TEXT_DIM}`, color: C_TEXT_DIM,
                padding: '10px 20px', cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >✕ あとで</button>
          </div>
        </div>
      </SfcWindow>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function GachaPage() {
  const [, setLocation] = useLocation();
  const {
    collection, totalOpened, coins, openingPackDone, free10xUsed,
    addCards, spendCoins, markOpeningPackDone, markFree10xUsed,
  } = useCollection();
  const [showCollection, setShowCollection] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackType>('standard');
  const [insufficientCoins, setInsufficientCoins] = useState(false);

  // Opening pack states
  const [showOpeningConfirm, setShowOpeningConfirm] = useState(false);
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingCards, setOpeningCards] = useState<Player[]>([]);

  const handleOpeningBannerClick = useCallback(() => {
    setShowOpeningConfirm(true);
  }, []);

  const handleOpeningConfirm = useCallback(() => {
    const cards = drawOpeningPack();
    setOpeningCards(cards);
    setShowOpeningConfirm(false);
    setShowOpeningModal(true);
  }, []);

  const handleOpeningCancel = useCallback(() => {
    setShowOpeningConfirm(false);
  }, []);

  const handleOpeningPackClose = useCallback(() => {
    addCards(openingCards);
    markOpeningPackDone();
    setShowOpeningModal(false);
  }, [openingCards, addCards, markOpeningPackDone]);

  const packCost = PACK_CONFIGS[selectedPack].cost;
  // 10連は初回無料
  const isFree10x = selectedPack === 'ten' && !free10xUsed;
  const effectiveCost = isFree10x ? 0 : packCost;
  const canAfford = isFree10x || coins >= packCost;

  const handlePackOpened = useCallback((cards: PlayerCard[]) => {
    addCards(cards);
  }, [addCards]);

  const handleTryOpen = useCallback((): boolean => {
    if (isFree10x) {
      markFree10xUsed();
      return true;
    }
    const cost = PACK_CONFIGS[selectedPack].cost;
    if (coins < cost) {
      setInsufficientCoins(true);
      setTimeout(() => setInsufficientCoins(false), 2500);
      return false;
    }
    spendCoins(cost);
    return true;
  }, [selectedPack, coins, spendCoins, isFree10x, markFree10xUsed]);

  const collectionCards = collection.map(c => c.card);

  return (
    <div style={{
      position: 'relative',
      height: '100dvh',
      overflow: 'hidden',
      backgroundColor: C_BG,
      fontFamily: FONT_DOT,
      color: C_TEXT,
    }}>
      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.035) 3px, rgba(0,0,0,0.035) 4px)',
      }} />
      {/* Pixel grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.04,
        backgroundImage: `linear-gradient(rgba(255,215,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.4) 1px, transparent 1px)`,
        backgroundSize: '6px 6px',
      }} />
      {/* Radial glow */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(245,197,66,0.06) 0%, transparent 70%)',
      }} />

      {/* Scroll container */}
      <div style={{
        position: 'relative', zIndex: 1,
        height: '100%', overflowY: 'scroll', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch' as any, touchAction: 'pan-y',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
      }}>
        {/* ── Header ── */}
        <div style={{ padding: 'clamp(10px, 2vw, 16px) clamp(10px, 2vw, 16px) 0' }}>
          <SfcWindow accent={C_GOLD_DIM} style={{ padding: 'clamp(8px, 1.5vw, 14px) clamp(10px, 2vw, 18px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              {/* Title */}
              <div>
                <div style={{
                  fontFamily: FONT_PIXEL, fontSize: 'clamp(8px, 2vw, 13px)',
                  color: C_GOLD, letterSpacing: '0.06em',
                  textShadow: `2px 2px 0 #000, 0 0 12px ${C_GOLD}55`,
                }}>SOCCER CARD PACK</div>
                <div style={{
                  fontFamily: FONT_DOT, fontSize: 'clamp(10px, 1.5vw, 13px)',
                  color: '#6878A8', marginTop: '3px',
                }}>サッカーカードパック開封シミュレーター</div>
              </div>
              {/* Controls */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                {/* Coin display */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(0,6,20,0.9)', border: `2px solid ${C_GOLD_DIM}`,
                  padding: '4px 10px', fontFamily: FONT_PIXEL,
                  fontSize: 'clamp(8px, 1.4vw, 11px)', color: C_GOLD,
                  whiteSpace: 'nowrap',
                }}>
                  <span>🪙</span><span>{coins.toLocaleString()}</span>
                </div>
                {/* Collection button */}
                <button
                  onClick={() => setShowCollection(true)}
                  style={{
                    fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1.2vw, 9px)',
                    background: `linear-gradient(180deg, rgba(68,136,255,0.15) 0%, rgba(0,10,40,0.9) 100%)`,
                    border: `2px solid ${C_BLUE}`, color: C_BLUE,
                    padding: '5px 10px', cursor: 'pointer', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}
                >図鑑 ({collectionCards.length})</button>
                {/* TOP button */}
                <button
                  onClick={() => setLocation('/')}
                  style={{
                    fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1.2vw, 9px)',
                    background: 'rgba(0,6,20,0.9)', border: `2px solid ${C_BORDER}`,
                    color: C_TEXT_DIM, padding: '5px 10px', cursor: 'pointer',
                    letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}
                >◀ TOP</button>
              </div>
            </div>
          </SfcWindow>
        </div>

        {/* ── Main content ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: 'clamp(10px, 2vw, 16px)', gap: 'clamp(10px, 2vh, 16px)',
        }}>
          {/* Pack selector */}
          <PackSelector selectedPack={selectedPack} onSelect={setSelectedPack} coins={coins} />

          {/* Cost / Free badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: FONT_PIXEL, fontSize: 'clamp(7px, 1.2vw, 10px)',
          }}>
            {isFree10x ? (
              <div style={{
                background: `linear-gradient(90deg, ${C_GREEN}22, ${C_GREEN}11)`,
                border: `2px solid ${C_GREEN}`, color: C_GREEN,
                padding: '4px 14px', letterSpacing: '0.08em',
                boxShadow: `0 0 12px ${C_GREEN}44`,
              }}>★ 初回無料 ★</div>
            ) : (
              <>
                <span>🪙</span>
                <span style={{ color: canAfford ? C_GOLD : C_RED }}>{packCost}</span>
                <span style={{ color: C_TEXT_DIM, fontSize: 'clamp(6px, 0.9vw, 8px)' }}>
                  {canAfford ? '/ 購入可能' : '/ コイン不足'}
                </span>
              </>
            )}
          </div>

          {/* Pack opening */}
          <PackOpening
            onPackOpened={handlePackOpened}
            totalOpened={totalOpened}
            packType={selectedPack}
            onTryOpen={handleTryOpen}
          />
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '0 clamp(10px, 2vw, 16px)', paddingBottom: '8px' }}>
          <div style={{
            fontFamily: FONT_DOT, fontSize: 'clamp(8px, 1.2vw, 10px)',
            color: C_TEXT_DIM, textAlign: 'center', padding: '8px',
            borderTop: `1px solid ${C_BORDER}`,
          }}>
            総選手数 1034名 ／ ICON:0.5% / HERO:1.5% / UR:3% / SR:12% / R:28% / N:55%
          </div>
        </div>
      </div>

      {/* ── Insufficient coins toast ── */}
      {insufficientCoins && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', zIndex: 9100,
          transform: 'translate(-50%, -50%)',
          background: 'rgba(100,0,0,0.97)', border: `3px solid ${C_RED}`,
          padding: '16px 24px', textAlign: 'center',
          boxShadow: `0 0 30px ${C_RED}55`, pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: FONT_PIXEL, fontSize: 'clamp(8px, 1.5vw, 11px)', color: '#FF8888' }}>
            コインが足りません！
          </div>
          <div style={{ fontFamily: FONT_DOT, fontSize: 'clamp(10px, 1.5vw, 12px)', color: '#888', marginTop: '6px' }}>
            試合で勝利してコインを稼ごう！
          </div>
        </div>
      )}

      {/* ── Opening Pack Banner (bottom-right, only if not done) ── */}
      {!openingPackDone && !showOpeningConfirm && !showOpeningModal && (
        <OpeningPackBanner onOpen={handleOpeningBannerClick} />
      )}

      {/* ── Opening Pack Confirm Dialog ── */}
      {showOpeningConfirm && (
        <OpeningPackConfirm onConfirm={handleOpeningConfirm} onCancel={handleOpeningCancel} />
      )}

      {/* ── Opening Pack Modal ── */}
      {showOpeningModal && openingCards.length > 0 && (
        <OpeningPackModal cards={openingCards} onClose={handleOpeningPackClose} />
      )}

      {/* ── Collection Modal ── */}
      <Collection
        cards={collectionCards}
        isOpen={showCollection}
        onClose={() => setShowCollection(false)}
      />
    </div>
  );
}
