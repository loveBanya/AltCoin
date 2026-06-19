const DEFAULT_BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
];

function getBaseUrls(): string[] {
  const custom = process.env.BINANCE_FAPI_BASE?.trim();
  if (custom) {
    return [custom.replace(/\/$/, ""), ...DEFAULT_BASES];
  }
  return DEFAULT_BASES;
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

const FETCH_HEADERS = {
  "User-Agent": "altcoin-scanner/1.0",
  Accept: "application/json",
};

export class BinanceApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string,
  ) {
    super(message);
    this.name = "BinanceApiError";
  }
}

export async function binanceFapiGet<T>(
  endpoint: string,
  params?: Record<string, string | number>,
  options?: { revalidate?: number },
): Promise<T> {
  const bases = getBaseUrls();
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
      );
    } catch (err) {
      if (err instanceof BinanceApiError) throw err;
      lastError = err instanceof Error ? err.message : "network error";
    }
  }

  throw new BinanceApiError(
    lastStatus === 451 || lastStatus === 403
      ? "바이낸스 API 지역 제한(451). BINANCE_FAPI_BASE 환경변수에 프록시 URL을 설정하세요."
      : `Binance API error: ${lastStatus || "network"} ${endpoint} (${lastError})`,
    lastStatus,
    endpoint,
  );
}

export async function binanceFapiGetText(
  endpoint: string,
  params?: Record<string, string | number>,
): Promise<Response> {
  const bases = getBaseUrls();
  let lastStatus = 0;

  for (const base of bases) {
    const url = buildUrl(base, endpoint, params);
    const res = await fetch(url, { headers: FETCH_HEADERS, cache: "no-store" });
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status === 451 || res.status === 403 || res.status >= 500) continue;
    return res;
  }

  throw new BinanceApiError(
    lastStatus === 451
      ? "바이낸스 API 지역 제한(451). BINANCE_FAPI_BASE 환경변수에 프록시 URL을 설정하세요."
      : `Binance API error: ${lastStatus} ${endpoint}`,
    lastStatus,
    endpoint,
  );
}
