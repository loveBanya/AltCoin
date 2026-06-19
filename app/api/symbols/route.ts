import { NextResponse } from "next/server";
import {
  binanceAutoGet,
  binanceMarketFetch,
  filterExchangeSymbols,
  marketLabel,
} from "@/lib/binance-client";

interface ExchangeSymbol {
  symbol: string;
  baseAsset: string;
  contractType?: string;
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
export const preferredRegion = ["sin1", "hnd1", "syd1"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.toUpperCase().replace(/USDT$/i, "") ?? "";

    const tickerResult = await binanceAutoGet<Ticker24h[]>("ticker24hr");
    const market = tickerResult.market;
    const info = await binanceMarketFetch<{ symbols: ExchangeSymbol[] }>(
      market,
      "exchangeInfo",
      undefined,
      { revalidate: 3600 },
    );
    const tickers = tickerResult.data;

    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    let symbols = filterExchangeSymbols(info.symbols, market)
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

    return NextResponse.json({
      symbols: symbols.slice(0, q ? 30 : 500),
      market,
      marketLabel: marketLabel(market),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "종목 조회 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
