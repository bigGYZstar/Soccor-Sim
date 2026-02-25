import { useEffect, useRef } from 'react';

// --- game/ モジュールから必要なものをすべてインポート ---
import { State, V } from '../game/types';
import { P } from '../game/constants';
import { v, vadd, vscl } from '../game/math';
import { mkState, doKickOff, update } from '../game/engine';

// --- 描画レイヤー (UI依存) ---
// ※計算ロジック(update)には一切関与せず、渡されたStateを画面に描くだけの純粋な関数
const render = (ctx: CanvasRenderingContext2D, cvs: HTMLCanvasElement, st: State) => {
  const w = cvs.width;
  const h = cvs.height;
  
  // 描画スケールの計算
  const padW = 2.5; const padH = 3.5;
  const sc = Math.min(w / (P.pitchHalfW * 2 + padW), h / (P.pitchHalfH * 2 + padH));
  const ox = w / 2;
  const oy = h / 2 + 0.75 * sc;

  // ワールド座標(m) -> スクリーンのピクセル座標への変換関数
  const w2s = (p: V) => ({ x: ox + p.x * sc, y: oy - p.y * sc });
  const sval = (val: number) => val * sc;

  // 1. 背景
  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, w, h);

  // 2. ピッチ (芝生)
  const plW = sval(P.pitchHalfW); const plH = sval(P.pitchHalfH);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#145e30";
  ctx.fillRect(-plW, -plH, plW*2, plH*2);
  ctx.fillStyle = "#1a6b3a";
  const stripes = 12;
  const sw = (P.pitchHalfW * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) ctx.fillRect(sval(-P.pitchHalfW + i * sw), -plH, sval(sw), plH*2);
  }
  
  // 3. ピッチの白線
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, sc * 0.02);
  ctx.strokeRect(-plW, -plH, plW*2, plH*2); // 外枠
  
  ctx.beginPath(); // センターライン
  ctx.moveTo(0, -plH); ctx.lineTo(0, plH); ctx.stroke();
  
  ctx.beginPath(); // センターサークル
  ctx.arc(0, 0, sval(P.centreCircleR), 0, Math.PI*2); ctx.stroke();

  // ペナルティエリア・ゴールエリアの描画関数
  const drawArea = (sign: number) => {
    const gw = sval(P.penAreaW); const gh = sval(P.penAreaH);
    ctx.strokeRect(sign > 0 ? sval(P.pitchHalfW) - gw : sval(-P.pitchHalfW), -gh, gw, gh*2);
    
    const gaw = sval(P.goalAreaW); const gah = sval(P.goalAreaH);
    ctx.strokeRect(sign > 0 ? sval(P.pitchHalfW) - gaw : sval(-P.pitchHalfW), -gah, gaw, gah*2);
  };
  drawArea(1); drawArea(-1);
  ctx.restore();

  // 4. ゴールネット
  const drawGoal = (sign: number) => {
     // ここでインポートした `v` 関数を使用
     const p = w2s(v(sign * P.pitchHalfW, 0));
     ctx.fillStyle = "rgba(255,255,255,0.2)";
     const gw = sval(P.goalDepth); const gh = sval(P.goalHalfH);
     ctx.fillRect(sign > 0 ? p.x : p.x - gw, p.y - gh, gw, gh*2);
     ctx.strokeRect(sign > 0 ? p.x : p.x - gw, p.y - gh, gw, gh*2);
  };
  drawGoal(1); drawGoal(-1);

  // 5. 軌跡（パス・シュートのトレイル）
  if (st.trail) {
    const s = w2s(st.trail.start); const e = w2s(st.trail.end);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    if (st.trail.shot) {
      ctx.strokeStyle = "rgba(255,100,100,0.8)"; ctx.lineWidth = 4; ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 6. 選手
  st.pl.forEach(p => {
    const pos = w2s(p.pos);
    const r = sval(P.playerRadius);
    
    // ボール保持者のポゼッションリング
    if (st.ball.owner === p.slot + (p.team===1?11:0)) {
       ctx.beginPath();
       ctx.arc(pos.x, pos.y, r * 1.5, 0, Math.PI*2);
       ctx.strokeStyle = p.team === -1 ? "rgba(37,99,235,0.8)" : "rgba(220,38,38,0.8)";
       ctx.lineWidth = 3;
       ctx.stroke();
    }

    // 選手本体 (円とグラデーション)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI*2);
    const grad = ctx.createRadialGradient(pos.x-r*0.3, pos.y-r*0.3, r*0.1, pos.x, pos.y, r);
    if (p.team === -1) { 
      grad.addColorStop(0, p.isGK ? "#3b82f6" : "#60a5fa"); 
      grad.addColorStop(1, p.isGK ? "#1d4ed8" : "#2563eb"); 
    } else { 
      grad.addColorStop(0, p.isGK ? "#ef4444" : "#f87171"); 
      grad.addColorStop(1, p.isGK ? "#b91c1c" : "#dc2626"); 
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // ★ v8.9.0: Draw both feet (with safety check for HMR compatibility)
    if (p.leftFoot && p.rightFoot) {
    const footR = sval(P.footSize); // Foot visual radius (smaller than player)
    const leftFootPos = w2s(p.leftFoot.pos);
    const rightFootPos = w2s(p.rightFoot.pos);
    
    // Left foot - slightly darker shade
    ctx.beginPath();
    ctx.arc(leftFootPos.x, leftFootPos.y, Math.max(2, footR), 0, Math.PI * 2);
    if (p.team === -1) {
      ctx.fillStyle = p.footParams.dominantFoot === "L" ? "#93c5fd" : "#1e40af"; // Dominant=bright, Weak=dark
    } else {
      ctx.fillStyle = p.footParams.dominantFoot === "L" ? "#fca5a5" : "#7f1d1d";
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Right foot
    ctx.beginPath();
    ctx.arc(rightFootPos.x, rightFootPos.y, Math.max(2, footR), 0, Math.PI * 2);
    if (p.team === -1) {
      ctx.fillStyle = p.footParams.dominantFoot === "R" ? "#93c5fd" : "#1e40af"; // Dominant=bright, Weak=dark
    } else {
      ctx.fillStyle = p.footParams.dominantFoot === "R" ? "#fca5a5" : "#7f1d1d";
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    } // end foot safety check

    // 背番号
    ctx.fillStyle = "white";
    ctx.font = `bold ${Math.max(8, r)}px 'Roboto Condensed'`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.num.toString(), pos.x, pos.y);
  });

  // 7. ボール
  const bp = w2s(st.ball.pos);
  const br = sval(P.ballRadius);
  
  // ボールの影
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath(); ctx.ellipse(bp.x, bp.y + br*0.5, br, br*0.6, 0, 0, Math.PI*2); ctx.fill();

  // ボール本体
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, br, 0, Math.PI*2);
  const bgrad = ctx.createRadialGradient(bp.x-br*0.3, bp.y-br*0.3, 0, bp.x, bp.y, br);
  bgrad.addColorStop(0, "white"); bgrad.addColorStop(1, "#ccc");
  ctx.fillStyle = bgrad;
  ctx.fill();
  ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.stroke();

  // 8. 画面フラッシュ (GOAL! など)
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,220,${Math.min(0.8, st.flash * 0.5)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${st.flash})`;
    ctx.font = "italic 900 60px 'Roboto Condensed'";
    ctx.textAlign = "center";
    ctx.fillText(st.flashTxt, ox, oy);
  }

  // 9. HUD (スコアボードとタイマー)
  const hudW = Math.min(w * 0.55, sval(18));
  const hudH = 50;
  const hx = (w - hudW)/2;
  const hy = 20;

  ctx.fillStyle = "rgba(10,10,20,0.88)";
  ctx.beginPath(); ctx.roundRect(hx, hy, hudW, hudH, 8); ctx.fill();
  
  ctx.fillStyle = "#2563eb"; ctx.fillRect(hx, hy, 6, hudH);
  ctx.fillStyle = "#dc2626"; ctx.fillRect(hx + hudW - 6, hy, 6, hudH);

  ctx.fillStyle = "white";
  ctx.font = "bold 24px 'Roboto Condensed'";
  ctx.textAlign = "left"; ctx.fillText("BLUE", hx + 15, hy + 33);
  ctx.textAlign = "right"; ctx.fillText("RED", hx + hudW - 15, hy + 33);
  
  ctx.font = "bold 32px 'Roboto Condensed'";
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL} - ${st.sR}`, w/2, hy + 35);

  ctx.beginPath();
  ctx.moveTo(w/2 - 60, hy + hudH);
  ctx.lineTo(w/2 + 60, hy + hudH);
  ctx.lineTo(w/2 + 40, hy + hudH + 30);
  ctx.lineTo(w/2 - 40, hy + hudH + 30);
  ctx.fillStyle = "rgba(10,10,20,0.88)";
  ctx.fill();
  
  const min = Math.floor(st.time / 60);
  const sec = Math.floor(st.time % 60);
  ctx.fillStyle = "#aabbcc";
  ctx.font = "500 20px 'Roboto Mono'";
  ctx.fillText(`${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`, w/2, hy + hudH + 22);
};

// --- React コンポーネント本体 ---
export default function Home() {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  
  // エンジンの純粋なStateを保持 (コンポーネントの再レンダリングは発生させない)
  const stRef = useRef<State>(mkState());
  const reqRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = cvsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 初期化: エンジンレイヤーのキックオフ処理を呼び出す
    doKickOff(stRef.current);

    const onResize = () => {
      // Use viewport dimensions directly
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      
      // Set canvas to viewport size (CSS pixels)
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.width = vw + "px";
      canvas.style.height = vh + "px";
    };
    window.addEventListener('resize', onResize);
    onResize();

    // アニメーションループ
    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const elapsed = (t - lastTimeRef.current) / 1000;
      lastTimeRef.current = t;
      
      const dt = Math.min(0.05, elapsed); 

      if (dt > 0.001) {
        // ① 計算レイヤーを叩く (UI非依存)
        update(stRef.current, dt);
        // ② 描画レイヤーを叩く (UI依存)
        render(ctx, canvas, stRef.current);
      }
      reqRef.current = requestAnimationFrame(loop);
    };
    
    reqRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      width: "100vw", 
      height: "100vh", 
      background: "#0a0a10",
      overflow: "hidden"
    }}>
      <canvas 
        ref={cvsRef}
        style={{ 
          display: "block", 
          background: "#0a0a10", 
          touchAction: "none" 
        }}
      />
    </div>
  );
}
