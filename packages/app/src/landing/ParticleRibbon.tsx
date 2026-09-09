import { useEffect, useRef } from 'react';
import { useThemeColors } from '../hooks/useThemeColors';

/** One bounded canvas, a 30fps ceiling, and no React updates in the drawing loop. */
export function ParticleRibbon() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { colorMode } = useThemeColors();
  useEffect(() => {
    const surface = canvas.current;
    const parent = surface?.parentElement;
    const context = surface?.getContext('2d', { alpha: true });
    if (!surface || !parent || !context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = matchMedia('(forced-colors: active)');
    const finePointer = matchMedia('(pointer: fine)');
    let width = 1,
      height = 1,
      frame = 0,
      last = 0,
      phase = 0,
      visible = true;
    let targetX = 0,
      targetY = 0,
      currentX = 0,
      currentY = 0;
    const points = Array.from({ length: 90 * 40 }, (_, i) => {
      const random = (Math.sin(i * 127.1 + 74.7) * 43758.5453) % 1;
      return {
        u: (((i % 90) + random * 0.45) / 89) * 2 - 1,
        v: ((Math.floor(i / 90) + random * 0.4) / 39) * 2 - 1,
        seed: Math.abs(random),
      };
    });
    const draw = (now: number) => {
      frame = 0;
      if (document.hidden || !visible || contrast.matches) return;
      const elapsed = Math.min(100, now - last || 33);
      if (!reduced.matches && elapsed < 32) {
        frame = requestAnimationFrame(draw);
        return;
      }
      last = now;
      if (!reduced.matches) phase += elapsed * 0.00012;
      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      context.clearRect(0, 0, width, height);
      const compact = width < 440;
      const spread = width * 0.49;
      for (let i = 0; i < points.length; i += compact ? 2 : 1) {
        const p = points[i];
        const wave = Math.sin(p.u * 3.7 + phase + p.v * 2.6);
        const depth = Math.cos(p.u * 2.4 + p.v * 1.7 + phase) * 110 + p.v * 75;
        const perspective = 600 / (600 + depth);
        const x = width * 0.5 + (p.u * spread + currentX * depth * 0.17) * perspective;
        const y =
          height * 0.52 +
          (wave * height * 0.23 + p.v * height * 0.16 + currentY * depth * 0.13) * perspective;
        const fade = Math.max(0, 1 - Math.abs(p.u) ** 6);
        const alpha = fade * (0.32 + p.seed * 0.5);
        const silver = p.seed > 0.58;
        context.fillStyle =
          colorMode === 'dark'
            ? `rgba(${silver ? '171,193,182' : '100,190,143'},${alpha})`
            : `rgba(${silver ? '92,110,100' : '24,102,66'},${alpha})`;
        context.beginPath();
        context.arc(x, y, Math.max(0.5, (0.8 + p.seed * 1.1) * perspective), 0, Math.PI * 2);
        context.fill();
      }
      surface.dataset.frame = String(Math.round(phase * 1000));
      if (!reduced.matches) frame = requestAnimationFrame(draw);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      draw(performance.now());
    };
    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      surface.width = Math.round(width * scale);
      surface.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      start();
    };
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || reduced.matches || event.pointerType === 'touch') return;
      const box = parent.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
      targetY = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
      parent.style.setProperty('--scene-tilt-x', `${-targetY * 5}deg`);
      parent.style.setProperty('--scene-tilt-y', `${targetX * 7}deg`);
    };
    const leave = () => {
      targetX = targetY = 0;
      parent.style.setProperty('--scene-tilt-x', '0deg');
      parent.style.setProperty('--scene-tilt-y', '0deg');
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      parent.dataset.sceneVisible = String(visible);
      start();
    });
    intersection.observe(parent);
    parent.addEventListener('pointermove', move);
    parent.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', start);
    reduced.addEventListener('change', start);
    contrast.addEventListener('change', start);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      parent.removeEventListener('pointermove', move);
      parent.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', start);
      reduced.removeEventListener('change', start);
      contrast.removeEventListener('change', start);
    };
  }, [colorMode]);
  return <canvas ref={canvas} className="pf-particle-ribbon" aria-hidden="true" />;
}
