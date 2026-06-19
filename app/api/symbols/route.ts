import { NextResponse } from "next/server";

const BINANCE_FAPI = "https://fapi.binance.com";

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

    const [infoRes, tickerRes] = await Promise.all([
      fetch(`${BINANCE_FAPI}/fapi/v1/exchangeInfo`, {
        headers: { "User-Agent": "altcoin-scanner/1.0" },
        next: { revalidate: 3600 },
      }),
      fetch(`${BINANCE_FAPI}/fapi/v1/ticker/24hr`, {
        headers: { "User-Agent": "altcoin-scanner/1.0" },
        cache: "no-store",
      }),
    ]);

    if (!infoRes.ok || !tickerRes.ok) {
      return NextResponse.json({ error: "바이낸스 API 오류" }, { status: 502 });
    }

    const info = (await infoRes.json()) as { symbols: ExchangeSymbol[] };
    const tickers = (await tickerRes.json()) as Ticker24h[];

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
  } catch {
    return NextResponse.json({ error: "종목 조회 실패" }, { status: 500 });
  }
}
