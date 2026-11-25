import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const previousTargetRef = useRef(target);

  useEffect(() => {
    if (Object.is(previousTargetRef.current, target)) return;
    previousTargetRef.current = target;

    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    let animationFrame = 0;
    const start = performance.now();
    const startValue = valueRef.current;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const nextValue = startValue + (target - startValue) * (1 - Math.pow(1 - progress, 3));
      valueRef.current = nextValue;
      setValue(nextValue);
      if (progress < 1) animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);

  return value;
}
