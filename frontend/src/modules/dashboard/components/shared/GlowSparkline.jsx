/**
 * GlowSparkline — small SVG line w/ gradient + soft glow filter.
 * Matches the "glowy aesthetic" reference image. Tiny, no external deps.
 */
import React, { useId } from 'react';

export default function GlowSparkline({
  data = [],            // [{x, y}]
  width = 90,
  height = 32,
  stroke = '#10B981',   // emerald default
  strokeWidth = 1.6,
  showArrow = false,
  trend = 'up',         // up | down | flat
  className = '',
}) {
  const gid = useId();
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padY = (maxY - minY) * 0.15 || 1;
  const xRange = maxX - minX || 1;
  const yRange = (maxY + padY) - (minY - padY) || 1;

  const sx = (x) => ((x - minX) / xRange) * (width - 4) + 2;
  const sy = (y) => height - 2 - ((y - (minY - padY)) / yRange) * (height - 4);

  const points = data.map((d) => `${sx(d.x)},${sy(d.y)}`).join(' ');
  const lastX = sx(data[data.length - 1].x);
  const lastY = sy(data[data.length - 1].y);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <filter id={`glow-${gid}`} x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* area fill for soft glow */}
      <polygon
        points={`${sx(minX)},${height} ${points} ${lastX},${height}`}
        fill={`url(#grad-${gid})`}
      />

      {/* glowing line */}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#glow-${gid})`}
      />

      {/* end dot */}
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} filter={`url(#glow-${gid})`} />

      {/* arrow */}
      {showArrow && trend !== 'flat' && (
        <g transform={`translate(${lastX + 2}, ${lastY})`}>
          {trend === 'up' ? (
            <path d="M0,2 L4,-2 L4,0 L8,-4 L6,-4 L8,-2 L8,-6 L4,-6 L4,-4 L0,0 Z" fill={stroke} filter={`url(#glow-${gid})`} opacity="0.9" />
          ) : (
            <path d="M0,-2 L4,2 L4,0 L8,4 L6,4 L8,2 L8,6 L4,6 L4,4 L0,0 Z" fill={stroke} filter={`url(#glow-${gid})`} opacity="0.9" />
          )}
        </g>
      )}
    </svg>
  );
}
