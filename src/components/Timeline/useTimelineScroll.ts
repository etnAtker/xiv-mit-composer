import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MS_PER_SEC } from '../../constants/time';
import { MAX_ZOOM, MIN_ZOOM } from '../../constants/timeline';

interface UseTimelineScrollOptions {
  zoom: number;
  setZoom: (value: number) => void;
  headerHeight: number;
  visibleRangeBufferMs: number;
  zoomWheelStep: number;
}

export function useTimelineScroll({
  zoom,
  setZoom,
  headerHeight,
  visibleRangeBufferMs,
  zoomWheelStep,
}: UseTimelineScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10000 });
  const [isScrolled, setIsScrolled] = useState(false);
  const prevZoomRef = useRef(zoom);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, clientHeight } = scrollRef.current;
    const nextScrolled = scrollTop > 0;
    setIsScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
    const visibleHeight = Math.max(0, clientHeight - headerHeight);

    const startSec = scrollTop / zoom;
    const endSec = (scrollTop + visibleHeight) / zoom;

    const newStart = Math.max(0, startSec * MS_PER_SEC - visibleRangeBufferMs);
    const newEnd = endSec * MS_PER_SEC + visibleRangeBufferMs;

    setVisibleRange((prev) => {
      if (
        Math.abs(prev.start - newStart) < MS_PER_SEC &&
        Math.abs(prev.end - newEnd) < MS_PER_SEC
      ) {
        return prev;
      }
      return { start: newStart, end: newEnd };
    });
  }, [headerHeight, visibleRangeBufferMs, zoom]);

  useEffect(() => {
    handleScroll();
  }, [zoom, handleScroll]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevZoom = prevZoomRef.current;
    if (prevZoom === zoom) return;

    const startSec = el.scrollTop / prevZoom;
    const nextScrollTop = startSec * zoom;
    el.scrollTop = nextScrollTop;
    prevZoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? -zoomWheelStep : zoomWheelStep;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      setZoom(newZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, setZoom, zoomWheelStep]);

  return { scrollRef, visibleRange, isScrolled, handleScroll };
}
