/**
 * AnimatedNumber — counts from 0 to target value over ~900ms.
 * No external lib; just requestAnimationFrame.
 */
import React, { useEffect, useRef, useState } from 'react';

export default function AnimatedNumber({ value = 0, decimals = 2, suffix = '', duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const start = useRef(null);
  const from = useRef(0);

  useEffect(() => {
    start.current = null;
    from.current = display;
    let raf;
    const tick = (ts) => {
      if (!start.current) start.current = ts;
      const elapsed = ts - start.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from.current + (value - from.current) * eased;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted = Number(display).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span>{formatted}{suffix}</span>;
}
