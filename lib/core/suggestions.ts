// Rules-based, educational prompts. General information only – never advice.
import { formatMoney } from './constants.ts';

export type Suggestion = { id: string; title: string; body: string; tone: 'periwinkle' | 'coral' | 'butter' };

export const DISCLAIMER =
  'This is general information, not financial advice. Everyone’s situation is different – consider speaking to a regulated financial adviser before making decisions.';

export type SuggestionInput = {
  currency: string;
  netWorth: number;
  /** Bank + non-fixed savings (display currency, user's share). */
  easyAccessCash: number;
  /** Cash that is earning little or unknown interest (< 2% or not entered). */
  lowInterestCash: number;
  /** Fixed-term savings. */
  fixedSavings: number;
  /** Positive amounts owed on cards/loans with their rates (display currency). */
  cardDebts: { name: string; amount: number; rate: number | null }[];
  bestSavingsRate: number | null;
  cryptoValue: number;
  grossAssets: number;
  hasPension: boolean;
  /** Most recent months first; null where unknown. */
  recentSpending: (number | null)[];
  recentIncome: (number | null)[];
  recentGrowth: (number | null)[]; // change in non-cash holdings per month
};

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function buildSuggestions(i: SuggestionInput): Suggestion[] {
  const out: Suggestion[] = [];
  const f = (n: number) => formatMoney(n, i.currency);
  const spend = avg(i.recentSpending.slice(0, 3));
  const monthsOfCash = spend && spend > 0 ? i.easyAccessCash / spend : null;

  // 1. Large cash balance earning little interest
  const bigCash = monthsOfCash !== null ? monthsOfCash > 6 : i.easyAccessCash > 20000;
  if (bigCash && i.lowInterestCash > 5000) {
    out.push({
      id: 'idle-cash',
      tone: 'butter',
      title: 'A large cash balance may be earning little interest',
      body:
        `You have about ${f(i.lowInterestCash)} in accounts with low or unknown interest` +
        (monthsOfCash ? `, roughly ${monthsOfCash.toFixed(0)} months of your estimated spending` : '') +
        '. People in this situation often keep 3–6 months of spending as an emergency fund and look at higher-interest savings accounts, fixed-term savings or long-term investing for the rest.',
    });
  }

  // 2. Thin emergency buffer
  if (monthsOfCash !== null && monthsOfCash < 3 && spend! > 0) {
    out.push({
      id: 'buffer',
      tone: 'coral',
      title: 'Your easy-access cash covers less than 3 months of spending',
      body: `Easy-access cash is about ${monthsOfCash.toFixed(1)} months of your estimated spending (${f(spend!)} a month). Many people aim for a buffer of 3–6 months before taking on investment risk.`,
    });
  }

  // 3. Expensive debt alongside savings
  const totalCard = i.cardDebts.reduce((s, d) => s + d.amount, 0);
  if (totalCard > 100) {
    const pricey = i.cardDebts.filter((d) => d.rate === null || d.rate >= 10);
    const savingsTotal = i.easyAccessCash + i.fixedSavings;
    if (pricey.length && savingsTotal > 0) {
      const rateText = pricey.some((d) => d.rate !== null)
        ? ` at up to ${Math.max(...pricey.map((d) => d.rate ?? 0))}% a year`
        : '';
      out.push({
        id: 'debt-vs-savings',
        tone: 'coral',
        title: 'Card or loan debt while also holding savings',
        body:
          `You owe about ${f(totalCard)} on cards or loans${rateText}, while holding ${f(savingsTotal)} in cash and savings` +
          (i.bestSavingsRate !== null ? ` (best savings rate ${i.bestSavingsRate}%)` : '') +
          '. Debt interest is usually higher than savings interest, so people often compare the two and consider paying down the most expensive debt first, while keeping an emergency buffer.',
      });
    }
  }

  // 4. Crypto share of assets
  if (i.grossAssets > 0 && i.cryptoValue / i.grossAssets > 0.1) {
    const pct = Math.round((i.cryptoValue / i.grossAssets) * 100);
    out.push({
      id: 'crypto-share',
      tone: 'butter',
      title: `About ${pct}% of your assets are in crypto`,
      body: 'Cryptocurrencies can rise or fall sharply in a short time. People often decide in advance what share of their wealth they are comfortable holding in volatile assets and rebalance when it drifts well above that.',
    });
  }

  // 5. Spending vs income
  const inc = avg(i.recentIncome.slice(0, 3));
  if (spend !== null && inc !== null && inc > 0 && spend > inc * 1.05) {
    out.push({
      id: 'overspend',
      tone: 'coral',
      title: 'Estimated spending is higher than income lately',
      body: `Over recent months, estimated spending (${f(spend)} a month) has been above income (${f(inc)} a month). The estimate can be thrown off by one-off transfers, but if the pattern continues, a simple monthly budget can help show where the money goes.`,
    });
  }

  // 6. Growth compared with spending
  const growth = avg(i.recentGrowth.slice(0, 3));
  if (growth !== null && spend !== null && spend > 0 && growth > spend) {
    out.push({
      id: 'growth',
      tone: 'periwinkle',
      title: 'Your assets are growing faster than you spend',
      body: `Your investments, pensions and property grew by about ${f(growth)} a month recently – more than your estimated monthly spending of ${f(spend)}. Growth like this can swing from month to month, so it is worth looking at the longer trend too.`,
    });
  }

  // 7. No pension recorded
  if (!i.hasPension && i.netWorth > 0) {
    out.push({
      id: 'pension',
      tone: 'periwinkle',
      title: 'No pension recorded yet',
      body: 'If you have a workplace or private pension, adding it gives a fuller picture of your net worth. Many people find pensions are one of their largest assets once they look them up.',
    });
  }

  return out;
}
