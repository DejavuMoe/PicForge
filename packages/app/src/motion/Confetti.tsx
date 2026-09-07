import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  strip: boolean;
  age: number;
  ttl: number;
}

const GRAVITY = 1150;
const DRAG = 0.986;

function themeColors(): string[] {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return [
    read('--pf-accent', '#2f6bf0'),
    read('--pf-success', '#1d9e63'),
    read('--pf-text-tertiary', '#78808c'),
    '#ffffff',
  ];
}

/**
 * A single restrained confetti burst, fired when a batch completes.
 * Hand-rolled canvas physics; no-op under prefers-reduced-motion.
 */
export function Confetti({ burst }: { burst: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firedRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (burst === 0 || burst === firedRef.current) return undefined;
    firedRef.current = burst;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = themeColors();
    const originX = width / 2;
    const originY = height * 0.94;
    const particles: Particle[] = [];
    for (let i = 0; i < 84; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.15;
      const speed = 430 + Math.random() * 560;
      particles.push({
        x: originX + (Math.random() - 0.5) * 60,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
        size: 3.5 + Math.random() * 4,
        color: colors[i % colors.length],
        strip: Math.random() < 0.45,
        age: 0,
        ttl: 1.15 + Math.random() * 0.65,
      });
    }

    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.032, last ? (now - last) / 1000 : 0.016);
      last = now;
      context.clearRect(0, 0, width, height);
      let alive = 0;
      for (const particle of particles) {
        particle.age += dt;
        if (particle.age >= particle.ttl) continue;
        alive += 1;
        particle.vy += GRAVITY * dt;
        particle.vx *= DRAG;
        particle.vy *= DRAG;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.rotation += particle.spin * dt;
        const fade = 1 - Math.max(0, (particle.age / particle.ttl - 0.62) / 0.38);
        context.save();
        context.globalAlpha = Math.max(0, fade);
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        if (particle.strip) {
          context.fillRect(
            -particle.size * 0.28,
            -particle.size,
            particle.size * 0.56,
            particle.size * 2,
          );
        } else {
          context.beginPath();
          context.arc(0, 0, particle.size * 0.5, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
      if (alive > 0) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, width, height);
        rafRef.current = 0;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [burst]);

  return <canvas ref={canvasRef} className="pf-confetti" aria-hidden="true" />;
}
