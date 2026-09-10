import React from 'react';

/**
 * SVG donut progress ring. `value` 0..1, `size` and `stroke` in px.
 */
export default function ProgressRing({ value = 0, size = 84, stroke = 8, color = '#4cc2ff', children }) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="pring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--line, #1e2836)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="pring-label">{children}</div>
    </div>
  );
}
