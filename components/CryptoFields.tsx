'use client';

import { useEffect, useState } from 'react';
import { formatMoney, toNumber } from '@/lib/core/constants';

type Quote = { price: number; source: string; at: string };

/**
 * Number of coins + value, with the value worked out live from the current
 * price as you type. The price used is submitted with the form so it is
 * stored in that month's snapshot. The value can still be typed over.
 */
export function CryptoFields(props: {
  coin: string | null;
  currency: string;
  unitsName: string;
  valueName: string;
  priceName: string;
  defaultUnits?: number | null;
  defaultValue?: number | null;
  valueLabel?: string;
  compact?: boolean;
}) {
  const [units, setUnits] = useState(props.defaultUnits != null ? String(props.defaultUnits) : '');
  const [value, setValue] = useState(props.defaultValue != null ? String(props.defaultValue) : '');
  const [typedValue, setTypedValue] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');

  const recalc = (u: string, q: Quote | null) => {
    const n = toNumber(u);
    if (q && n !== null && n > 0) setValue(String(Math.round(n * q.price * 100) / 100));
  };

  useEffect(() => {
    if (!props.coin) { setQuote(null); setStatus('idle'); return; }
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/price?coin=${encodeURIComponent(props.coin)}&currency=${props.currency}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((q: Quote) => {
        if (cancelled) return;
        setQuote(q);
        setStatus('idle');
        if (!typedValue) recalc(units, q);
      })
      .catch(() => { if (!cancelled) { setQuote(null); setStatus('failed'); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.coin, props.currency]);

  const time = quote ? new Date(quote.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className={props.compact ? '' : 'grid grid-2'} style={{ gap: props.compact ? 6 : 14, display: props.compact ? 'grid' : undefined }}>
      <div className={props.compact ? '' : 'field'}>
        {!props.compact && <label htmlFor={props.unitsName}>Number of coins</label>}
        <input
          id={props.unitsName} name={props.unitsName} type="text" inputMode="decimal" placeholder={props.compact ? 'Coins, e.g. 0.25' : '0.25'}
          value={units}
          onChange={(e) => { setUnits(e.target.value); setTypedValue(false); recalc(e.target.value, quote); }}
          aria-label="Number of coins"
        />
      </div>
      <div className={props.compact ? '' : 'field'}>
        {!props.compact && <label htmlFor={props.valueName}>{props.valueLabel ?? 'Value'} ({props.currency})</label>}
        <input
          id={props.valueName} name={props.valueName} type="text" inputMode="decimal" placeholder="Value"
          value={value}
          onChange={(e) => { setValue(e.target.value); setTypedValue(true); }}
          aria-label={`Value in ${props.currency}`}
        />
      </div>
      <input type="hidden" name={props.priceName} value={quote && !typedValue ? `${quote.price}|${quote.source}` : ''} />
      <p className="tiny muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
        {!props.coin
          ? 'Choose a coin to look up the price, or type the value yourself.'
          : status === 'loading'
            ? 'Looking up the live price…'
            : status === 'failed'
              ? 'Couldn’t get a live price right now – type the value yourself.'
              : quote
                ? <>1 {props.coin} = {formatMoney(quote.price, props.currency)} · {quote.source} at {time}{typedValue ? ' · you typed your own value' : ''}</>
                : null}
      </p>
    </div>
  );
}
