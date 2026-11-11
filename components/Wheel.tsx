'use client';
import { useEffect, useRef, useState } from 'react';
import { animals, wheelTarget } from '@/lib/game';
import { AnimalArt } from './AnimalArt';
export function Wheel({
  group,
  roundId,
  duration = 7,
  sound = false,
  animations = true,
  onDone,
}: {
  group: number | null;
  roundId: string | null;
  duration?: number;
  sound?: boolean;
  animations?: boolean;
  onDone?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    rotation = useRef(0),
    callback = useRef(onDone);
  const config = useRef({ duration, sound, animations });
  config.current = { duration, sound, animations };
  callback.current = onDone;
  const [spinning, setSpinning] = useState(false),
    [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = 640 * dpr;
    c.height = 640 * dpr;
    ctx.scale(dpr, dpr);
    ctx.translate(320, 320);
    const radius = 289,
      step = (Math.PI * 2) / 25;
    for (let i = 0; i < 25; i++) {
      const start = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, start + step);
      ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 70, 0, 0, radius);
      g.addColorStop(0, '#151515');
      g.addColorStop(0.65, i % 2 ? '#171717' : '#242424');
      g.addColorStop(1, i % 2 ? '#202020' : '#2b2b2b');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#cbff00';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.rotate(start + step / 2);
      ctx.translate(239, 0);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), 0, -13);
      ctx.font = '27px "Segoe UI Emoji"';
      ctx.fillText(animals[i].icon, 0, 22);
      ctx.restore();
    }
    for (const [r, w, col] of [
      [302, 17, '#252525'],
      [307, 3, '#cbff00'],
      [294, 3, '#ffffff'],
      [283, 2, '#cbff00'],
      [160, 1, '#656565'],
    ] as [number, number, string][]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    for (let i = 0; i < 50; i++) {
      const a = (i * Math.PI * 2) / 50;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 303, Math.sin(a) * 303, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#cbff00';
      ctx.fill();
    }
  }, []);
  useEffect(() => {
    if (!group || !roundId) return;
    const c = canvas.current;
    if (!c) return;
    const reduced =
      !config.current.animations || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = rotation.current,
      target = wheelTarget(start, group);
    const ms = reduced ? 50 : config.current.duration * 1000;
    let frame = 0;
    const t = performance.now();
    setSpinning(true);
    setRevealed(null);
    let audio: AudioContext | undefined;
    try {
      if (config.current.sound) audio = new AudioContext();
    } catch {}
    let tick = -1;
    const animate = (now: number) => {
      const p = Math.min(1, (now - t) / ms),
        // Integral of an accelerating then decelerating velocity profile.
        e = p < 0.2 ? 5 * p * p : 1 - 1.25 * (1 - p) * (1 - p),
        value = start + (target - start) * e;
      c.style.transform = `rotate(${value}deg)`;
      rotation.current = value;
      const index = Math.floor(value / (360 / 25));
      if (audio && index !== tick && p < 0.96) {
        tick = index;
        const osc = audio.createOscillator(),
          gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 700;
        gain.gain.setValueAtTime(0.025, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.025);
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.03);
      }
      if (p < 1) frame = requestAnimationFrame(animate);
      else {
        rotation.current = target;
        setSpinning(false);
        setRevealed(group);
        if (audio?.state !== 'closed') void audio?.close().catch(() => {});
        callback.current?.();
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      if (audio?.state !== 'closed') void audio?.close().catch(() => {});
    };
  }, [group, roundId]);
  return (
    <div
      className={`wheel-stage ${spinning ? 'is-spinning' : ''}`}
      data-winning-group={revealed || undefined}
      aria-label="Roleta de 25 animais"
    >
      <div className="wheel-aura" />
      <div className="wheel-perspective">
        <div className="wheel-shadow" />
        <canvas ref={canvas} className="wheel-canvas" />
        <div className="wheel-hub">
          <span className="hub-crown">♛</span>
          <b>BICHOS</b>
          <span>VEGAS</span>
          <i>25 ANIMAIS · UMA EXPERIÊNCIA</i>
        </div>
      </div>
      <div className="wheel-pointer" />
      <div className="wheel-status">
        <span className={`live-dot ${spinning ? 'gold' : ''}`} />
        {spinning
          ? 'REVELANDO O RESULTADO'
          : revealed
            ? `${animals[revealed - 1].name.toUpperCase()} · GRUPO ${String(revealed).padStart(2, '0')}`
            : 'PRECISÃO EM CADA GIRO'}
      </div>
      {revealed && !spinning && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ left: `${18 + i * 5.8}%`, animationDelay: `${i * 0.03}s` }} />
          ))}
        </div>
      )}
      {revealed && !spinning && (
        <div className="wheel-reveal" role="status">
          <AnimalArt id={revealed} size={48} />
          <div>
            <small>RESULTADO DA RODADA</small>
            <strong>{animals[revealed - 1].name}</strong>
            <span>{animals[revealed - 1].tens.join(' · ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
