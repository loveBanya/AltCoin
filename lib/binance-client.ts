export type BinanceMarket = "futures" | "spot";

const FUTURES_MIRRORS = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

/** 바이낸스 공식 Spot API 미러 (General API Information) */
const SPOT_MIRRORS = [
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
];

export const BINANCE_PATHS = {
  futures: {
    ticker24hr: "/fapi/v1/ticker/24hr",
    klines: "/fapi/v1/klines",
    exchangeInfo: "/fapi/v1/exchangeInfo",
  },
  spot: {
    ticker24hr: "/api/v3/ticker/24hr",
    klines: "/api/v3/klines",
    exchangeInfo: "/api/v3/exchangeInfo",
  },
} as const;

export type BinanceResource = keyof typeof BINANCE_PATHS.futures;

const FETCH_HEADERS = {
  "User-Agent": "altcoin-scanner/1.0",
  Accept: "application/json",
};

export class BinanceApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
    public market?: BinanceMarket,
  ) {
    super(message);
    this.name = "BinanceApiError";
  }
}

function getInternalProxyBase(market: BinanceMarket): string | null {
  if (process.env.BINANCE_USE_INTERNAL_PROXY === "false") return null;
  if (market === "futures" && process.env.BINANCE_FAPI_BASE?.trim()) return null;
  if (market === "spot" && process.env.BINANCE_SPOT_BASE?.trim()) return null;

  const proxyPath = market === "futures" ? "binance" : "binance-spot";

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/${proxyPath}`;
  }

  if (process.env.NODE_ENV === "development") {
    const port = process.env.PORT ?? "3000";
    return `http://127.0.0.1:${port}/api/${proxyPath}`;
  }

  return null;
}

function getBases(market: BinanceMarket): string[] {
  const mirrors = market === "futures" ? FUTURES_MIRRORS : SPOT_MIRRORS;
  const custom =
    market === "futures"
      ? process.env.BINANCE_FAPI_BASE?.trim().replace(/\/$/, "")
      : process.env.BINANCE_SPOT_BASE?.trim().replace(/\/$/, "");
  const internal = getInternalProxyBase(market);
  return [...new Set([custom, internal, ...mirrors].filter(Boolean))] as string[];
}

function buildUrl(base: string, endpoint: string, params?: Record<string, string | number>): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function fetchFromBases<T>(
  bases: string[],
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { revalidate?: number },
  market?: BinanceMarket,
): Promise<T> {
  let lastStatus = 0;
  let lastError = "";

  for (const base of bases) {
    const url = buildUrl(base, endpoint, params);
    try {
      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        cache: options?.revalidate ? undefined : "no-store",
        next: options?.revalidate ? { revalidate: options.revalidate } : undefined,
      });

      if (res.ok) {
        const text = await res.text();
        if (!text.trim()) {
          lastError = "empty response";
          continue;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          lastError = "invalid json";
          continue;
        }
      }

      lastStatus = res.status;
      if (res.status === 451 || res.status === 403) {
        lastError = `지역 제한 (${res.status})`;
        continue;
      }
      if (res.status >= 500) {
        lastError = `서버 오류 (${res.status})`;
        continue;
      }

      throw new BinanceApiError(
        `Binance API error: ${res.status} ${endpoint}`,
        res.status,
        endpoint,
        market,
      );
    } catch (err) {
      if (err instanceof BinanceApiError) throw err;
      lastError = err instanceof Error ? err.message : "network error";
    }
  }

  throw new BinanceApiError(
    lastStatus === 451 || lastStatus === 403
      ? `바이낸스 ${market === "spot" ? "현물" : "선물"} API 지역 제한(${lastStatus})`
      : `Binance API error: ${lastStatus || "network"} ${endpoint} (${lastError})`,
    lastStatus,
    endpoint,
    market,
  );
}

