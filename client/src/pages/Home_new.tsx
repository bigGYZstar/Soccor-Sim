import { useEffect, useRef, useState } from 'react';
import { State, V } from '../game/types';
import { P } from '../game/constants';
import { mkState, doKickOff, update } from '../game/engine';

// Import render function from backup (we'll keep the original render logic)
// For now, we'll use a simplified render - full render will be migrated later

const COL = {
  bg: "#0a0a10",
  pitch: "#1a4d2e",
  pitchDk: "#0f2818",
  line: "rgba(255,255,255,0.85)",
  blue: "#4a9eff",
  red: "#ff4757",
  ball: "#fff",
};

function render(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, st: State) {
  const W = c.width, H = c.height;
  const cW = P.pitchHalfW * 2 + 2.5, cH = P.pitchHalfH * 2 + 3.5;
  const sc = Math.min(W / cW, H / cH);
  const ox = W / 2, oy = H / 2 + 0.75 * sc;
  const w2s = (p: V): V => ({ x: ox + p.x * sc, y: oy - p.y * sc });
  const s = (n: number) => n * sc;

  // Background
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  // Pitch
  const tl = w2s({ x: -P.pitchHalfW, y: P.pitchHalfH });
  const pSz = { x: s(P.pitchHalfW * 2), y: s(P.pitchHalfH * 2) };
  const grd = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + pSz.y);
  grd.addColorStop(0, COL.pitch);
  grd.addColorStop(0.5, COL.pitchDk);
  grd.addColorStop(1, COL.pitch);
  ctx.fillStyle = grd;
  ctx.fillRect(tl.x, tl.y, pSz.x, pSz.y);

  // Pitch lines
  ctx.strokeStyle = COL.line;
  ctx.lineWidth = Math.max(1, s(0.035));
  ctx.strokeRect(tl.x, tl.y, pSz.x, pSz.y);

  // Center line
  const ct = w2s({ x: 0, y: P.pitchHalfH });
  const cb = w2s({ x: 0, y: -P.pitchHalfH });
  ctx.beginPath();
  ctx.moveTo(ct.x, ct.y);
  ctx.lineTo(cb.x, cb.y);
  ctx.stroke();

  // Center circle
  const cc = w2s({ x: 0, y: 0 });
  ctx.beginPath();
  ctx.arc(cc.x, cc.y, s(P.centreCircleR), 0, Math.PI * 2);
  ctx.stroke();

  // Goals
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  const gl = w2s({ x: -P.pitchHalfW - P.goalDepth, y: P.goalHalfH });
  ctx.fillRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = Math.max(1, s(0.03));
  ctx.strokeRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));

  const gr = w2s({ x: P.pitchHalfW, y: P.goalHalfH });
  ctx.fillRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));

  // Trail
  if (st.trail) {
    const tr = st.trail;
    const a = tr.t / P.trailDuration;
    const ts = w2s(tr.start);
    const te = w2s(tr.end);
    if (tr.shot) {
      ctx.strokeStyle = `rgba(255,100,30,${(0.65 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, s(0.08));
    } else if (tr.longPass) {
      ctx.strokeStyle = `rgba(255,220,80,${(0.5 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, s(0.05));
      ctx.setLineDash([s(0.18), s(0.1)]);
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${(0.4 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, s(0.04));
    }
    ctx.beginPath();
    ctx.moveTo(ts.x, ts.y);
    ctx.lineTo(te.x, te.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Players
  for (const p of st.pl) {
    const pp = w2s(p.pos);
    const pr = s(P.playerRadius);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(pp.x + s(0.05), pp.y + s(0.15), pr * 0.8, pr * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player circle
    ctx.fillStyle = p.team === -1 ? COL.blue : COL.red;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pr, 0, Math.PI * 2);
    ctx.fill();

    // Possession ring
    if (st.ball.owner === st.pl.indexOf(p)) {
      ctx.strokeStyle = "rgba(255,255,100,0.8)";
      ctx.lineWidth = Math.max(2, s(0.06));
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, pr * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Number
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(10, s(0.25))}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.num.toString(), pp.x, pp.y);
  }

  // Ball
  const bp = w2s(st.ball.pos);
  const br = s(P.ballRadius);

  // Ball shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(bp.x + s(0.03), bp.y + s(0.08), br * 1.2, br * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.fillStyle = COL.ball;
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, br, 0, Math.PI * 2);
  ctx.fill();

  // Lob indicator
  if (st.ball.lob > 0.3) {
    const lobH = s(st.ball.lob * 1.5);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y + lobH, br * 1.5, br * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // HUD
  const mins = Math.floor(st.time / 60);
  const secs = Math.floor(st.time % 60);
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(W / 2 - 120, 10, 240, 50);

  ctx.fillStyle = COL.blue;
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "right";
  ctx.fillText("BLUE", W / 2 - 60, 30);

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL} - ${st.sR}`, W / 2, 30);

  ctx.fillStyle = COL.red;
  ctx.textAlign = "left";
  ctx.fillText("RED", W / 2 + 60, 30);

  ctx.fillStyle = "#aaa";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(timeStr, W / 2, 50);

  // Flash text
  if (st.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${st.flash.toFixed(2)})`;
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.flashTxt, W / 2, H / 2 - 100);
  }

  // Game over
  if (st.over) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FULL TIME", W / 2, H / 2 - 50);
    ctx.font = "bold 48px Arial";
    ctx.fillText(`${st.sL} - ${st.sR}`, W / 2, H / 2 + 20);
  }
}

export default function Home() {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(mkState());
  const reqRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = cvsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    doKickOff(stRef.current);

    const onResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    window.addEventListener('resize', onResize);
    onResize();

    const loop = (t: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const elapsed = (t - lastTimeRef.current) / 1000;
      lastTimeRef.current = t;
      const dt = Math.min(0.05, elapsed);

      if (dt > 0.001) {
        // ① Call engine update (UI-independent)
        update(stRef.current, dt);
        // ② Call render (UI-dependent)
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
    <canvas
      ref={cvsRef}
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
        background: "#0a0a10",
        touchAction: "none",
      }}
    />
  );
}
