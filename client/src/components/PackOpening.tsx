/*
 * PackOpening - カードパック開封演出コンポーネント
 * Design: SFC RPG風 16bitドット絵スタイル
 * 宝箱を開けるような演出でパックを開封する
 * フェーズ: idle → shaking → flash → revealing → done
 * パック種別: normal / standard / ten / legend / jleague
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PlayerCard, PackType } from '@/lib/cardData';
import { drawByPackType, RARITY_CONFIG, PACK_CONFIGS } from '@/lib/cardData';
import PlayerCardDisplay from './PlayerCardDisplay';
import PixelParticles from './PixelParticles';

type Phase = 'idle' | 'shaking' | 'flash' | 'lightPillar' | 'revealing' | 'done';

const PACK_IMAGE_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-2_1771940455000_na1fn_Y2FyZC1wYWNr.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTJfMTc3MTk0MDQ1NTAwMF9uYTFmbl9ZMkZ5WkMxd1lXTnIucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mANyktZnIvFo8NvaL0R7nvYyNCVSkkL7nOzsISHUYMIdbiGhZFoh9HpXiucYP-V7MC5-dkeuGwYEVLR-escMWJXFv8f-ecAnYi3BkQYnvnieFDR-x1GYQTOVyRFlUx43lU9IrcPaVIMX-bBL628XeeJGX61wiYQxFuIWy7esQz5AYA9a9jQMX5qBcxZOgGx4lhBs5VsyXFahRNBFI4XZn3McjBtMBYGyoqrnRzINdHzoC0ER06ap9Li~5qjeO-iKYVCRYL40A0PlAMzjoZvb0JUvylIYdikBXi1dz8TISDAXFwbVRXngPpQyTQjsj8pd8l~6Ygw4wDnaPqzr6N3yRg__';

const CHEST_IMAGE_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-4_1771940461000_na1fn_dHJlYXN1cmUtY2hlc3Q.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTRfMTc3MTk0MDQ2MTAwMF9uYTFmbl9kSEpsWVhOMWNtVXRZMmhsYzNRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=pqmEOS7OElVHceq7ySk2nV8LLgfDMJZofbb22dhTGGI38gl8svHKpRaMHuMWierum7MokxDbpe58r0ux3zwGJiUBNYdIVfqq2trfCHan4J1zc-DkqEHpXnULkyAa1n83IEXQLGehmP7ssJbbP0u1PUrWkKww4M6C9iHvSjJN6ey6PELKKFbJ52CkMkXsXC9o1f3RYRU5zeym8Y39k7NIQAqa363x9fq~rT-cY6bHXCo0s6SC1IG5N4St47Cf5GWtduuISRWxVpEDVW1h1~fY1CSl-exiiY90Xg2qKa-r9dY7QaNRd~MrEkKzuWywr44v2bvm9TxBhYFpCzbPt3a4GA__';

// レアリティの強さ順
const RARITY_ORDER: string[] = ['N', 'R', 'SR', 'UR', 'HERO', 'ICON'];

interface PackOpeningProps {
  onPackOpened?: (cards: PlayerCard[]) => void;
  totalOpened: number;
  packType: PackType;
}

export default function PackOpening({ onPackOpened, totalOpened, packType }: PackOpeningProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [bestRarity, setBestRarity] = useState<string>('N');
  const [revealedCount, setRevealedCount] = useState(0);
  const [messageText, setMessageText] = useState('');
  const [displayedMessage, setDisplayedMessage] = useState('');
  const messageTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const packCfg = PACK_CONFIGS[packType];

  // RPG-style typewriter message
  useEffect(() => {
    if (!messageText) {
      setDisplayedMessage('');
      return;
    }
    setDisplayedMessage('');
    let i = 0;
    messageTimerRef.current = setInterval(() => {
      i++;
      setDisplayedMessage(messageText.slice(0, i));
      if (i >= messageText.length) clearInterval(messageTimerRef.current);
    }, 50);
    return () => clearInterval(messageTimerRef.current);
  }, [messageText]);

  // パックが変わったらリセット
  useEffect(() => {
    setPhase('idle');
    setCards([]);
    setRevealedCount(0);
    setMessageText('');
    setDisplayedMessage('');
  }, [packType]);

  const getBestRarity = (drawnCards: PlayerCard[]): string => {
    let bestIdx = 0;
    drawnCards.forEach(c => {
      const idx = RARITY_ORDER.indexOf(c.rarity);
      if (idx > bestIdx) bestIdx = idx;
    });
    return RARITY_ORDER[bestIdx];
  };

  const getOpenMessage = (best: string): string => {
    switch (best) {
      case 'ICON': return '！！！ ICON 降臨 ！！！ 伝説の選手が現れた！';
      case 'HERO': return '！！ HERO 出現 ！！ クラブの英雄が現れた！';
      case 'UR': return '！！！ レジェンド降臨 ！！！';
      case 'SR': return '！ スーパーレア出現 ！';
      case 'R': return 'レアカードが含まれています！';
      default: return 'カードを獲得しました';
    }
  };

  const openPack = useCallback(() => {
    if (phase !== 'idle' && phase !== 'done') return;

    const drawnCards = drawByPackType(packType);
    setCards(drawnCards);
    setRevealedCount(0);
    const best = getBestRarity(drawnCards);
    setBestRarity(best);

    // Phase 1: Shaking
    setPhase('shaking');
    setMessageText(`${packCfg.name}を開封しています...`);

    const shakeTime =
      best === 'ICON' ? 2500 :
      best === 'HERO' ? 2200 :
      best === 'UR' ? 2000 :
      best === 'SR' ? 1500 :
      best === 'R' ? 1000 : 600;

    setTimeout(() => {
      // Phase 2: Flash
      setPhase('flash');

      setTimeout(() => {
        // Phase 3: Light Pillar (SR以上)
        if (['SR', 'UR', 'HERO', 'ICON'].includes(best)) {
          setPhase('lightPillar');
          setMessageText(getOpenMessage(best));

          const pillarTime =
            best === 'ICON' ? 2800 :
            best === 'HERO' ? 2400 :
            best === 'UR' ? 2000 : 1200;

          setTimeout(() => {
            setPhase('revealing');
            setMessageText('カードを確認してください！');
            setRevealedCount(drawnCards.length);
            onPackOpened?.(drawnCards);
          }, pillarTime);
        } else {
          setPhase('revealing');
          setMessageText(getOpenMessage(best));
          setRevealedCount(drawnCards.length);
          onPackOpened?.(drawnCards);
        }
      }, 400);
    }, shakeTime);
  }, [phase, onPackOpened, packType, packCfg]);

  const resetPack = useCallback(() => {
    setPhase('idle');
    setCards([]);
    setRevealedCount(0);
    setMessageText('');
    setDisplayedMessage('');
  }, []);

  // フラッシュ色
  const flashColor =
    bestRarity === 'ICON' ? '#FFFFFF' :
    bestRarity === 'HERO' ? '#00FFCC' :
    bestRarity === 'UR' ? '#FFD700' :
    bestRarity === 'SR' ? '#FFC107' : '#fff';

  // 光柱色
  const pillarColor =
    bestRarity === 'ICON' ? 'linear-gradient(180deg, transparent, #FFFFFF, #FFD700, #FFFFFF, transparent)' :
    bestRarity === 'HERO' ? 'linear-gradient(180deg, transparent, #00FFCC, #00FF88, #00FFCC, transparent)' :
    bestRarity === 'UR' ? 'linear-gradient(180deg, transparent, #FF4444, #FFD700, #FF4444, transparent)' :
    'linear-gradient(180deg, transparent, #FFD700, #FFC107, #FFD700, transparent)';

  const particleRarity = (['ICON', 'HERO', 'UR', 'SR'].includes(bestRarity) ? bestRarity : 'SR') as 'ICON' | 'HERO' | 'UR' | 'SR';

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Flash Overlay */}
      {phase === 'flash' && (
        <div
          className="fixed inset-0 z-50 pointer-events-none"
          style={{
            backgroundColor: flashColor,
            animation: 'flash-white 0.4s ease-out forwards',
          }}
        />
      )}

      {/* Light Pillar Effect */}
      {phase === 'lightPillar' && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div
            className="absolute"
            style={{
              width: ['ICON', 'HERO'].includes(bestRarity) ? '160px' : bestRarity === 'UR' ? '120px' : '80px',
              background: pillarColor,
              animation: 'light-pillar 2s ease-out forwards',
              filter: 'blur(2px)',
              opacity: 0.8,
            }}
          />
          {['ICON', 'UR'].includes(bestRarity) && (
            <>
              <div
                className="absolute"
                style={{
                  width: bestRarity === 'ICON' ? '300px' : '200px',
                  background: bestRarity === 'ICON'
                    ? 'linear-gradient(180deg, transparent, rgba(255,255,255,0.4), rgba(255,215,0,0.3), rgba(255,255,255,0.4), transparent)'
                    : 'linear-gradient(180deg, transparent, rgba(255,68,68,0.3), rgba(255,215,0,0.3), rgba(255,68,68,0.3), transparent)',
                  animation: 'light-pillar 2s ease-out 0.2s forwards',
                  filter: 'blur(8px)',
                }}
              />
              {Array.from({ length: bestRarity === 'ICON' ? 20 : 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: bestRarity === 'ICON'
                      ? (i % 3 === 0 ? '#FFFFFF' : i % 3 === 1 ? '#FFD700' : '#00FFCC')
                      : (i % 2 === 0 ? '#FFD700' : '#FF4444'),
                    animation: `star-burst 1.5s ease-out ${i * 0.08}s forwards`,
                    left: `${50 + Math.cos(i * (360 / (bestRarity === 'ICON' ? 20 : 12)) * Math.PI / 180) * 30}%`,
                    top: `${50 + Math.sin(i * (360 / (bestRarity === 'ICON' ? 20 : 12)) * Math.PI / 180) * 30}%`,
                    boxShadow: `0 0 10px ${bestRarity === 'ICON' ? '#FFFFFF' : '#FFD700'}`,
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Pack / Cards Area */}
      <div className="flex flex-col items-center gap-6">
        {/* Pack Display (idle/shaking) */}
        {(phase === 'idle' || phase === 'shaking') && (
          <div className="flex flex-col items-center gap-4">
            {/* Pack type indicator */}
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '10px',
                color: packCfg.color,
                textShadow: `0 0 8px ${packCfg.glowColor}`,
                letterSpacing: '1px',
                marginBottom: '4px',
              }}
            >
              {packCfg.icon} {packCfg.nameEn}
            </div>

            <div
              className="relative cursor-pointer transition-transform hover:scale-105"
              onClick={phase === 'idle' ? openPack : undefined}
              style={{
                animation: phase === 'shaking'
                  ? `shake ${bestRarity === 'UR' ? '0.1s' : bestRarity === 'SR' ? '0.15s' : '0.2s'} ease-in-out infinite`
                  : 'none',
              }}
            >
              {/* Pack glow border for legend pack */}
              {packType === 'legend' && phase === 'idle' && (
                <div
                  className="absolute inset-0"
                  style={{
                    border: `3px solid ${packCfg.borderColor}`,
                    boxShadow: `0 0 20px ${packCfg.glowColor}`,
                    animation: 'glow-pulse 1.5s ease-in-out infinite',
                    pointerEvents: 'none',
                  }}
                />
              )}
              <img
                src={PACK_IMAGE_URL}
                alt="Card Pack"
                className="w-48 h-auto drop-shadow-2xl"
                style={{
                  filter: phase === 'shaking'
                    ? `brightness(${1 + 0.3}) drop-shadow(0 0 20px ${packCfg.glowColor})`
                    : `drop-shadow(0 4px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 10px ${packCfg.glowColor})`,
                  imageRendering: 'auto',
                }}
              />
              {phase === 'idle' && (
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 animate-bounce"
                  style={{
                    fontFamily: "'DotGothic16', monospace",
                    color: packCfg.color,
                    textShadow: `0 0 10px ${packCfg.glowColor}`,
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ▼ タップして開封 ▼
                </div>
              )}
            </div>

            {/* Card count info */}
            {phase === 'idle' && (
              <div
                style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: '12px',
                  color: '#8B9DC3',
                  marginTop: '8px',
                  textAlign: 'center',
                }}
              >
                {packCfg.cardCount}枚引き ／ {packCfg.rateDisplay}
              </div>
            )}
          </div>
        )}

        {/* Treasure Chest (lightPillar phase) */}
        {phase === 'lightPillar' && (
          <div className="relative">
            <img
              src={CHEST_IMAGE_URL}
              alt="Treasure Chest"
              className="w-48 h-48 object-contain"
              style={{
                filter: `drop-shadow(0 0 30px ${RARITY_CONFIG[bestRarity as keyof typeof RARITY_CONFIG]?.glowColor ?? 'rgba(255,215,0,0.8)'})`,
                animation: 'glow-pulse 1s ease-in-out infinite',
                imageRendering: 'auto',
              }}
            />
            <PixelParticles
              rarity={particleRarity}
              active={true}
              count={['ICON', 'HERO'].includes(bestRarity) ? 60 : 40}
            />
          </div>
        )}

        {/* Revealed Cards */}
        {(phase === 'revealing' || phase === 'done') && cards.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            {/* 10連の場合は2行に分けて表示 */}
            {cards.length <= 5 ? (
              <div className="flex flex-wrap justify-center gap-2 px-2">
                {cards.map((card, i) => (
                  <PlayerCardDisplay
                    key={`${card.id}-${i}`}
                    card={card}
                    revealed={i < revealedCount}
                    index={i}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-1 px-2">
                  {cards.slice(0, 5).map((card, i) => (
                    <PlayerCardDisplay
                      key={`${card.id}-${i}`}
                      card={card}
                      revealed={i < revealedCount}
                      index={i}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-1 px-2">
                  {cards.slice(5).map((card, i) => (
                    <PlayerCardDisplay
                      key={`${card.id}-${i + 5}`}
                      card={card}
                      revealed={(i + 5) < revealedCount}
                      index={i + 5}
                    />
                  ))}
                </div>
              </div>
            )}

            {revealedCount >= cards.length && (
              <button
                className="pixel-btn mt-4"
                onClick={resetPack}
                style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: '16px',
                }}
              >
                もう一度開封する
              </button>
            )}
          </div>
        )}
      </div>

      {/* RPG Message Window */}
      {displayedMessage && (
        <div className="rpg-window mt-6 mx-auto max-w-lg">
          <p
            className="text-center"
            style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '14px',
              color: ['ICON', 'HERO', 'UR'].includes(bestRarity)
                ? RARITY_CONFIG[bestRarity as keyof typeof RARITY_CONFIG]?.color ?? '#FFD700'
                : bestRarity === 'SR' ? '#FFD700' : '#E8D5B0',
              textShadow: ['ICON', 'HERO', 'UR', 'SR'].includes(bestRarity)
                ? `0 0 10px ${RARITY_CONFIG[bestRarity as keyof typeof RARITY_CONFIG]?.glowColor ?? 'rgba(255,215,0,0.5)'}`
                : 'none',
              minHeight: '1.5em',
            }}
          >
            {displayedMessage}
            <span className="animate-pulse">▌</span>
          </p>
        </div>
      )}

      {/* Pack Counter */}
      <div className="rpg-window mt-4 mx-auto max-w-xs">
        <div className="flex justify-between items-center">
          <span
            style={{
              fontFamily: "'DotGothic16', monospace",
              fontSize: '12px',
              color: '#8B9DC3',
            }}
          >
            開封回数
          </span>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '14px',
              color: '#FFD700',
              textShadow: '0 0 5px rgba(255,215,0,0.3)',
            }}
          >
            {totalOpened}
          </span>
        </div>
      </div>
    </div>
  );
}
