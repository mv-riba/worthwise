'use client';

import { useActionState, useState } from 'react';
import { saveAccount, type FormState } from './actions';
import {
  ACCOUNT_TYPES, COUNTRY_CODES, CRYPTO_COINS, CURRENCIES, PROPERTY_KINDS, TYPE_LABELS, coinSymbol, isDebt, planValuation, type AccountType,
} from '@/lib/core/constants';
import { CryptoFields } from '@/components/CryptoFields';

function countryName(code: string) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

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
  property_kind: string | null;
  notes: string | null;
};
export type FormShare = { user_id: string | null; external_name: string | null; share_pct: number };

export function AccountForm(props: {
  account?: FormAccount;
  shares?: FormShare[];
  me: { id: string; name: string };
  partners: { id: string; name: string }[];
  properties: { id: string; name: string }[];
  /** Ownership of each property, so a mortgage can optionally copy it. */
  propertyShares?: Record<string, FormShare[]>;
  defaultCurrency: string;
  presetType?: AccountType;
}) {
  const a = props.account;
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, null);
  const [type, setType] = useState<AccountType>(a?.type ?? props.presetType ?? 'bank');
  const existingMemberShares = (props.shares ?? []).filter((s) => s.user_id);
  const sharedMortgage = a?.type === 'mortgage' && ((props.shares ?? []).length > 1 || (props.shares ?? []).some((s) => s.user_id !== props.me.id));
  const [mode, setMode] = useState<'me' | 'joint'>(existingMemberShares.length > 1 || sharedMortgage ? 'joint' : 'me');
  const [currency, setCurrency] = useState(a?.currency ?? props.defaultCurrency);
  // property value estimate: chosen automatically from what is entered
  const [autoValue, setAutoValue] = useState(a ? a.valuation_source !== 'manual' : true);
  const [country, setCountry] = useState(a?.property_country ?? '');
  const [kind, setKind] = useState(a?.property_kind ?? 'flat');
  const plan = planValuation(country, kind);
  // crypto coin: one of the popular ones, or any ticker typed in
  const initialCoin = coinSymbol(a?.crypto_coin) ?? 'BTC';
  const known = CRYPTO_COINS.some((c) => c.symbol === initialCoin);
  const [coinChoice, setCoinChoice] = useState(a && !a.crypto_coin ? '' : known ? initialCoin : 'other');
  const [otherCoin, setOtherCoin] = useState(known ? '' : initialCoin);
  const coin = coinChoice === 'other' ? coinSymbol(otherCoin) : coinChoice || null;
  const externals = (props.shares ?? []).filter((s) => s.external_name);
  const shareOf = (id: string, fallback: number) => props.shares?.find((s) => s.user_id === id)?.share_pct ?? fallback;
  const everyone = [props.me, ...props.partners];
  const jointDefault = Math.round((100 / everyone.length) * 100) / 100;
  const canJoint = props.partners.length > 0 && type !== 'pension';

  // Mortgage holders – never filled in automatically; "copy the property's split" is opt-in.
  const [linkedId, setLinkedId] = useState(a?.linked_property_id ?? '');
  const [seed, setSeed] = useState<FormShare[] | null>(null);
  const [seedKey, setSeedKey] = useState(0);
  const linkedShares = (linkedId && props.propertyShares?.[linkedId]) || [];
  const holderSrc = seed ?? (a ? props.shares ?? [] : []);
  const holderExternals = holderSrc.filter((s) => s.external_name);
  // When creating, suggest the property's outside co-owners by name only (no percentages).
  const extNameHints = holderExternals.length || a ? holderExternals.map((s) => s.external_name ?? '') : linkedShares.filter((s) => s.external_name).map((s) => s.external_name ?? '');
  const copyPropertySplit = () => { setSeed(linkedShares); setSeedKey(seedKey + 1); };

  return (
    <form action={action} className="card" style={{ maxWidth: 680 }}>
      {a && <input type="hidden" name="id" value={a.id} />}

      <div className="grid grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          {a && type !== a.type && (
            <p className="hint">
              History is kept.{isDebt(type) !== isDebt(a.type) ? ` Past balances will switch from ${isDebt(a.type) ? 'money owed to money you have' : 'money you have to money owed'}.` : ''}
              {a.type === 'property' ? ' Mortgages linked to this property will be unlinked.' : ''}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
            <label htmlFor="crypto_coin_choice">Coin</label>
            <select id="crypto_coin_choice" value={coinChoice} onChange={(e) => setCoinChoice(e.target.value)}>
              {CRYPTO_COINS.map((c) => <option key={c.symbol} value={c.symbol}>{c.label}</option>)}
              <option value="other">Another coin…</option>
              <option value="">None – I’ll enter the value myself</option>
            </select>
          </div>
          {coinChoice === 'other' && (
            <div className="field">
              <label htmlFor="other_coin">Ticker symbol</label>
              <input id="other_coin" type="text" value={otherCoin} onChange={(e) => setOtherCoin(e.target.value)} placeholder="e.g. AVAX" maxLength={10} />
            </div>
          )}
          <input type="hidden" name="crypto_coin" value={coin ?? ''} />
        </div>
      )}

      {type === 'crypto' && !a ? (
        <CryptoFields coin={coin} currency={currency} unitsName="crypto_units" valueName="balance" priceName="crypto_price" valueLabel="Current value" />
      ) : type === 'crypto' && a ? (
        <div className="field">
          <label htmlFor="crypto_units">Number of coins</label>
          <input id="crypto_units" name="crypto_units" type="text" inputMode="decimal" defaultValue={a.crypto_units ?? ''} />
          <p className="hint">Update the coins and value each month on the check-in page, where the live price is used.</p>
        </div>
      ) : (
      <div className="field">
        <label htmlFor="balance">
          {a ? 'Update this month’s ' : ''}{isDebt(type) ? 'Amount owed' : type === 'property' ? 'Current market value' : 'Balance'}
          {' '}<span className="hint">
            {a ? 'leave empty to keep it as it is' : isDebt(type) ? 'enter as a positive number' : ''}
          </span>
        </label>
        <input id="balance" name="balance" type="text" inputMode="decimal" placeholder="0" />
      </div>
      )}

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
          <select id="linked_property_id" name="linked_property_id" value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
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
              <label htmlFor="property_country">Country</label>
              <select id="property_country" name="property_country" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Choose…</option>
                {[...COUNTRY_CODES].sort((x, y) => countryName(x).localeCompare(countryName(y))).map((c) => (
                  <option key={c} value={c}>{countryName(c)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="property_kind">Type of home</label>
              <select id="property_kind" name="property_kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {PROPERTY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
          </div>
          {plan.areaHint && (
            <div className="field">
              <label htmlFor="valuation_area">Area <span className="hint">city or region</span></label>
              <input id="valuation_area" name="valuation_area" type="text" defaultValue={a?.valuation_area ?? ''} placeholder={plan.areaHint} />
            </div>
          )}
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" name="valuation_auto" checked={autoValue && plan.source !== 'none'} disabled={plan.source === 'none'} onChange={(e) => setAutoValue(e.target.checked)} />
            <span>
              Estimate the value each month
              <br /><span className="hint">{country ? `Source: ${plan.label}.` : 'Choose a country to see which price index will be used.'}{plan.source !== 'none' && ' The value you enter is moved in line with this index; you can always type your own at check-in.'}</span>
            </span>
          </label>
        </fieldset>
      )}

      {type === 'mortgage' ? (
        <fieldset>
          <legend>Who holds this mortgage?</legend>
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="check"><input type="radio" name="owner_mode" value="me" checked={mode === 'me'} onChange={() => setMode('me')} /> Just me (100%)</label>
            <label className="check"><input type="radio" name="owner_mode" value="joint" checked={mode === 'joint'} onChange={() => setMode('joint')} /> Shared</label>
          </div>
          {mode === 'joint' ? (
            <div key={seedKey}>
              <p className="hint" style={{ marginTop: 0 }}>
                Enter each holder’s share of the mortgage. It doesn’t have to match who owns the property – e.g. you can own 50% of the home but hold the whole mortgage.
              </p>
              {linkedShares.length > 1 && (
                <button type="button" className="btn secondary small" onClick={copyPropertySplit} style={{ marginBottom: 12 }}>
                  Use the same split as the property
                </button>
              )}
              <div className="grid grid-2" style={{ gap: 14 }}>
                {everyone.map((m) => (
                  <div className="field" key={m.id}>
                    <label htmlFor={`share-${m.id}`}>{m.id === props.me.id ? 'My share' : `${m.name}’s share`} (%)</label>
                    <input id={`share-${m.id}`} name={`share:${m.id}`} type="text" inputMode="decimal" placeholder="0"
                      defaultValue={holderSrc.find((s) => s.user_id === m.id)?.share_pct ?? ''} />
                  </div>
                ))}
              </div>
              <p className="small" style={{ marginBottom: 8 }}><strong>Holders outside the app</strong> <span className="hint">optional</span></p>
              {[0, 1, 2].map((i) => (
                <div className="grid grid-2" style={{ gap: 14 }} key={i}>
                  <div className="field"><input name={`ext_name_${i}`} type="text" placeholder="Name" defaultValue={extNameHints[i] ?? ''} aria-label={`Holder ${i + 1} name`} /></div>
                  <div className="field"><input name={`ext_pct_${i}`} type="text" inputMode="decimal" placeholder="%" defaultValue={holderExternals[i]?.share_pct ?? ''} aria-label={`Holder ${i + 1} share`} /></div>
                </div>
              ))}
              <p className="hint">Shares must add up to 100%. Your equity = your % of the property’s value minus your % of this mortgage.</p>
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 0 }}>You hold the whole mortgage. Choose “Shared” if someone else holds part of it.</p>
          )}
        </fieldset>
      ) : (
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
      </fieldset>
      )}

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
    case 'bank': return 'e.g. Everyday current account';
    case 'savings': return 'e.g. Easy-access savings';
    case 'investment': return 'e.g. Stocks & shares account, index funds';
    case 'pension': return 'e.g. Workplace pension';
    case 'property': return 'e.g. Our flat';
    case 'mortgage': return 'e.g. Flat mortgage';
    case 'credit_card': return 'e.g. Credit card';
    case 'loan': return 'e.g. Car loan';
    case 'crypto': return 'e.g. Bitcoin wallet';
    default: return 'e.g. Car, watch, art';
  }
}
