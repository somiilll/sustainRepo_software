import React from 'react';

export default function TrendArrow({
  trend = 'up',
  color = '#10B981',
}) {
  const isUp = trend === 'up';

  const path = isUp
    ? 'M8 56 L38 32 L58 46 L92 18'
    : 'M8 14 L38 38 L58 24 L92 52';

  const arrowHead = isUp
    ? 'M80 18 L92 18 L88 30'
    : 'M80 52 L92 52 L88 40';

  return (
    <div className="relative w-[92px] h-[58px] opacity-80 group-hover:scale-105 transition-transform duration-300">
      <svg
        viewBox="0 0 120 70"
        className="w-full h-full overflow-visible"
        fill="none"
      >
        {/* OUTER GLOW */}
        <path
          d={path}
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.10"
          filter="url(#glowStrong)"
        />

        {/* MID GLOW */}
        <path
          d={path}
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.22"
          filter="url(#glowSoft)"
        />

        {/* MAIN THIN ARROW */}
        <path
          d={path}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ARROW HEAD */}
        <path
          d={arrowHead}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* SVG GLOW FILTER */}
        <defs>
          <filter
            id="glow"
            x="-50%"
            y="-50%"
            width="150%"
            height="80%"
          >
            <feGaussianBlur
              stdDeviation="6"
              result="coloredBlur"
            />

            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}