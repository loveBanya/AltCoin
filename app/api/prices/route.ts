import { NextResponse } from "next/server";

const BINANCE_FAPI = "https://fapi.binance.com";

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("symbols") ?? "";
    const requested = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .map((s) => (s.endsWith("USDT") ? s : `${s}USDT`));

    if (requested.length === 0) {
      return NextResponse.json({ prices: [] });
    }

    const res = await fetch(`${BINANCE_FAPI}/fapi/v1/ticker/24hr`, {
      headers: { "User-Agent": "altcoin-scanner/1.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "바이낸스 API 오류" }, { status: 502 });
    }

    const tickers = (await res.json()) as Ticker24h[];
    const wanted = new Set(requested);

    const prices = tickers
      .filter((t) => wanted.has(t.symbol))
      .map((t) => ({
        symbol: t.symbol.replace("USDT", ""),
        price: parseFloat(t.lastPrice),
        changePct24h: parseFloat(t.priceChangePercent),
      }));

    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json({ error: "가격 조회 실패" }, { status: 500 });
  }
}
