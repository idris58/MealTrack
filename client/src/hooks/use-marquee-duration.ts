import { useEffect, useRef, useState } from 'react';

interface MarqueeOptions {
  /** Target scroll speed in pixels per second. Defaults to 50 px/s. */
  speed?: number;
  /** Minimum duration in seconds to prevent excessively rapid looping on very short text. Defaults to 8s. */
  minDuration?: number;
}

/**
 * Computes a dynamic CSS animation duration for marquee tickers based on
 * the measured width of the ticker content, ensuring constant and natural
 * scroll speed regardless of text length.
 */
export function useMarqueeDuration<T extends HTMLElement = HTMLDivElement>(
  dependency?: unknown,
  options: MarqueeOptions = {}
) {
  const { speed = 50, minDuration = 8 } = options;
  const targetRef = useRef<T | null>(null);
  const [duration, setDuration] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const computeDuration = () => {
      const width = el.getBoundingClientRect().width || el.offsetWidth || el.scrollWidth;
      if (width > 0) {
        const calculated = Math.max(minDuration, width / speed);
        setDuration(Math.round(calculated * 100) / 100);
      }
    };

    computeDuration();
    const rafId = requestAnimationFrame(computeDuration);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        computeDuration();
      });
      ro.observe(el);
      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    } else {
      window.addEventListener('resize', computeDuration);
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', computeDuration);
      };
    }
  }, [dependency, speed, minDuration]);

  return { targetRef, duration };
}
