import { useEffect, useState } from 'react';

/** Phones: one scrolling column, 44 px targets. Matches the CSS breakpoint. */
export const PHONE_QUERY = '(max-width: 767px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Enter fullscreen on the element, or leave whichever element is fullscreen. */
export function toggleFullscreen(element: Element | null | undefined): void {
  const action = document.fullscreenElement
    ? document.exitFullscreen()
    : element?.requestFullscreen();
  void action?.catch(() => undefined);
}
