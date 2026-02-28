/*
 * GachaPage - サッカーカードパック開封シミュレーター メインページ
 * Design: SFC RPG風 16bitドット絵スタイル
 * パック選択 → 開封演出 → コレクション確認
 * ★ v10.2.0: コイン経済システム統合
 * ★ v10.2.1: iOS Safariスクロール修正 - position:fixedの背景を分離し
 *             スクロールコンテナを明確化。touch-action: panYを設定。
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

const HERO_BG_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-1_1771940463000_na1fn_aGVyby1iZw.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTFfMTc3MTk0MDQ2MzAwMF9uYTFmbl9hR1Z5YnkxaVp3LnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=CqZimzM6bAG8NS8ps5q6QXImbKsbx2PynL4GNW8THQoe51NYlnid6N010NroY4h85SAieyUgACpBVXp1L9qM004aldcycwWtezZqL~~qSMA6caJewpGp4PUqufvWMQpAr1WLtf4uLzYmdRtkDU2QmHtVQgpAITG7FL9j-EPlLA6-NLqVgmsr9eC-SeqPbUsNO~J9XYrNmj~GIC-UGCboW3e8qbZoev7EIJzBevimpDB9EsEi-GzNplFAZ9xd928~8rJdK9w~vpoi6gxwfSsm6mtguvouWn84SkycZ1WQCVb8NRCCvPKWgY4MbvFZWyfpPviZ9MqhGXj8LoPB~sh7Gg__';

const STADIUM_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-5_1771940471000_na1fn_cGl4ZWwtc3RhZGl1bQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTVfMTc3MTk0MDQ3MTAwMF9uYTFmbl9jR2w0Wld3dGMzUmhaR2wxYlEucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=LlzT9jWidb~deRw5OdV56ntfeLW~FZW99qAm6Q5hmfuYET6id5BjE8umB-Uo423BbfRtfVT3H-aQBKN17utfRX2N8eY7nyxFuUMQfhJ1d7FjtS3QNjxJarjzDDizaTd53FaU1bDKpZEFAEeDm9fUu3Kdvji2BOHcDkvFOmz-V0bD8xWj98iEtwrq-nBJ06oRLhgz7gy3SSXnBpDcuWTYtO4UzHk4rGzSzwkgYjRzhGq4WXwX9Gjqvu9wUDQXdgJ8iX7MquJOIjEOYYaZlLPLua3UnBkQ2B~uKhJpOjwaK-Rp1yyDSlsKiG0ue2a8fSMcCMiKy4bgry2b7kxeK90emw__';

export default function GachaPage() {
  const [, setLocation] = useLocation();
  const { collection, totalOpened, coins, openingPackDone, addCards, spendCoins, markOpeningPackDone } = useCollection();
  const [showCollection, setShowCollection] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackType>('standard');
  const [insufficientCoins, setInsufficientCoins] = useState(false);

  // ★ オープニングパック: 初回のみ自動表示
  const [showOpeningPack, setShowOpeningPack] = useState(false);
  const [openingCards, setOpeningCards] = useState<Player[]>([]);

  useEffect(() => {
    if (!openingPackDone) {
      // 初回訪問: オープニングパックを抽選して表示
      const cards = drawOpeningPack();
      setOpeningCards(cards);
      setShowOpeningPack(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpeningPackClose = useCallback(() => {
    // カードをコレクションに追加してモーダルを閉じる
    addCards(openingCards);
    markOpeningPackDone();
    setShowOpeningPack(false);
  }, [openingCards, addCards, markOpeningPackDone]);

  const packCost = PACK_CONFIGS[selectedPack].cost;
  const canAfford = coins >= packCost;

  const handlePackOpened = useCallback((cards: PlayerCard[]) => {
    addCards(cards);
  }, [addCards]);

  // ★ v10.2.0: Check coins before opening pack
  const handleTryOpen = useCallback((): boolean => {
    const cost = PACK_CONFIGS[selectedPack].cost;
    if (coins < cost) {
      setInsufficientCoins(true);
      setTimeout(() => setInsufficientCoins(false), 2000);
      return false;
    }
    spendCoins(cost);
    return true;
  }, [selectedPack, coins, spendCoins]);

  // Flatten collection to PlayerCard[] for the Collection component
  const collectionCards = collection.map(c => c.card);

  return (
    /*
     * ★ スクロール修正ポイント:
     * - 最外ラッパーは position:relative, height:100dvh, overflow:hidden にする
     * - 背景は position:absolute (fixedではなく) にして最外ラッパー内に収める
     * - スクロールするのは内側の scrollContainer のみ
     * - touch-action: pan-y で iOS Safariのスクロールを確実に有効化
     */
    <div
      className="scanlines"
      style={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        backgroundColor: '#050a1a',
      }}
    >
      {/* Background - absoluteで最外ラッパー内に固定 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${HERO_BG_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.4)',
          imageRendering: 'auto',
          pointerEvents: 'none',
        }}
      />

      {/* Pixel grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.1,
          backgroundImage: `
            linear-gradient(rgba(255,215,0,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,215,0,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '4px 4px',
        }}
      />

      {/* ★ スクロールコンテナ: 明示的にoverflow-y:scrollとtouch-action:pan-yを設定 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          overflowY: 'scroll',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as any,
          touchAction: 'pan-y',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
      >
        {/* Header */}
        <header style={{ padding: '12px 12px 0', flexShrink: 0 }}>
          <div style={{ maxWidth: '896px', margin: '0 auto' }}>
            <div className="rpg-window" style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h1
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 'clamp(8px, 2vw, 12px)',
                      color: '#FFD700',
                      textShadow: '0 0 10px rgba(255,215,0,0.5), 2px 2px 0 rgba(0,0,0,0.8)',
                      lineHeight: '1.8',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    SOCCER CARD PACK
                  </h1>
                  <p
                    style={{
                      fontFamily: "'DotGothic16', monospace",
                      fontSize: 'clamp(9px, 1.5vw, 12px)',
                      color: '#8B9DC3',
                      marginTop: '2px',
                    }}
                  >
                    サッカーカードパック開封シミュレーター
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  {/* ★ v10.2.0: Coin display */}
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 'clamp(8px, 1.5vw, 11px)',
                      color: '#FFD700',
                      background: 'rgba(0,10,40,0.9)',
                      border: '2px solid #B8860B',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span>🪙</span>
                    <span>{coins.toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => setLocation('/')}
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 'clamp(7px, 1.2vw, 9px)',
                      padding: '4px 8px',
                      background: 'rgba(0,10,40,0.8)',
                      border: '2px solid #4488ff',
                      color: '#88aacc',
                      cursor: 'pointer',
                      letterSpacing: '1px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ◀ TOP
                  </button>
                  <button
                    className="pixel-btn"
                    onClick={() => setShowCollection(true)}
                    style={{ fontSize: 'clamp(9px, 1.5vw, 12px)', padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}
                  >
                    図鑑 ({collectionCards.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Insufficient coins warning */}
        {insufficientCoins && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 100,
              background: 'rgba(139, 0, 0, 0.95)',
              border: '3px solid #FF4444',
              padding: '16px 24px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 'clamp(8px, 1.5vw, 12px)',
              color: '#FF8888',
              textAlign: 'center',
              boxShadow: '0 0 30px rgba(255,68,68,0.5)',
              pointerEvents: 'none',
            }}
          >
            コインが足りません！<br />
            <span style={{ fontSize: 'clamp(6px, 1vw, 9px)', color: '#999', marginTop: '4px', display: 'block' }}>
              試合で勝利してコインを稼ごう！
            </span>
          </div>
        )}

        {/* Main Content */}
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '12px',
            gap: '12px',
          }}
        >
          {/* Pack Selector with cost display */}
          <PackSelector
            selectedPack={selectedPack}
            onSelect={setSelectedPack}
            coins={coins}
          />

          {/* Cost indicator */}
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 'clamp(7px, 1.2vw, 10px)',
              color: canAfford ? '#FFD700' : '#FF4444',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🪙</span>
            <span>{packCost}</span>
            <span style={{ color: '#666', fontSize: 'clamp(6px, 1vw, 8px)' }}>
              {canAfford ? '/ 購入可能' : '/ コイン不足'}
            </span>
          </div>

          {/* Pack Opening */}
          <PackOpening
            onPackOpened={handlePackOpened}
            totalOpened={totalOpened}
            packType={selectedPack}
            onTryOpen={handleTryOpen}
          />
        </main>

        {/* Footer with Stadium */}
        <footer style={{ flexShrink: 0, marginTop: 'auto' }}>
          <div style={{ position: 'relative', height: '80px', overflow: 'hidden' }}>
            <img
              src={STADIUM_URL}
              alt="Stadium"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, imageRendering: 'auto' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
            <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
              <p
                style={{
                  fontFamily: "'DotGothic16', monospace",
                  fontSize: 'clamp(8px, 1.3vw, 11px)',
                  color: '#5a6f8a',
                }}
              >
                総選手数 1034名 ／ ICON:0.5% / HERO:1.5% / UR:3% / SR:12% / R:28% / N:55%
              </p>
            </div>
          </div>
        </footer>
      </div>

      {/* Collection Modal - fixedでスクロールコンテナの外に配置 */}
      <Collection
        cards={collectionCards}
        isOpen={showCollection}
        onClose={() => setShowCollection(false)}
      />

      {/* ★ オープニングパック: 初回のみ表示 */}
      {showOpeningPack && openingCards.length > 0 && (
        <OpeningPackModal
          cards={openingCards}
          onClose={handleOpeningPackClose}
        />
      )}
    </div>
  );
}
