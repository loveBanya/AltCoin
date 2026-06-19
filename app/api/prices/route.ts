import { NextResponse } from "next/server";
import { binanceFapiGet } from "@/lib/binance-client";

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

    const tickers = await binanceFapiGet<Ticker24h[]>("/fapi/v1/ticker/24hr");
    const wanted = new Set(requested);

    const prices = tickers
      .filter((t) => wanted.has(t.symbol))
      .map((t) => ({
        symbol: t.symbol.replace("USDT", ""),
        price: parseFloat(t.lastPrice),
        changePct24h: parseFloat(t.priceChangePercent),
      }));

    return NextResponse.json({ prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "가격 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