export async function binanceMarketFetch<T>(
  market: BinanceMarket,
  resource: BinanceResource,
  params?: Record<string, string | number>,
  options?: { revalidate?: number },
): Promise<T> {
  const endpoint = BINANCE_PATHS[market][resource];
  return fetchFromBases<T>(getBases(market), endpoint, params, options, market);
}

/** 선물 API 우선 → 451이면 Spot API(api.binance.com 등) 자동 전환 */
export async function binanceAutoGet<T>(
  resource: BinanceResource,
  params?: Record<string, string | number>,
  options?: { revalidate?: number },
): Promise<{ data: T; market: BinanceMarket }> {
  try {
    const data = await binanceMarketFetch<T>("futures", resource, params, options);
    return { data, market: "futures" };
  } catch (err) {
    const isBlocked =
      err instanceof BinanceApiError && (err.status === 451 || err.status === 403);
    if (!isBlocked) throw err;
  }

  const data = await binanceMarketFetch<T>("spot", resource, params, options);
  return { data, market: "spot" };
}

/** @deprecated binanceAutoGet 사용 권장 */
export async function binanceFapiGet<T>(
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { revalidate?: number },
): Promise<T> {
  const resource = endpointToResource(endpoint);
  const { data } = await binanceAutoGet<T>(resource, params, options);
  return data;
}

function endpointToResource(endpoint: string): BinanceResource {
  if (endpoint.includes("klines")) return "klines";
  if (endpoint.includes("exchangeInfo")) return "exchangeInfo";
  return "ticker24hr";
}

export function isUsdtSymbol(symbol: string, market: BinanceMarket): boolean {
  if (!symbol.endsWith("USDT")) return false;
  if (market === "futures") return true;
  return !symbol.includes("_");
}

export function filterExchangeSymbols<
  T extends { symbol: string; quoteAsset: string; status: string; contractType?: string },
>(symbols: T[], market: BinanceMarket): T[] {
  if (market === "futures") {
    return symbols.filter(
      (s) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING",
    );
  }
  return symbols.filter(
    (s) => s.quoteAsset === "USDT" && s.status === "TRADING" && isUsdtSymbol(s.symbol, "spot"),
  );
}

export function marketLabel(market: BinanceMarket): string {
  return market === "futures" ? "USDT 선물" : "USDT 현물";
}

interface ExchangeSymbol {
  symbol: string;
  quoteAsset: string;
  status: string;
  contractType?: string;
}

interface Ticker24hRow {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  volume: string;
  priceChangePercent: string;
}

/** /fapi/v1/ticker/24hr 심볼 없이 호출 → USDT 무기한 선물 24h 티커 전체 */
export async function fetchPerpetualUsdtTickers(): Promise<{
  tickers: Ticker24hRow[];
  market: BinanceMarket;
}> {
  try {
    const [info, tickers] = await Promise.all([
      binanceMarketFetch<{ symbols: ExchangeSymbol[] }>("futures", "exchangeInfo", undefined, {
        revalidate: 3600,
      }),
      binanceMarketFetch<Ticker24hRow[]>("futures", "ticker24hr"),
    ]);
    const perpetual = new Set(
      filterExchangeSymbols(info.symbols, "futures").map((s) => s.symbol),
    );
    return {
      tickers: tickers.filter((t) => perpetual.has(t.symbol)),
      market: "futures",
    };
  } catch (err) {
    const isBlocked =
      err instanceof BinanceApiError && (err.status === 451 || err.status === 403);
    if (!isBlocked) throw err;
  }

  const [info, tickers] = await Promise.all([
    binanceMarketFetch<{ symbols: ExchangeSymbol[] }>("spot", "exchangeInfo", undefined, {
      revalidate: 3600,
    }),
    binanceMarketFetch<Ticker24hRow[]>("spot", "ticker24hr"),
  ]);
  const spotUsdt = new Set(
    filterExchangeSymbols(info.symbols, "spot").map((s) => s.symbol),
  );
  return {
    tickers: tickers.filter((t) => spotUsdt.has(t.symbol)),
    market: "spot",
  };
}

export type { Ticker24hRow };
