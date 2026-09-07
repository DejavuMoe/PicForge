import { useEffect, useRef } from 'react';
import type { ColorMode } from '../contexts/ThemeContext';

interface ParticleFieldProps {
  colorMode: ColorMode;
  accent: string;
}

const VERTEX_SHADER = `
attribute vec2 aBase;
attribute vec3 aRand;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uDpr;
varying float vMix;
varying float vFade;
void main() {
  float t = uTime;
  vec2 p = aBase;
  p.x += sin(t * (0.10 + aRand.x * 0.22) + aRand.y * 6.2831) * (12.0 + aRand.z * 24.0);
  p.y += cos(t * (0.08 + aRand.y * 0.20) + aRand.z * 6.2831) * (12.0 + aRand.x * 24.0);
  vec2 delta = p - uMouse;
  float dist = length(delta);
  float force = smoothstep(150.0, 0.0, dist);
  p += normalize(delta + vec2(0.0001)) * force * 30.0;
  vec2 clip = (p / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float pulse = 0.75 + 0.25 * sin(t * (0.6 + aRand.x) + aRand.y * 6.2831);
  gl_PointSize = (1.2 + aRand.z * 2.2) * pulse * uDpr;
  vMix = aRand.y;
  vec2 edge = min(p, uRes - p) / uRes;
  vFade = smoothstep(0.0, 0.05, min(edge.x, edge.y));
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying float vMix;
varying float vFade;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.06, d) * uAlpha * vFade;
  if (a < 0.003) discard;
  vec3 color = mix(uColorA, uColorB, smoothstep(0.62, 0.95, vMix));
  gl_FragColor = vec4(color, a);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [0.36, 0.55, 1.0];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Restrained WebGL particle field used as the landing hero backdrop.
 *
 * Lifecycle notes: the effect is safe under React StrictMode's
 * setup → cleanup → setup replay. Cleanup deletes GL objects but never calls
 * `loseContext()` — a canvas returns the same (now-lost) context from the next
 * `getContext()` call, which previously produced a dead white canvas in dev.
 * If the context is lost at runtime, the decorative layer hides itself and the
 * static CSS background remains; content never depends on WebGL.
 */
export function ParticleField({ colorMode, accent }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef({ colorMode, accent });
  const renderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    themeRef.current = { colorMode, accent };
    // Repaint so theme changes also apply while the loop is paused
    // (reduced motion, off-screen or hidden tab).
    renderRef.current?.();
  }, [colorMode, accent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    }) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.hidden = true;
      return undefined;
    }

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.hidden = true;
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      canvas.hidden = true;
      return undefined;
    }
    gl.useProgram(program);

    const loc = {
      base: gl.getAttribLocation(program, 'aBase'),
      rand: gl.getAttribLocation(program, 'aRand'),
      res: gl.getUniformLocation(program, 'uRes'),
      time: gl.getUniformLocation(program, 'uTime'),
      mouse: gl.getUniformLocation(program, 'uMouse'),
      dpr: gl.getUniformLocation(program, 'uDpr'),
      colorA: gl.getUniformLocation(program, 'uColorA'),
      colorB: gl.getUniformLocation(program, 'uColorB'),
      alpha: gl.getUniformLocation(program, 'uAlpha'),
    };

    const baseBuffer = gl.createBuffer();
    const randBuffer = gl.createBuffer();
    if (!baseBuffer || !randBuffer) {
      canvas.hidden = true;
      return undefined;
    }

    let count = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const seedParticles = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      count = Math.round(Math.min(820, Math.max(140, (width * height) / 2400)));
      const base = new Float32Array(count * 2);
      const rand = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        base[i * 2] = Math.random() * width;
        base[i * 2 + 1] = Math.random() * height;
        rand[i * 3] = Math.random();
        rand[i * 3 + 1] = Math.random();
        rand[i * 3 + 2] = Math.random();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, baseBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, base, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.base);
      gl.vertexAttribPointer(loc.base, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, randBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.rand);
      gl.vertexAttribPointer(loc.rand, 3, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    seedParticles();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
    const handlePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = event.clientX - rect.left;
      mouse.ty = event.clientY - rect.top;
    };
    const handleLeave = () => {
      mouse.tx = -1e4;
      mouse.ty = -1e4;
    };
    window.addEventListener('pointermove', handlePointer, { passive: true });
    window.addEventListener('pointerleave', handleLeave);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    let visible = true;
    let time = Math.random() * 100;
    let last = 0;

    const render = () => {
      mouse.x += (mouse.tx - mouse.x) * 0.09;
      mouse.y += (mouse.ty - mouse.y) * 0.09;

      const { colorMode: mode, accent: accentHex } = themeRef.current;
      const accentRgb = hexToRgb(accentHex);
      const neutral: [number, number, number] =
        mode === 'dark' ? [0.62, 0.68, 0.8] : [0.32, 0.39, 0.52];
      gl.uniform2f(loc.res, width, height);
      gl.uniform1f(loc.time, time);
      gl.uniform2f(loc.mouse, mouse.x, mouse.y);
      gl.uniform1f(loc.dpr, dpr);
      gl.uniform3f(loc.colorA, neutral[0], neutral[1], neutral[2]);
      gl.uniform3f(loc.colorB, accentRgb[0], accentRgb[1], accentRgb[2]);
      gl.uniform1f(loc.alpha, mode === 'dark' ? 0.5 : 0.32);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    };
    renderRef.current = render;

    const loop = (now: number) => {
      const delta = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      time += delta;
      render();
      if (running) raf = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    render();
    if (!reduced) start();

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? true;
            if (visible) start();
            else stop();
          })
        : null;
    observer?.observe(canvas);

    let resizeFrame = 0;
    const resizeObserver =
      'ResizeObserver' in window
        ? new ResizeObserver(() => {
            window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(() => {
              seedParticles();
              render();
            });
          })
        : null;
    if (resizeObserver && canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    // Graceful degradation: if the driver drops the context, hide the
    // decorative canvas and keep the static CSS background. No recovery loop.
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      canvas.hidden = true;
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    return () => {
      stop();
      renderRef.current = null;
      window.cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pointermove', handlePointer);
      window.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      gl.deleteBuffer(baseBuffer);
      gl.deleteBuffer(randBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="pf-particle-field" aria-hidden="true" />;
}
