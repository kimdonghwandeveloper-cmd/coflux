import { Check, X } from 'lucide-react';

export const FeatureItem = ({ text, active }: { text: string; active: boolean }) => (
  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
    {active ? (
      <Check size={12} style={{ color: 'var(--accent)' }} />
    ) : (
      <X size={12} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
    )}
    <span style={{ fontSize: '11px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: active ? 1 : 0.6 }}>
      {text}
    </span>
  </li>
);
