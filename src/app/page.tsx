"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reactor } from "@/components/Reactor";
import { Knob } from "@/components/Knob";

type Band = { freq: number; gain: number; q: number; type: BiquadFilterType; on: boolean };
type Fx = {
  drive: number; tone: number; width: number; delay: number; feedback: number;
  delayMix: number; air: number; presence: number; gate: number; mix: number;
};

const START: Band[] = [
  { freq: 60, gain: 0, q: 0.7, type: "lowshelf", on: true },
  { freq: 150, gain: 0, q: 1, type: "peaking", on: true },
  { freq: 400, gain: 0, q: 1.1, type: "peaking", on: true },
  { freq: 1000, gain: 0, q: 1.2, type: "peaking", on: true },
  { freq: 2500, gain: 0, q: 1.1, type: "peaking", on: true },
  { freq: 6500, gain: 0, q: 1, type: "peaking", on: true },
  { freq: 14000, gain: 0, q: 0.7, type: "highshelf", on: true },
];

const PRESETS: Record<string, { bands: Band[]; fx: Partial<Fx> }> = {
  FLAT: { bands: START, fx: {} },
  VOCAL: {
    bands: START.map((b, i) => [{ ...b, gain: -1.5 }, { ...b, gain: -2 }, { ...b, gain: -1 }, { ...b, gain: 2.4 }, { ...b, gain: 3.2 }, { ...b, gain: 1.4 }, { ...b, gain: 1.8 }][i]),
    fx: { presence: 3, air: 2, drive: 0.12 },
  },
  LOWEND: {
    bands: START.map((b, i) => [{ ...b, gain: 4 }, { ...b, gain: 3 }, { ...b, gain: 1 }, b, { ...b, gain: -1 }, b, b][i]),
    fx: { tone: 8000, width: 0.7 },
  },
  AIR: {
    bands: START.map((b, i) => [b, b, b, { ...b, gain: 1 }, { ...b, gain: 2 }, { ...b, gain: 3.5 }, { ...b, gain: 4 }][i]),
    fx: { air: 6, presence: 2 },
  },
};

const freqToX = (f: number) => ((Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * 100;
const xToFreq = (x: number) => 10 ** (Math.log10(20) + (x / 100) * (Math.log10(20000) - Math.log10(20)));
const gainToY = (g: number) => 50 - (g / 18) * 42;
const yToGain = (y: number) => ((50 - y) / 42) * 18;
const fmt = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);

const curve = (amount: number) => {
  const n = 256;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * (1 + amount * 8));
  }
  return c;
};

