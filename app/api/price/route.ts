import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { cryptoQuote } from '@/lib/external';
import { CURRENCIES } from '@/lib/core/constants';

export const dynamic = 'force-dynamic';

/** GET /api/price?coin=BTC&currency=EUR → { price, source, at } (signed-in users only). */
export async function GET(req: Request) {
  if (!(await getUserId())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const coin = url.searchParams.get('coin') ?? '';
  const currency = (url.searchParams.get('currency') ?? '').toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(currency)) return NextResponse.json({ error: 'Unknown currency' }, { status: 400 });
  const quote = await cryptoQuote(coin, currency);
  if (!quote) return NextResponse.json({ error: 'Price not available' }, { status: 404 });
  return NextResponse.json(quote);
}
