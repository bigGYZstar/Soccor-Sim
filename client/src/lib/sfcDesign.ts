/**
 * SFC Design System - スーパーファミコン風共通デザイン定数
 * 
 * 設計思想:
 * - SFC/SNES時代のRPG（FF6, クロノトリガー, マザー2）を参考にした洗練されたレトロUI
 * - 深みのある紺色ベース + ゴールドアクセント + ドット絵風フォント
 * - ピクセルパーフェクトなボーダー・シャドウ・グロー効果
 * - 全ページで統一されたカラーパレット・タイポグラフィ
 */

// ============================================================
// TYPOGRAPHY
// ============================================================
export const FONT_PIXEL = "'Press Start 2P', monospace";   // メインタイトル・ラベル
export const FONT_DOT   = "'DotGothic16', monospace";      // 日本語テキスト・説明文
export const FONT_MONO  = "'Silkscreen', monospace";       // 数値・スコア・ステータス
export const FONT_BODY  = "'Roboto Condensed', sans-serif"; // 補助テキスト

// ============================================================
// COLOR PALETTE
// ============================================================
// Backgrounds
export const C_BG_DEEP    = '#050a18';   // 最深部背景（宇宙の黒）
export const C_BG_DARK    = '#0d1530';   // ページ背景
export const C_BG_PANEL   = '#0f1f45';   // パネル背景
export const C_BG_CARD    = '#132050';   // カード背景
export const C_BG_HEADER  = '#0a1535';   // ヘッダー背景
export const C_BG_HOVER   = '#1a2d5a';   // ホバー状態

// Borders
export const C_BORDER_DIM    = '#1e3060';  // 薄いボーダー
export const C_BORDER_NORMAL = '#2a4080';  // 通常ボーダー
export const C_BORDER_BRIGHT = '#4060b0';  // 明るいボーダー
export const C_BORDER_GOLD   = '#8B6914';  // ゴールドボーダー

// Accent Colors (SFC風の鮮やかな色)
export const C_GOLD         = '#F5C542';   // ゴールド（メインアクセント）
export const C_GOLD_BRIGHT  = '#FFD700';   // 明るいゴールド
export const C_GOLD_DIM     = '#B8860B';   // 暗いゴールド
export const C_RED          = '#E94560';   // レッド（危険・赤チーム）
export const C_RED_DIM      = '#8B2030';   // 暗いレッド
export const C_BLUE         = '#4488FF';   // ブルー（青チーム）
export const C_BLUE_DIM     = '#2255AA';   // 暗いブルー
export const C_GREEN        = '#16C47F';   // グリーン（成功・勝利）
export const C_GREEN_DIM    = '#0A7A4F';   // 暗いグリーン
export const C_CYAN         = '#00D4FF';   // シアン（情報・ハイライト）
export const C_PURPLE       = '#9B59B6';   // パープル（特別・レア）

// Text
export const C_TEXT_WHITE   = '#F0F4FF';   // メインテキスト
export const C_TEXT_BRIGHT  = '#FFFFFF';   // 強調テキスト
export const C_TEXT_DIM     = '#8B9DC3';   // 薄いテキスト
export const C_TEXT_MUTED   = '#4A5A7A';   // 非アクティブテキスト

// Rarity Colors (ガチャカード)
export const C_RARITY: Record<string, { color: string; glow: string; border: string }> = {
  ICON:  { color: '#FF4500', glow: 'rgba(255,69,0,0.6)',    border: '#FF4500' },
  HERO:  { color: '#FF8C00', glow: 'rgba(255,140,0,0.5)',   border: '#FF8C00' },
  UR:    { color: '#FFD700', glow: 'rgba(255,215,0,0.5)',   border: '#FFD700' },
  SR:    { color: '#C0A0FF', glow: 'rgba(192,160,255,0.4)', border: '#9B59B6' },
  R:     { color: '#4488FF', glow: 'rgba(68,136,255,0.4)',  border: '#2255AA' },
  N:     { color: '#8B9DC3', glow: 'rgba(139,157,195,0.2)', border: '#4A5A7A' },
};

// ============================================================
// SHADOWS & EFFECTS
// ============================================================
export const SHADOW_PANEL  = '0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)';
export const SHADOW_CARD   = '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)';
export const SHADOW_GOLD   = `0 0 20px rgba(245,197,66,0.3), 0 0 40px rgba(245,197,66,0.1)`;
export const SHADOW_BLUE   = `0 0 20px rgba(68,136,255,0.3), 0 0 40px rgba(68,136,255,0.1)`;
export const SHADOW_RED    = `0 0 20px rgba(233,69,96,0.3), 0 0 40px rgba(233,69,96,0.1)`;
export const SHADOW_TEXT_GOLD = `2px 2px 0px #000, 0 0 12px rgba(245,197,66,0.6)`;
export const SHADOW_TEXT_WHITE = `1px 1px 0px #000, 2px 2px 0px rgba(0,0,0,0.5)`;

// ============================================================
// COMMON STYLES (inline style objects)
// ============================================================

/** SFCウィンドウ枠スタイル */
export const styleWindow = (accentColor = C_BORDER_NORMAL): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${C_BG_PANEL} 0%, ${C_BG_DARK} 100%)`,
  border: `2px solid ${accentColor}`,
  boxShadow: SHADOW_PANEL,
  position: 'relative',
});

/** SFCボタンスタイル */
export const styleButton = (
  accentColor = C_GOLD,
  variant: 'primary' | 'secondary' | 'danger' = 'primary'
): React.CSSProperties => {
  const bgMap = {
    primary:   `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}11 100%)`,
    secondary: `linear-gradient(180deg, ${C_BG_PANEL} 0%, ${C_BG_DARK} 100%)`,
    danger:    `linear-gradient(180deg, ${C_RED}22 0%, ${C_RED}11 100%)`,
  };
  const borderMap = {
    primary:   accentColor,
    secondary: C_BORDER_NORMAL,
    danger:    C_RED,
  };
  return {
    fontFamily: FONT_PIXEL,
    background: bgMap[variant],
    border: `2px solid ${borderMap[variant]}`,
    color: variant === 'danger' ? C_RED : accentColor,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.05em',
    boxShadow: `0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
  };
};

/** SFCヘッダーバースタイル */
export const styleHeaderBar: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C_BG_HEADER} 0%, ${C_BG_DARK} 100%)`,
  borderBottom: `2px solid ${C_BORDER_NORMAL}`,
  boxShadow: `0 2px 12px rgba(0,0,0,0.5)`,
};

/** SFCページラッパースタイル */
export const stylePageWrapper: React.CSSProperties = {
  position: 'relative',
  height: '100dvh',
  overflow: 'hidden',
  backgroundColor: C_BG_DEEP,
  fontFamily: FONT_DOT,
  color: C_TEXT_WHITE,
};

/** SFCスクロールコンテナスタイル */
export const styleScrollContainer: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  height: '100%',
  overflowY: 'scroll',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch' as any,
  touchAction: 'pan-y',
  paddingBottom: 'env(safe-area-inset-bottom, 16px)',
};

// ============================================================
// SCANLINE OVERLAY (SFCモニター効果)
// ============================================================
export const ScanlineStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
  pointerEvents: 'none',
  zIndex: 9000,
};

// ============================================================
// PIXEL GRID BACKGROUND
// ============================================================
export const PixelGridStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
  opacity: 0.06,
  backgroundImage: `
    linear-gradient(rgba(68,136,255,0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(68,136,255,0.3) 1px, transparent 1px)
  `,
  backgroundSize: '8px 8px',
};

// React import for CSSProperties
import type React from 'react';
