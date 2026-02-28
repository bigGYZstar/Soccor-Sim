/**
 * useCollection - ガチャコレクション永続化フック
 * LocalStorageを使って選手カードコレクションを保存・管理する
 * 
 * 機能:
 * - コレクションの永続化（ページリロード後も維持）
 * - カード追加・削除
 * - 開封回数の追跡
 * - チーム編成データの保存
 */

import { useState, useCallback, useEffect } from 'react';
import type { Player } from '@/lib/cardData';

const STORAGE_KEY_COLLECTION = 'soccer-sim-collection';
const STORAGE_KEY_OPENED = 'soccer-sim-total-opened';
const STORAGE_KEY_BLUE_TEAM = 'soccer-sim-blue-team';
const STORAGE_KEY_RED_TEAM = 'soccer-sim-red-team';
const STORAGE_KEY_COINS = 'soccer-sim-coins';
const STORAGE_KEY_OPENING_DONE = 'soccer-sim-opening-pack-done';

/** コレクション内の選手カード（取得時刻付き） */
export interface CollectedCard {
  card: Player;
  acquiredAt: number;  // timestamp
  uid: string;         // unique instance ID (same player can be collected multiple times)
}

/** チーム編成データ（11人のスロット） */
export interface TeamLineup {
  formationId: string;
  slots: (CollectedCard | null)[];  // 11 slots, null = empty
}

function generateUID(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to load ${key} from localStorage:`, e);
  }
  return fallback;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e);
  }
}

export function useCollection() {
  const [collection, setCollection] = useState<CollectedCard[]>(() =>
    loadFromStorage<CollectedCard[]>(STORAGE_KEY_COLLECTION, [])
  );
  const [totalOpened, setTotalOpened] = useState<number>(() =>
    loadFromStorage<number>(STORAGE_KEY_OPENED, 0)
  );
  const [blueTeam, setBlueTeam] = useState<TeamLineup>(() =>
    loadFromStorage<TeamLineup>(STORAGE_KEY_BLUE_TEAM, { formationId: '4-4-2', slots: Array(11).fill(null) })
  );
  const [redTeam, setRedTeam] = useState<TeamLineup>(() =>
    loadFromStorage<TeamLineup>(STORAGE_KEY_RED_TEAM, { formationId: '4-4-2', slots: Array(11).fill(null) })
  );
  const [coins, setCoins] = useState<number>(() =>
    loadFromStorage<number>(STORAGE_KEY_COINS, 500) // Start with 500 coins
  );
  const [openingPackDone, setOpeningPackDone] = useState<boolean>(() =>
    loadFromStorage<boolean>(STORAGE_KEY_OPENING_DONE, false)
  );

  // Persist collection changes
  useEffect(() => {
    saveToStorage(STORAGE_KEY_COLLECTION, collection);
  }, [collection]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_OPENED, totalOpened);
  }, [totalOpened]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_BLUE_TEAM, blueTeam);
  }, [blueTeam]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_RED_TEAM, redTeam);
  }, [redTeam]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_COINS, coins);
  }, [coins]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_OPENING_DONE, openingPackDone);
  }, [openingPackDone]);

  /** Add cards from a pack opening */
  const addCards = useCallback((cards: Player[]) => {
    const newCards: CollectedCard[] = cards.map(card => ({
      card,
      acquiredAt: Date.now(),
      uid: generateUID(),
    }));
    setCollection(prev => [...prev, ...newCards]);
    setTotalOpened(prev => prev + 1);
  }, []);

  /** Remove a specific card instance */
  const removeCard = useCallback((uid: string) => {
    setCollection(prev => prev.filter(c => c.uid !== uid));
  }, []);

  /** Clear entire collection */
  const clearCollection = useCallback(() => {
    setCollection([]);
    setTotalOpened(0);
    setBlueTeam({ formationId: '4-4-2', slots: Array(11).fill(null) });
    setRedTeam({ formationId: '4-4-2', slots: Array(11).fill(null) });
    setCoins(500);
    setOpeningPackDone(false);
  }, []);

  /** Mark opening pack as done (one-time only) */
  const markOpeningPackDone = useCallback(() => {
    setOpeningPackDone(true);
  }, []);

  /** Add coins */
  const addCoins = useCallback((amount: number) => {
    setCoins(prev => prev + amount);
  }, []);

  /** Spend coins (returns false if insufficient) */
  const spendCoins = useCallback((amount: number): boolean => {
    if (coins < amount) return false;
    setCoins(prev => prev - amount);
    return true;
  }, [coins]);

  /** Get unique players (deduplicated by id, keeping highest overall) */
  const uniquePlayers = useCallback((): CollectedCard[] => {
    const map = new Map<number | string, CollectedCard>();
    for (const c of collection) {
      const existing = map.get(c.card.id);
      if (!existing || c.card.overall > existing.card.overall) {
        map.set(c.card.id, c);
      }
    }
    return Array.from(map.values());
  }, [collection]);

  /** Set team lineup */
  const setTeamLineup = useCallback((team: 'blue' | 'red', lineup: TeamLineup) => {
    if (team === 'blue') setBlueTeam(lineup);
    else setRedTeam(lineup);
  }, []);

  /** Assign a card to a team slot */
  const assignToSlot = useCallback((team: 'blue' | 'red', slotIndex: number, card: CollectedCard | null) => {
    const setter = team === 'blue' ? setBlueTeam : setRedTeam;
    setter(prev => {
      const newSlots = [...prev.slots];
      // Remove this card from any other slot in this team
      if (card) {
        for (let i = 0; i < newSlots.length; i++) {
          if (newSlots[i]?.uid === card.uid) {
            newSlots[i] = null;
          }
        }
      }
      newSlots[slotIndex] = card;
      return { ...prev, slots: newSlots };
    });
  }, []);

  /** Set formation for a team */
  const setFormation = useCallback((team: 'blue' | 'red', formationId: string) => {
    const setter = team === 'blue' ? setBlueTeam : setRedTeam;
    setter(prev => ({ ...prev, formationId, slots: Array(11).fill(null) }));
  }, []);

  /** Check if a card is assigned to any team */
  const isCardAssigned = useCallback((uid: string): { team: 'blue' | 'red'; slot: number } | null => {
    for (let i = 0; i < blueTeam.slots.length; i++) {
      if (blueTeam.slots[i]?.uid === uid) return { team: 'blue', slot: i };
    }
    for (let i = 0; i < redTeam.slots.length; i++) {
      if (redTeam.slots[i]?.uid === uid) return { team: 'red', slot: i };
    }
    return null;
  }, [blueTeam, redTeam]);

  /** Get count of filled slots for a team */
  const filledSlots = useCallback((team: 'blue' | 'red'): number => {
    const lineup = team === 'blue' ? blueTeam : redTeam;
    return lineup.slots.filter(s => s !== null).length;
  }, [blueTeam, redTeam]);

  return {
    collection,
    totalOpened,
    coins,
    openingPackDone,
    blueTeam,
    redTeam,
    addCards,
    removeCard,
    clearCollection,
    uniquePlayers,
    setTeamLineup,
    assignToSlot,
    setFormation,
    isCardAssigned,
    filledSlots,
    addCoins,
    spendCoins,
    markOpeningPackDone,
  };
}