export default function Page() {
  const [bands, setBands] = useState<Band[]>(START);
  const [fileName, setFileName] = useState("NO TRACK LOADED");
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [size, setSize] = useState(1);
  const [hue, setHue] = useState(198);
  const [spin, setSpin] = useState(0.35);
  const [offsetY, setOffsetY] = useState(0);
  const [react, setReact] = useState(1);
  const [threshold, setThreshold] = useState(-16);
  const [ratio, setRatio] = useState(2.4);
  const [attack, setAttack] = useState(0.012);
  const [release, setRelease] = useState(0.18);
  const [makeup, setMakeup] = useState(1);
  const [output, setOutput] = useState(0.86);
  const [fx, setFx] = useState<Fx>({ drive: 0.08, tone: 14000, width: 1, delay: 0.22, feedback: 0.22, delayMix: 0.12, air: 0, presence: 0, gate: -50, mix: 1 });
  const [peaks, setPeaks] = useState<number[]>([]);
  const [sel, setSel] = useState<[number, number]>([0.12, 0.62]);
  const [preset, setPreset] = useState("FLAT");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveAudioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const nodes = useRef<{ comp: DynamicsCompressorNode; out: GainNode; shaper: WaveShaperNode; tone: BiquadFilterNode; air: BiquadFilterNode; presence: BiquadFilterNode; delay: DelayNode; feedback: GainNode; wet: GainNode; dry: GainNode; analyser: AnalyserNode } | null>(null);
  const srcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const waveSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dragBand = useRef<number | null>(null);

  const poly = useMemo(() => `0,50 ${bands.map((b) => `${freqToX(b.freq)},${gainToY(b.gain)}`).join(" ")} 100,50`, [bands]);

  const ensure = async () => {
    if (ctxRef.current && nodes.current) return ctxRef.current;
    const ctx = new AudioContext();
    const filters = START.map(() => ctx.createBiquadFilter());
    filters.forEach((f, i) => { if (i < filters.length - 1) f.connect(filters[i + 1]); });
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve(0.08);
    shaper.oversample = "2x";
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 3200;
    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    const delay = ctx.createDelay(1.2);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const out = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    filters[filters.length - 1].connect(shaper);
    shaper.connect(tone);
    tone.connect(presence);
    presence.connect(air);
    air.connect(comp);
    comp.connect(dry);
    comp.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    dry.connect(out);
    wet.connect(out);
    out.connect(analyser);
    analyser.connect(ctx.destination);
    ctxRef.current = ctx;
    filtersRef.current = filters;
    nodes.current = { comp, out, shaper, tone, air, presence, delay, feedback, wet, dry, analyser };
    return ctx;
  };

  useEffect(() => {
    const ctx = ctxRef.current;
    const filters = filtersRef.current;
    if (!ctx || !filters.length) return;
    bands.forEach((b, i) => {
      const f = filters[i];
      f.type = b.on ? b.type : "allpass";
      f.frequency.setTargetAtTime(b.freq, ctx.currentTime, 0.03);
      f.gain.setTargetAtTime(b.on ? b.gain : 0, ctx.currentTime, 0.03);
      f.Q.setTargetAtTime(b.q, ctx.currentTime, 0.03);
    });
  }, [bands]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const n = nodes.current;
    if (!ctx || !n) return;
    n.comp.threshold.setTargetAtTime(Math.max(fx.gate, threshold), ctx.currentTime, 0.04);
    n.comp.ratio.setTargetAtTime(ratio, ctx.currentTime, 0.04);
    n.comp.attack.setTargetAtTime(attack, ctx.currentTime, 0.04);
    n.comp.release.setTargetAtTime(release, ctx.currentTime, 0.04);
    n.shaper.curve = curve(fx.drive);
    n.tone.frequency.setTargetAtTime(fx.tone, ctx.currentTime, 0.04);
    n.air.gain.setTargetAtTime(fx.air, ctx.currentTime, 0.04);
    n.presence.gain.setTargetAtTime(fx.presence, ctx.currentTime, 0.04);
    n.delay.delayTime.setTargetAtTime(fx.delay, ctx.currentTime, 0.05);
    n.feedback.gain.setTargetAtTime(fx.feedback, ctx.currentTime, 0.04);
    n.wet.gain.setTargetAtTime(fx.delayMix * fx.mix, ctx.currentTime, 0.04);
    n.dry.gain.setTargetAtTime((1 - fx.delayMix * 0.45) * fx.mix * fx.width, ctx.currentTime, 0.04);
    n.out.gain.setTargetAtTime(output * Math.pow(10, makeup / 20), ctx.currentTime, 0.04);
  }, [fx, threshold, ratio, attack, release, makeup, output]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = nodes.current?.analyser;
      if (a) {
        const data = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(data);
        setLevel(data.reduce((s, n) => s + n, 0) / data.length / 255);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const loadInto = async (file: File, which: "main" | "wave") => {
    const ctx = await ensure();
    if (ctx.state === "suspended") await ctx.resume();
    if (which === "main") {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = URL.createObjectURL(file);
      audioRef.current.loop = true;
      if (!srcRef.current) {
        srcRef.current = ctx.createMediaElementSource(audioRef.current);
        srcRef.current.connect(filtersRef.current[0]);
      }
      setFileName(file.name);
      await audioRef.current.play();
      setPlaying(true);
      return;
    }
    const audioBuf = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const channel = audioBuf.getChannelData(0);
    const bars = 220;
    const step = Math.max(1, Math.floor(channel.length / bars));
    const next: number[] = [];
    for (let i = 0; i < bars; i++) {
      let m = 0;
      for (let j = 0; j < step; j += 16) m = Math.max(m, Math.abs(channel[i * step + j] || 0));
      next.push(m);
    }
    setPeaks(next);
    if (!waveAudioRef.current) waveAudioRef.current = new Audio();
    waveAudioRef.current.src = URL.createObjectURL(file);
    if (!waveSrcRef.current) {
      waveSrcRef.current = ctx.createMediaElementSource(waveAudioRef.current);
      waveSrcRef.current.connect(filtersRef.current[0]);
    }
  };

  const setBand = (i: number, patch: Partial<Band>) => setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const setF = (patch: Partial<Fx>) => setFx((prev) => ({ ...prev, ...patch }));

  const onCurve = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (dragBand.current == null) {
      let best = 0, dist = 999;
      bands.forEach((b, i) => {
        const d = Math.hypot(freqToX(b.freq) - x, gainToY(b.gain) - y);
        if (d < dist) { dist = d; best = i; }
      });
      if (dist > 14) return;
      dragBand.current = best;
    }
    setBand(dragBand.current, { freq: Math.min(18000, Math.max(30, xToFreq(x))), gain: Math.min(16, Math.max(-16, yToGain(y))) });
  };

  return (
    <main className="shell">
      <nav className="nav">
        <div><div className="brand">WAVE</div><div className="sub">BY NODAW LABS</div></div>
        <div className="meta">LOCAL / 24-BIT / CENTERED REACTOR</div>
      </nav>
      <section className="hero">
        <div>
          <div className="kicker"><i />BROWSER AUDIO INSTRUMENT / 002</div>
          <h1>SHAPE<br />THE<br />SIGNAL.</h1>
          <p className="lede">Centered metal. Seven draggable bands. Drive, tone, width, delay, and dynamics on real knobs.</p>
          <div className="presets">
            {Object.keys(PRESETS).map((name) => (
              <button key={name} className={preset === name ? "on" : ""} onClick={() => { setPreset(name); setBands(PRESETS[name].bands); setF(PRESETS[name].fx); }}>{name}</button>
            ))}
          </div>
        </div>
        <div className="reactor-frame">
          <Reactor level={level * react} size={size} hue={hue} spin={spin} offsetY={offsetY} />
          <div className="reactor-label">AUDIO REACTOR <b>{Math.round(level * 99).toString().padStart(2, "0")}</b></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><span>7-BAND PARAMETRIC EQ</span><span>DRAG NODES · KNOBS SMOOTHED</span></div>
        <div className="transport">
          <button className="icon-btn" onClick={() => { const el = audioRef.current; if (!el) return; if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); } }}>{playing ? "II" : "▶"}</button>
          <label className="load-btn">↑ {fileName}<input hidden type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && loadInto(e.target.files[0], "main")} /></label>
          <button className="icon-btn" onClick={() => { setBands(START); setPreset("FLAT"); }}>↺</button>
        </div>
        <div className="curve-wrap">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={onCurve} onPointerMove={(e) => dragBand.current != null && onCurve(e)} onPointerUp={() => { dragBand.current = null; }}>
            {[20, 35, 50, 65, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />)}
            <polyline points={poly} fill="none" stroke="#7ee7ff" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            {bands.map((b, i) => <circle key={i} cx={freqToX(b.freq)} cy={gainToY(b.gain)} r="1.8" fill={b.on ? "#e8fbff" : "#445"} />)}
          </svg>
        </div>
        <div className="band-grid">
          {bands.map((b, i) => (
            <div className={`band ${b.on ? "on" : ""}`} key={i}>
              <div className="band-top"><span>{i + 1}</span><button onClick={() => setBand(i, { on: !b.on })}>{b.on ? "ON" : "OFF"}</button></div>
              <div className="knob-row">
                <div className="knob"><Knob value={b.gain} min={-16} max={16} onChange={(gain) => setBand(i, { gain })} /><span>GAIN</span><b>{b.gain.toFixed(1)}</b></div>
                <div className="knob"><Knob value={b.freq} min={30} max={18000} onChange={(freq) => setBand(i, { freq })} /><span>FREQ</span><b>{fmt(b.freq)}</b></div>
                <div className="knob"><Knob value={b.q} min={0.3} max={8} onChange={(q) => setBand(i, { q })} /><span>Q</span><b>{b.q.toFixed(1)}</b></div>
              </div>
            </div>
          ))}
        </div>

        <div className="section-label">COLOR</div>
        <div className="dyn-knobs">
          <div className="knob"><Knob value={fx.drive} min={0} max={1} onChange={(drive) => setF({ drive })} /><span>DRIVE</span><b>{fx.drive.toFixed(2)}</b></div>
          <div className="knob"><Knob value={fx.tone} min={800} max={18000} onChange={(tone) => setF({ tone })} /><span>TONE</span><b>{fmt(fx.tone)}</b></div>
          <div className="knob"><Knob value={fx.presence} min={-8} max={8} onChange={(presence) => setF({ presence })} /><span>PRESENCE</span><b>{fx.presence.toFixed(1)}</b></div>
          <div className="knob"><Knob value={fx.air} min={-6} max={8} onChange={(air) => setF({ air })} /><span>AIR</span><b>{fx.air.toFixed(1)}</b></div>
          <div className="knob"><Knob value={fx.width} min={0.4} max={1.4} onChange={(width) => setF({ width })} /><span>WIDTH</span><b>{fx.width.toFixed(2)}</b></div>
          <div className="knob"><Knob value={fx.mix} min={0} max={1.2} onChange={(mix) => setF({ mix })} /><span>MIX</span><b>{fx.mix.toFixed(2)}</b></div>
        </div>
        <div className="section-label">SPACE</div>
        <div className="dyn-knobs">
          <div className="knob"><Knob value={fx.delay} min={0.04} max={0.8} onChange={(delay) => setF({ delay })} /><span>TIME</span><b>{(fx.delay * 1000).toFixed(0)}</b></div>
          <div className="knob"><Knob value={fx.feedback} min={0} max={0.75} onChange={(feedback) => setF({ feedback })} /><span>FEEDBACK</span><b>{fx.feedback.toFixed(2)}</b></div>
          <div className="knob"><Knob value={fx.delayMix} min={0} max={0.7} onChange={(delayMix) => setF({ delayMix })} /><span>DELAY</span><b>{fx.delayMix.toFixed(2)}</b></div>
          <div className="knob"><Knob value={fx.gate} min={-70} max={-10} onChange={(gate) => setF({ gate })} /><span>GATE</span><b>{fx.gate.toFixed(0)}</b></div>
        </div>
        <div className="section-label">DYNAMICS</div>
        <div className="dyn-knobs">
          <div className="knob"><Knob value={threshold} min={-48} max={0} onChange={setThreshold} /><span>THRESH</span><b>{threshold.toFixed(0)}</b></div>
          <div className="knob"><Knob value={ratio} min={1} max={12} onChange={setRatio} /><span>RATIO</span><b>{ratio.toFixed(1)}</b></div>
          <div className="knob"><Knob value={attack} min={0.001} max={0.2} onChange={setAttack} /><span>ATTACK</span><b>{(attack * 1000).toFixed(0)}</b></div>
          <div className="knob"><Knob value={release} min={0.02} max={1} onChange={setRelease} /><span>RELEASE</span><b>{release.toFixed(2)}</b></div>
          <div className="knob"><Knob value={makeup} min={0} max={12} onChange={setMakeup} /><span>MAKEUP</span><b>{makeup.toFixed(1)}</b></div>
          <div className="knob"><Knob value={output} min={0} max={1.3} onChange={setOutput} /><span>OUT</span><b>{output.toFixed(2)}</b></div>
        </div>
        <div className="section-label">REACTOR</div>
        <div className="custom">
          <label>SIZE<input type="range" min={0.65} max={1.3} step={0.01} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
          <label>VERTICAL<input type="range" min={-30} max={30} step={1} value={offsetY} onChange={(e) => setOffsetY(+e.target.value)} /></label>
          <label>HUE<input type="range" min={170} max={320} step={1} value={hue} onChange={(e) => setHue(+e.target.value)} /></label>
          <label>SPIN<input type="range" min={0} max={1.4} step={0.01} value={spin} onChange={(e) => setSpin(+e.target.value)} /></label>
          <label>REACT<input type="range" min={0.2} max={2.2} step={0.01} value={react} onChange={(e) => setReact(+e.target.value)} /></label>
        </div>
      </section>

      <section className="wave">
        <div className="kicker">02 / SECOND ENGINE</div>
        <h2>THE WAVEFORM<br />IS THE INTERFACE.</h2>
        <label className="drop">
          {peaks.length ? (
            <svg viewBox="0 0 220 80" preserveAspectRatio="none" style={{ width: "100%", height: 240 }}>
              {peaks.map((p, i) => <rect key={i} x={i} y={40 - p * 34} width="0.8" height={Math.max(1, p * 68)} fill={i / peaks.length > sel[0] && i / peaks.length < sel[1] ? "#7ee7ff" : "#334455"} />)}
            </svg>
          ) : <span className="hint">Drop audio or click to load</span>}
          <input hidden type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && loadInto(e.target.files[0], "wave")} />
        </label>
        <div className="custom">
          <label>IN {(sel[0] * 100).toFixed(0)}%<input type="range" min={0} max={0.9} step={0.01} value={sel[0]} onChange={(e) => setSel([+e.target.value, Math.max(+e.target.value + 0.04, sel[1])])} /></label>
          <label>OUT {(sel[1] * 100).toFixed(0)}%<input type="range" min={0.08} max={1} step={0.01} value={sel[1]} onChange={(e) => setSel([Math.min(sel[0], +e.target.value - 0.04), +e.target.value])} /></label>
          <button className="icon-btn" style={{ width: "100%" }} onClick={async () => {
            const el = waveAudioRef.current;
            if (!el?.duration) return;
            const ctx = await ensure();
            if (ctx.state === "suspended") await ctx.resume();
            el.currentTime = sel[0] * el.duration;
            await el.play();
            const stop = sel[1] * el.duration;
            const watch = () => { if (el.currentTime >= stop) el.pause(); else requestAnimationFrame(watch); };
            watch();
          }}>PLAY CUT</button>
        </div>
      </section>
    </main>
  );
}
