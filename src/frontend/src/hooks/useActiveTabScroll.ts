import { useEffect, useRef } from 'react';

/** Keep the selected tab visible without moving the page vertically. */
export default function useActiveTabScroll(activeKey: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const updateEdges = () => {
      strip.dataset.scrollStart = String(strip.scrollLeft <= 1);
      strip.dataset.scrollEnd = String(strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1);
    };
    updateEdges();
    strip.addEventListener('scroll', updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(strip);
    return () => { strip.removeEventListener('scroll', updateEdges); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>('.sub-nav-item.active');
    if (!strip || !active) return;
    const left = active.offsetLeft - strip.offsetLeft;
    const target = Math.max(0, left - (strip.clientWidth - active.offsetWidth) / 2);
    strip.scrollTo({ left: target, behavior: 'auto' });
    strip.dataset.scrollStart = String(strip.scrollLeft <= 1);
    strip.dataset.scrollEnd = String(strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1);
  }, [activeKey]);
  return ref;
}
