'use client';

import { useState, useTransition } from 'react';

/**
 * A button that asks "Are you sure?" in place, then runs a server action.
 * Errors from the action are shown next to the button.
 */
export function ConfirmButton(props: {
  action: (fd: FormData) => Promise<void | { error: string }>;
  fields: Record<string, string>;
  label: string;
  confirmLabel: string;
  question: string;
  tone?: 'coral' | 'ghost' | 'secondary';
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(props.fields)) fd.set(k, v);
    setError(null);
    start(async () => {
      // On success the action redirects; on failure it returns { error }.
      const r = await props.action(fd);
      if (r && 'error' in r) setError(r.error);
    });
  };

  if (!asking) {
    return (
      <span>
        <button type="button" className={`btn small ${props.tone ?? 'coral'}`} onClick={() => setAsking(true)}>{props.label}</button>
        {error && <span className="error small" style={{ marginLeft: 8 }}>{error}</span>}
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 8, display: 'inline-flex' }}>
      <span className="small"><strong>{props.question}</strong></span>
      <button type="button" className="btn small coral" disabled={pending} onClick={run}>{pending ? 'Deleting…' : props.confirmLabel}</button>
      <button type="button" className="btn small secondary" disabled={pending} onClick={() => setAsking(false)}>Cancel</button>
      {error && <span className="error small">{error}</span>}
    </span>
  );
}
