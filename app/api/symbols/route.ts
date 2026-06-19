import { NextResponse } from "next/server";
import { binanceFapiGet } from "@/lib/binance-client";

interface ExchangeSymbol {
  symbol: string;
  baseAsset: string;
  contractType: string;
  quoteAsset: string;
  status: string;
}

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.toUpperCase().replace(/USDT$/i, "") ?? "";

    const [info, tickers] = await Promise.all([
      binanceFapiGet<{ symbols: ExchangeSymbol[] }>("/fapi/v1/exchangeInfo", undefined, {
        revalidate: 3600,
      }),
      binanceFapiGet<Ticker24h[]>("/fapi/v1/ticker/24hr"),
    ]);

    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    let symbols = info.symbols
      .filter(
        (s) =>
          s.contractType === "PERPETUAL" &&
          s.quoteAsset === "USDT" &&
          s.status === "TRADING",
      )
      .map((s) => {
        const ticker = tickerMap.get(s.symbol);
        return {
          symbol: s.baseAsset,
          baseAsset: s.baseAsset,
          price: ticker ? parseFloat(ticker.lastPrice) : 0,
          changePct24h: ticker ? parseFloat(ticker.priceChangePercent) : 0,
          quoteVolume: ticker ? parseFloat(ticker.quoteVolume) : 0,
        };
      })
      .sort((a, b) => b.quoteVolume - a.quoteVolume);

    if (q) {
      symbols = symbols.filter((s) => s.baseAsset.includes(q));
    }

    return NextResponse.json({ symbols: symbols.slice(0, q ? 30 : 500) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "종목 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
