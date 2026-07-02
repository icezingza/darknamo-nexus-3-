import React from 'react';
import { IAffectVector } from '../core/emotion/EmotionEngine';

interface EmotionDashboardProps {
  affectState: IAffectVector;
}

const DIMENSIONS: { key: keyof IAffectVector; label: string }[] = [
  { key: 'valence', label: 'Valence' },
  { key: 'arousal', label: 'Arousal' },
  { key: 'trust', label: 'Trust' },
  { key: 'passion', label: 'Passion' },
  { key: 'resonance', label: 'Resonance' }
];

// Pure presentation: renders the affect vector as compact bars. No state,
// no side effects -- the numeric model lives entirely in core/emotion.
export const EmotionDashboard: React.FC<EmotionDashboardProps> = ({ affectState }) => {
  if (!affectState) return null;

  return (
    <section>
      <h3 className="text-[10px] font-bold text-zinc-700 uppercase mb-4 mono tracking-widest border-b border-zinc-900 pb-1">Affect_Vector</h3>
      <div className="space-y-3">
        {DIMENSIONS.map(({ key, label }) => {
          const value = affectState[key];
          const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between text-[8px] mono uppercase text-zinc-500 mb-1">
                <span>{label}</span>
                <span>{percent}%</span>
              </div>
              <div className="h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-600 transition-all duration-1000"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
