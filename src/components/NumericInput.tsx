import { useEffect, useRef, useState } from 'react';

// Keep the text the user is typing separate from the committed numeric setting.
export function NumericInput({ value, min, max, step = 'any', disabled, label, id, onCommit, normalize = n => n }: {
  value: number; min: number; max: number; step?: number | 'any'; disabled?: boolean; label: string; id?: string;
  onCommit(value: number): void; normalize?(value: number): number;
}) {
  const format = (n: number) => String(Number(n.toFixed(3)));
  const [draft, setDraft] = useState(() => format(value));
  const focused = useRef(false), cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(format(value)); }, [value]);
  return <input id={id} type="number" aria-label={label} min={min} max={max} step={step} disabled={disabled} value={draft}
    onFocus={() => { focused.current = true; cancelled.current = false; }}
    onChange={e => setDraft(e.target.value)}
    onBlur={e => {
      focused.current = false;
      const raw = e.currentTarget.valueAsNumber;
      const next = cancelled.current || !Number.isFinite(raw) ? value : Math.max(min, Math.min(max, normalize(Math.max(min, Math.min(max, raw)))));
      cancelled.current = false; setDraft(format(next));
      if (next !== value) onCommit(next);
    }}
    onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setDraft(format(value)); e.currentTarget.blur(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
    }} />;
}
