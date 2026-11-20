'use client';

import { useActionState, useState } from 'react';
import { saveAccount, type FormState } from './actions';
import { ACCOUNT_TYPES, CRYPTO_COINS, CURRENCIES, TYPE_LABELS, VALUATION_SOURCES, isDebt, type AccountType } from '@/lib/core/constants';

export type FormAccount = {
  id: string;
  type: AccountType;
  name: string;
  currency: string;
  is_fixed: boolean;
  interest_rate: number | null;
  linked_property_id: string | null;
  crypto_coin: string | null;
  crypto_units: number | null;
  property_country: string | null;
  valuation_source: string | null;
  valuation_area: string | null;
  notes: string | null;
};
export type FormShare = { user_id: string | null; external_name: string | null; share_pct: number };

export function AccountForm(props: {
  account?: FormAccount;
  shares?: FormShare[];
  me: { id: string; name: string };
  partners: { id: string; name: string }[];
  properties: { id: string; name: string }[];
  defaultCurrency: string;
  presetType?: AccountType;
}) {
  const a = props.account;
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, null);
  const [type, setType] = useState<AccountType>(a?.type ?? props.presetType ?? 'bank');
  const existingMemberShares = (props.shares ?? []).filter((s) => s.user_id);
  const [mode, setMode] = useState<'me' | 'joint'>(existingMemberShares.length > 1 ? 'joint' : 'me');
  const [source, setSource] = useState(a?.valuation_source ?? 'manual');
  const externals = (props.shares ?? []).filter((s) => s.external_name);
  const shareOf = (id: string, fallback: number) => props.shares?.find((s) => s.user_id === id)?.share_pct ?? fallback;
  const everyone = [props.me, ...props.partners];
  const jointDefault = Math.round((100 / everyone.length) * 100) / 100;
  const canJoint = props.partners.length > 0 && type !== 'pension';

  return (
    <form action={action} className="card" style={{ maxWidth: 680 }}>
      {a && <input type="hidden" name="id" value={a.id} />}

      <div className="grid grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="type">Type</label>
          {a ? (
            <>
              <input type="hidden" name="type" value={type} />
              <input type="text" value={TYPE_LABELS[type]} disabled />
            </>
          ) : (
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          )}
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" name="currency" defaultValue={a?.currency ?? props.defaultCurrency}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required defaultValue={a?.name} placeholder={placeholderFor(type)} />
      </div>

      {type === 'crypto' && (
        <div className="grid grid-2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="crypto_coin">Coin</label>
            <select id="crypto_coin" name="crypto_coin" defaultValue={a?.crypto_coin ?? 'bitcoin'}>
              {CRYPTO_COINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              <option value="">Other (enter value myself)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="crypto_units">How many coins <span className="hint">optional</span></label>
            <input id="crypto_units" name="crypto_units" type="text" inputMode="decimal" defaultValue={a?.crypto_units ?? ''} placeholder="0.25" />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="balance">
          {a ? 'Update this month’s ' : ''}{isDebt(type) ? 'Amount owed' : type === 'property' ? 'Current market value' : type === 'crypto' ? 'Current value' : 'Balance'}
          {' '}<span className="hint">
            {a ? 'leave empty to keep it as it is' : type === 'crypto' ? 'leave empty to look up the price automatically' : isDebt(type) ? 'enter as a positive number' : ''}
          </span>
        </label>
        <input id="balance" name="balance" type="text" inputMode="decimal" placeholder="0" />
      </div>

      {type === 'savings' && (
        <div className="field">
          <label className="check">
            <input type="checkbox" name="is_fixed" defaultChecked={a?.is_fixed} />
            <span>Fixed account (no deposits or withdrawals)<br /><span className="hint">Any rise is counted as interest and left out of the spending estimate.</span></span>
          </label>
        </div>
      )}

      {['savings', 'bank', 'credit_card', 'loan', 'mortgage'].includes(type) && (
        <div className="field">
          <label htmlFor="interest_rate">Interest rate, % per year <span className="hint">optional – helps the suggestions</span></label>
          <input id="interest_rate" name="interest_rate" type="text" inputMode="decimal" defaultValue={a?.interest_rate ?? ''} placeholder={isDebt(type) ? '19.9' : '3.5'} style={{ maxWidth: 160 }} />
        </div>
      )}

      {type === 'mortgage' && (
        <div className="field">
          <label htmlFor="linked_property_id">Which property is it for?</label>
          <select id="linked_property_id" name="linked_property_id" defaultValue={a?.linked_property_id ?? ''}>
            <option value="">Not linked</option>
            {props.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {props.properties.length === 0 && <p className="hint">Add the property first to link it, so equity is worked out automatically.</p>}
        </div>
      )}

      {type === 'property' && (
        <fieldset>
          <legend>Monthly value estimate</legend>
          <div className="grid grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="valuation_source">Estimate from</label>
              <select id="valuation_source" name="valuation_source" value={source} onChange={(e) => setSource(e.target.value)}>
                {VALUATION_SOURCES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="property_country">Country code</label>
              <input id="property_country" name="property_country" type="text" maxLength={2} placeholder="GB / FI"
                defaultValue={a?.property_country ?? (source === 'uk_hpi' ? 'GB' : source.startsWith('fi_') ? 'FI' : '')} />
            </div>
          </div>
          {source !== 'manual' && (
            <div className="field">
              <label htmlFor="valuation_area">Area</label>
              <input id="valuation_area" name="valuation_area" type="text" defaultValue={a?.valuation_area ?? ''}
                placeholder={source === 'uk_hpi' ? 'e.g. london, manchester, city-of-edinburgh' : 'e.g. Helsinki, Espoo, Tampere'} />
              <p className="hint">
                Each month the value is moved in line with the official house price index for this area. You can always type your own value at check-in.
              </p>
            </div>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend>Who owns this?</legend>
        {canJoint && (
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="check"><input type="radio" name="owner_mode" value="me" checked={mode === 'me'} onChange={() => setMode('me')} /> Just me</label>
            <label className="check"><input type="radio" name="owner_mode" value="joint" checked={mode === 'joint'} onChange={() => setMode('joint')} /> Joint with {props.partners.map((p) => p.name).join(' & ')}</label>
          </div>
        )}
        {mode === 'joint' && canJoint ? (
          <div className="grid grid-2" style={{ gap: 14 }}>
            {everyone.map((m) => (
              <div className="field" key={m.id}>
                <label htmlFor={`share-${m.id}`}>{m.id === props.me.id ? 'My share' : `${m.name}’s share`} (%)</label>
                <input id={`share-${m.id}`} name={`share:${m.id}`} type="text" inputMode="decimal" defaultValue={shareOf(m.id, type === 'property' && externals.length ? 0 : jointDefault)} />
              </div>
            ))}
          </div>
        ) : type === 'property' ? (
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor={`share-${props.me.id}`}>My share (%)</label>
            <input id={`share-${props.me.id}`} name={`share:${props.me.id}`} type="text" inputMode="decimal" defaultValue={shareOf(props.me.id, 100)} />
          </div>
        ) : (
          <p className="small muted">This account is yours. {canJoint ? '' : props.partners.length ? '' : 'Join a household to add joint accounts.'}</p>
        )}

        {type === 'property' && (
          <>
            <p className="small" style={{ marginBottom: 8 }}><strong>Co-owners outside the app</strong> <span className="hint">e.g. a family member holding 40% outright</span></p>
            {[0, 1, 2].map((i) => (
              <div className="grid grid-2" style={{ gap: 14 }} key={i}>
                <div className="field"><input name={`ext_name_${i}`} type="text" placeholder="Name" defaultValue={externals[i]?.external_name ?? ''} aria-label={`Co-owner ${i + 1} name`} /></div>
                <div className="field"><input name={`ext_pct_${i}`} type="text" inputMode="decimal" placeholder="%" defaultValue={externals[i]?.share_pct ?? ''} aria-label={`Co-owner ${i + 1} share`} /></div>
              </div>
            ))}
            <p className="hint">All shares together must add up to 100%. Your equity = your % of the value minus the mortgage you hold.</p>
          </>
        )}
        {type === 'mortgage' && <p className="hint">Only list the people who hold the mortgage. Property ownership is set on the property itself.</p>}
      </fieldset>

      <div className="field">
        <label htmlFor="notes">Notes <span className="hint">optional</span></label>
        <input id="notes" name="notes" type="text" defaultValue={a?.notes ?? ''} />
      </div>

      {state?.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : a ? 'Save changes' : 'Add account'}</button>
      </div>
    </form>
  );
}

function placeholderFor(t: AccountType) {
  switch (t) {
    case 'bank': return 'e.g. Nordea current account';
    case 'savings': return 'e.g. Marcus easy access';
    case 'pension': return 'e.g. Workplace pension';
    case 'property': return 'e.g. Helsinki flat';
    case 'mortgage': return 'e.g. Flat mortgage';
    case 'credit_card': return 'e.g. Amex';
    case 'loan': return 'e.g. Car loan';
    case 'crypto': return 'e.g. Bitcoin wallet';
    default: return 'e.g. Car, watch, shares';
  }
}
