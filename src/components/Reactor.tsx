"use client";

import { useEffect, useRef } from "react";

type Props = {
  level: number;
  size: number;
  hue: number;
  spin: number;
  offsetY: number;
};

export function Reactor({ level, size, hue, spin, offsetY }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ level, size, hue, spin, offsetY, t: 0, smooth: 0 });
  state.current = { ...state.current, level, size, hue, spin, offsetY };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const s = state.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      s.t += 0.008 + s.spin * 0.02;
      s.smooth += (s.level - s.smooth) * 0.12;
      const energy = s.smooth;

      // True center, then optional user offset. Size is a fraction of the shorter side so it cannot clip.
      const cx = w / 2;
      const cy = h / 2 + s.offsetY;
      const base = Math.min(w, h) * 0.28 * s.size;
      const r = base * (1 + energy * 0.18);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.t * 0.35);

      const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.8);
      glow.addColorStop(0, `hsla(${s.hue}, 70%, 60%, ${0.18 + energy * 0.25})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wobble =
          Math.sin(a * 3 + s.t * 2) * 0.08 +
          Math.sin(a * 5 - s.t * 1.4) * 0.05 +
          Math.sin(a * 2 + energy * 6) * 0.06 * (0.4 + energy);
        const rr = r * (1 + wobble);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const metal = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.1, 0, 0, r);
      metal.addColorStop(0, "#f4fbff");
      metal.addColorStop(0.28, `hsl(${s.hue}, 35%, 72%)`);
      metal.addColorStop(0.62, `hsl(${s.hue + 20}, 22%, 28%)`);
      metal.addColorStop(1, "#0c1218");
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.strokeStyle = `hsla(${s.hue}, 80%, 70%, 0.45)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(-r * 0.22, -r * 0.28, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} />;
}
