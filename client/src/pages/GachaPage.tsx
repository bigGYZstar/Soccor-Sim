/*
 * GachaPage - サッカーカードパック開封シミュレーター メインページ
 * Design: SFC RPG風 16bitドット絵スタイル
 * パック選択 → 開封演出 → コレクション確認
 * useCollectionフックでLocalStorageに永続化
 */

import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import type { PlayerCard, PackType } from '@/lib/cardData';
import PackOpening from '@/components/PackOpening';
import PackSelector from '@/components/PackSelector';
import Collection from '@/components/Collection';
import { useCollection } from '@/hooks/useCollection';

const HERO_BG_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-1_1771940463000_na1fn_aGVyby1iZw.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTFfMTc3MTk0MDQ2MzAwMF9uYTFmbl9hR1Z5YnkxaVp3LnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=CqZimzM6bAG8NS8ps5q6QXImbKsbx2PynL4GNW8THQoe51NYlnid6N010NroY4h85SAieyUgACpBVXp1L9qM004aldcycwWtezZqL~~qSMA6caJewpGp4PUqufvWMQpAr1WLtf4uLzYmdRtkDU2QmHtVQgpAITG7FL9j-EPlLA6-NLqVgmsr9eC-SeqPbUsNO~J9XYrNmj~GIC-UGCboW3e8qbZoev7EIJzBevimpDB9EsEi-GzNplFAZ9xd928~8rJdK9w~vpoi6gxwfSsm6mtguvouWn84SkycZ1WQCVb8NRCCvPKWgY4MbvFZWyfpPviZ9MqhGXj8LoPB~sh7Gg__';

const STADIUM_URL = 'https://private-us-east-1.manuscdn.com/sessionFile/bApKv3n2R3hCPPkHL3aSNL/sandbox/6o0og1QJ64AfUSMNxuP9Kq-img-5_1771940471000_na1fn_cGl4ZWwtc3RhZGl1bQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYkFwS3YzbjJSM2hDUFBrSEwzYVNOTC9zYW5kYm94LzZvMG9nMVFKNjRBZlVTTU54dVA5S3EtaW1nLTVfMTc3MTk0MDQ3MTAwMF9uYTFmbl9jR2w0Wld3dGMzUmhaR2wxYlEucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=LlzT9jWidb~deRw5OdV56ntfeLW~FZW99qAm6Q5hmfuYET6id5BjE8umB-Uo423BbfRtfVT3H-aQBKN17utfRX2N8eY7nyxFuUMQfhJ1d7FjtS3QNjxJarjzDDizaTd53FaU1bDKpZEFAEeDm9fUu3Kdvji2BOHcDkvFOmz-V0bD8xWj98iEtwrq-nBJ06oRLhgz7gy3SSXnBpDcuWTYtO4UzHk4rGzSzwkgYjRzhGq4WXwX9Gjqvu9wUDQXdgJ8iX7MquJOIjEOYYaZlLPLua3UnBkQ2B~uKhJpOjwaK-Rp1yyDSlsKiG0ue2a8fSMcCMiKy4bgry2b7kxeK90emw__';

export default function GachaPage() {
  const [, setLocation] = useLocation();
  const { collection, totalOpened, addCards } = useCollection();
  const [showCollection, setShowCollection] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackType>('standard');

  const handlePackOpened = useCallback((cards: PlayerCard[]) => {
    addCards(cards);
  }, [addCards]);

  // Flatten collection to PlayerCard[] for the Collection component
  const collectionCards = collection.map(c => c.card);

  return (
    <div className="min-h-screen flex flex-col relative scanlines overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${HERO_BG_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.4)',
          imageRendering: 'auto',
        }}
      />

      {/* Pixel grid overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,215,0,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,215,0,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '4px 4px',
        }}
      />

      {/* Header */}
      <header className="relative z-10 py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rpg-window">
            <div className="flex items-center justify-between">
              <div>
                <h1
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '12px',
                    color: '#FFD700',
                    textShadow: '0 0 10px rgba(255,215,0,0.5), 2px 2px 0 rgba(0,0,0,0.8)',
                    lineHeight: '1.8',
                    letterSpacing: '0.05em',
                  }}
                >
                  SOCCER CARD PACK
                </h1>
                <p
                  style={{
                    fontFamily: "'DotGothic16', monospace",
                    fontSize: '12px',
                    color: '#8B9DC3',
                    marginTop: '2px',
                  }}
                >
                  サッカーカードパック開封シミュレーター
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setLocation('/')}
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    padding: '6px 12px',
                    background: 'rgba(0,10,40,0.8)',
                    border: '2px solid #4488ff',
                    color: '#88aacc',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                  }}
                >
                  ◀ もどる
                </button>
                <button
                  className="pixel-btn"
                  onClick={() => setShowCollection(true)}
                  style={{ fontSize: '12px', padding: '0.5rem 1rem' }}
                >
                  コレクション ({collectionCards.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start py-4 px-4 gap-4">
        {/* Pack Selector */}
        <PackSelector
          selectedPack={selectedPack}
          onSelect={setSelectedPack}
        />

        {/* Pack Opening */}
        <PackOpening
          onPackOpened={handlePackOpened}
          totalOpened={totalOpened}
          packType={selectedPack}
        />
      </main>

      {/* Footer with Stadium */}
      <footer className="relative z-10 mt-auto">
        <div className="relative h-24 overflow-hidden">
          <img
            src={STADIUM_URL}
            alt="Stadium"
            className="w-full h-full object-cover opacity-30"
            style={{ imageRendering: 'auto' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <p
              style={{
                fontFamily: "'DotGothic16', monospace",
                fontSize: '11px',
                color: '#5a6f8a',
              }}
            >
              総選手数 1034名 ／ ICON:0.5% / HERO:1.5% / UR:3% / SR:12% / R:28% / N:55%
            </p>
          </div>
        </div>
      </footer>

      {/* Collection Modal */}
      <Collection
        cards={collectionCards}
        isOpen={showCollection}
        onClose={() => setShowCollection(false)}
      />
    </div>
  );
}
