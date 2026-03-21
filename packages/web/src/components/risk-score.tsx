'use client';

import { useEffect, useState } from 'react';

interface RiskScoreProps {
  score: number;
  level: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

const LEVEL_STYLES: Record<RiskScoreProps['level'], { text: string; bg: string }> = {
  critical: { text: 'text-risk-critical', bg: 'bg-risk-critical/10' },
  high:     { text: 'text-risk-high',     bg: 'bg-risk-high/10' },
  medium:   { text: 'text-risk-medium',   bg: 'bg-risk-medium/10' },
  low:      { text: 'text-accent',        bg: 'bg-accent/10' },
  none:     { text: 'text-risk-safe',     bg: 'bg-risk-safe/10' },
};

export default function RiskScore({ score, level }: RiskScoreProps) {
  const [displayed, setDisplayed] = useState(0);
  const { text, bg } = LEVEL_STYLES[level];

  useEffect(() => {
    if (score === 0) {
      setDisplayed(0);
      return;
    }

    const duration = 900; // ms
    const start = performance.now();

    let rafId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayed(Math.round(eased * score));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [score]);

  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-card p-6 ${bg}`}>
      <span className={`text-6xl font-extrabold tabular-nums leading-none ${text}`}>
        {displayed}
      </span>
      <span className={`text-xs font-semibold tracking-widest uppercase ${text} opacity-80`}>
        {level} risk
      </span>
    </div>
  );
}
