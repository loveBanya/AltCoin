import { NextResponse } from "next/server";
import { fetchPerpetualUsdtTickers, marketLabel } from "@/lib/binance-client";

export const runtime = "nodejs";
export const preferredRegion = ["sin1", "hnd1", "syd1"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.toUpperCase().replace(/USDT$/i, "") ?? "";

    const { tickers, market } = await fetchPerpetualUsdtTickers();

    let symbols = tickers.map((t) => ({
      symbol: t.symbol.replace("USDT", ""),
      baseAsset: t.symbol.replace("USDT", ""),
      price: parseFloat(t.lastPrice),
      changePct24h: parseFloat(t.priceChangePercent),
      quoteVolume: parseFloat(t.quoteVolume),
    }));

    if (q) {
      symbols = symbols.filter((s) => s.baseAsset.includes(q));
    }

    return NextResponse.json({
      symbols: symbols.slice(0, q ? 30 : symbols.length),
      market,
      marketLabel: marketLabel(market),
      tickerCount: tickers.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "종목 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
