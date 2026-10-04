"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
};

export function Knob({ value, min, max, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const shown = useRef(value);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = 2;
      canvas.width = 104;
      canvas.height = 104;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shown.current += (value - shown.current) * 0.22;
      const t = (shown.current - min) / (max - min || 1);
      const ang = -Math.PI * 0.78 + t * Math.PI * 1.56;
      ctx.clearRect(0, 0, 52, 52);
      ctx.translate(26, 26);

      const body = ctx.createRadialGradient(-6, -8, 2, 0, 0, 24);
      body.addColorStop(0, "#f2f6fa");
      body.addColorStop(0.35, "#9aa8b8");
      body.addColorStop(0.72, "#3c4652");
      body.addColorStop(1, "#151a20");
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0b0e12";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 18, -Math.PI * 0.78, -Math.PI * 0.78 + Math.PI * 1.56);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 18, -Math.PI * 0.78, ang);
      ctx.strokeStyle = "#7ee7ff";
      ctx.stroke();

      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = "#e8f7ff";
      ctx.fillRect(-1.2, -16, 2.4, 8);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(-5, -6, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [value, min, max]);

  const setFromDelta = (dy: number, start: number) => {
    const next = Math.min(max, Math.max(min, start - dy * ((max - min) / 140)));
    onChange(next);
  };

  return (
    <canvas
      ref={ref}
      onPointerDown={(e) => {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setFromDelta(e.clientY - drag.current.y, drag.current.v);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
