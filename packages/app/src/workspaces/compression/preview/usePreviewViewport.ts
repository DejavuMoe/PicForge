/**
 * Zoom, pan and split-slider state for the compression stage.
 *
 * Pointer moves write CSS variables directly (one write per animation frame); React state
 * is committed only when an interaction ends, so dragging never re-renders the stage.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { getSliderPointerMode } from '../../../utils/sliderCompare';

export interface CompareViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: CompareViewport = { zoom: 1, panX: 0, panY: 0 };

export function usePreviewViewport({
  fileId,
  outputWidth,
  outputHeight,
}: {
  fileId?: string;
  outputWidth?: number;
  outputHeight?: number;
}) {
  const [viewport, setViewport] = useState<CompareViewport>(DEFAULT_VIEWPORT);
  const [sliderPos, setSliderPos] = useState(50);
  const [isInteracting, setIsInteracting] = useState(false);

  const isPanning = useRef(false);
  const isDraggingSlider = useRef(false);
  const isInspecting = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<CompareViewport>(DEFAULT_VIEWPORT);
  const pendingViewportRef = useRef<CompareViewport | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    viewportRef.current = DEFAULT_VIEWPORT;
    pendingViewportRef.current = null;
    if (rafId.current !== null) {
      window.cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const container = containerRef.current;
    if (container) {
      container.style.setProperty('--preview-pan-x', '0px');
      container.style.setProperty('--preview-pan-y', '0px');
      container.style.setProperty('--preview-zoom', '1');
    }
    setViewport(DEFAULT_VIEWPORT);
    setSliderPos(50);
  }, [fileId, outputWidth, outputHeight]);

  const applyViewportVars = useCallback((nextViewport: CompareViewport) => {
    const container = containerRef.current;
    if (!container) return;
    container.style.setProperty('--preview-pan-x', `${nextViewport.panX}px`);
    container.style.setProperty('--preview-pan-y', `${nextViewport.panY}px`);
    container.style.setProperty('--preview-zoom', `${nextViewport.zoom}`);
  }, []);

  const commitViewport = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = null;
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      applyViewportVars(nextViewport);
      setViewport(nextViewport);
    },
    [applyViewportVars],
  );

  const scheduleViewportFrame = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = nextViewport;
      if (rafId.current !== null) return;

      rafId.current = window.requestAnimationFrame(() => {
        rafId.current = null;
        const pending = pendingViewportRef.current;
        if (!pending) return;
        pendingViewportRef.current = null;
        applyViewportVars(pending);
      });
    },
    [applyViewportVars],
  );

  const applyTransientViewport = useCallback(
    (nextViewport: CompareViewport) => {
      viewportRef.current = nextViewport;
      pendingViewportRef.current = null;
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      applyViewportVars(nextViewport);
    },
    [applyViewportVars],
  );

  useEffect(() => {
    viewportRef.current = viewport;
    if (!isPanning.current) {
      applyViewportVars(viewport);
    }
  }, [applyViewportVars, viewport]);

  useEffect(
    () => () => {
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    },
    [],
  );

  const resetViewport = useCallback(() => {
    commitViewport(DEFAULT_VIEWPORT);
  }, [commitViewport]);

  const setZoomLevel = useCallback(
    (zoom: number) => {
      commitViewport({
        zoom,
        panX: zoom === 1 ? 0 : viewportRef.current.panX,
        panY: zoom === 1 ? 0 : viewportRef.current.panY,
      });
    },
    [commitViewport],
  );

  const updateSliderFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(2, Math.min(98, x)));
  }, []);

  const getInspectPan = useCallback((target: HTMLElement, clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relativeY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      panX: (0.5 - relativeX) * rect.width,
      panY: (0.5 - relativeY) * rect.height,
    };
  }, []);

  const applyInteractionMove = useCallback(
    (clientX: number, clientY: number) => {
      if (isDraggingSlider.current) {
        updateSliderFromClientX(clientX);
        return;
      }

      if (!isPanning.current) return;

      scheduleViewportFrame({
        ...viewportRef.current,
        panX: panStart.current.panX + clientX - panStart.current.x,
        panY: panStart.current.panY + clientY - panStart.current.y,
      });
    },
    [scheduleViewportFrame, updateSliderFromClientX],
  );

  const finishInteraction = useCallback(() => {
    const shouldResetInspect = isInspecting.current;
    const shouldCommitPan = isPanning.current && !shouldResetInspect;
    const finalViewport = viewportRef.current;

    isPanning.current = false;
    isDraggingSlider.current = false;
    isInspecting.current = false;
    activePointerId.current = null;
    setIsInteracting(false);

    if (shouldResetInspect) {
      commitViewport(DEFAULT_VIEWPORT);
    } else if (shouldCommitPan) {
      commitViewport(finalViewport);
    }
  }, [commitViewport]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const isPinch = event.ctrlKey;
      const delta = isPinch ? -event.deltaY * 0.01 : -event.deltaY * 0.002;
      const currentViewport = viewportRef.current;
      const nextZoom = Math.max(
        1,
        Math.min(5, currentViewport.zoom + delta * currentViewport.zoom),
      );

      if (nextZoom === currentViewport.zoom) return;

      const mouseX = event.clientX - rect.left - rect.width / 2;
      const mouseY = event.clientY - rect.top - rect.height / 2;
      const scale = nextZoom / currentViewport.zoom;

      commitViewport({
        zoom: nextZoom,
        panX: mouseX - scale * (mouseX - currentViewport.panX),
        panY: mouseY - scale * (mouseY - currentViewport.panY),
      });
    },
    [commitViewport],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel, fileId]);

  const beginPointerInteraction = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    activePointerId.current = event.pointerId;
    return true;
  }, []);

  const handlePanPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const currentViewport = viewportRef.current;
      if (currentViewport.zoom <= 1) return;
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      isPanning.current = true;
      isInspecting.current = false;
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: currentViewport.panX,
        panY: currentViewport.panY,
      };
    },
    [beginPointerInteraction],
  );

  const handleSliderPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      isDraggingSlider.current = true;
      isInspecting.current = false;
      updateSliderFromClientX(event.clientX);
    },
    [beginPointerInteraction, updateSliderFromClientX],
  );

  /** Split view: near the line drags the split; elsewhere pans when zoomed. */
  const handleSliderComparePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (
        event.pointerType === 'touch' &&
        viewportRef.current.zoom <= 1 &&
        Math.abs(event.clientX - rect.left - (rect.width * sliderPos) / 100) > 24
      )
        return;
      const mode = getSliderPointerMode({
        zoom: viewportRef.current.zoom,
        sliderPos,
        clientX: event.clientX,
        containerLeft: rect.left,
        containerWidth: rect.width,
      });

      if (mode === 'slider') {
        handleSliderPointerDown(event);
        return;
      }

      handlePanPointerDown(event);
    },
    [handlePanPointerDown, handleSliderPointerDown, sliderPos],
  );

  /** Single and two-up views: press to inspect at 2×, or pan when already zoomed. */
  const handleInspectPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' && viewportRef.current.zoom <= 1) return;
      if (!beginPointerInteraction(event)) return;
      event.preventDefault();
      setIsInteracting(true);
      const currentViewport = viewportRef.current;

      if (currentViewport.zoom > 1) {
        isPanning.current = true;
        isInspecting.current = false;
        panStart.current = {
          x: event.clientX,
          y: event.clientY,
          panX: currentViewport.panX,
          panY: currentViewport.panY,
        };
        return;
      }

      const nextPan = getInspectPan(event.currentTarget, event.clientX, event.clientY);
      isPanning.current = true;
      isInspecting.current = true;
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: nextPan.panX,
        panY: nextPan.panY,
      };
      applyTransientViewport({
        zoom: 2,
        panX: nextPan.panX,
        panY: nextPan.panY,
      });
    },
    [applyTransientViewport, beginPointerInteraction, getInspectPan],
  );

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      if (!isDraggingSlider.current && !isPanning.current) return;
      event.preventDefault();
      applyInteractionMove(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
      finishInteraction();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [applyInteractionMove, finishInteraction]);

  return {
    containerRef,
    viewport,
    sliderPos,
    setSliderPos,
    isInteracting,
    setZoomLevel,
    resetViewport,
    handleInspectPointerDown,
    handleSliderComparePointerDown,
  };
}
