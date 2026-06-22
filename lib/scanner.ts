import type { CoinResult, ScannerConfig } from "./types";
import {
  binanceMarketFetch,
  fetchPerpetualUsdtTickers,
  type BinanceMarket,
  type Ticker24hRow,
} from "./binance-client";
import { analyzeSetup, setupScoreBonus } from "./ta-analysis";

type Ticker24h = Ticker24hRow;

type Kline = [number, string, string, string, string, string, ...unknown[]];

interface AnalyzedRow extends Omit<CoinResult, "rank"> {
  score: number;
}

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      result.push(values[0]);
    } else {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
  }
  return result;
}

function calcMacd(
  closes: number[],
  fast: number,
  slow: number,
  signal: number,
): { macd: number[]; signal: number[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  return { macd: macdLine, signal: signalLine };
}

function detectMacdSignal(
  macdLine: number[],
  signalLine: number[],
  config: ScannerConfig,
): { found: boolean; crossType: string; barsAgo: number } {
  const n = macdLine.length;
  if (n < config.macdSlow + config.macdSignal + 2) {
    return { found: false, crossType: "", barsAgo: -1 };
  }

  const lookStart = Math.max(1, n - config.lookbackMax);
  const lookEnd = n - config.lookbackMin;

  for (let i = lookEnd; i >= lookStart; i--) {
    const prevI = i - 1;
    const barsAgo = n - 1 - i;

    if (config.detectGoldenCross) {
      if (macdLine[prevI] <= signalLine[prevI] && macdLine[i] > signalLine[i]) {
        return { found: true, crossType: "골든크로스", barsAgo };
      }
    }

    if (config.detectZeroCross) {
      if (macdLine[prevI] <= 0 && macdLine[i] > 0) {
        return { found: true, crossType: "0선 돌파", barsAgo };
      }
    }
  }

  return { found: false, crossType: "", barsAgo: -1 };
}

function scoreCoin(
  macdFound: boolean,
  barsAgo: number,
  dropPct: number,
  quoteRank: number,
  volRank: number,
  config: ScannerConfig,
  setupBonus: number,
): number {
  let score = setupBonus;

  score += Math.max(0, 101 - quoteRank) * 2;
  score += Math.max(0, 101 - volRank);

  if (macdFound) {
    score += 1000;
    score += Math.max(0, 6 - barsAgo) * 20;
  }

  if (dropPct >= config.minDropPct && dropPct <= config.maxDropPct) {
    score += 500;
    const mid = (config.minDropPct + config.maxDropPct) / 2;
    score += Math.max(0, 50 - Math.abs(dropPct - mid));
  } else {
    const dist =
      dropPct < config.minDropPct
        ? config.minDropPct - dropPct
        : dropPct > config.maxDropPct
          ? dropPct - config.maxDropPct
          : 0;
    score += Math.max(0, 80 - dist * 3);
  }

  return score;
}

async function getKlines(
  symbol: string,
  interval: string,
  limit: number,
  market: BinanceMarket,
): Promise<Kline[]> {
  return binanceMarketFetch<Kline[]>(market, "klines", { symbol, interval, limit });
}

async function analyzeSymbol(
  symbol: string,
  ticker: Ticker24h,
  quoteRank: number,
  volRank: number,
  config: ScannerConfig,
  market: BinanceMarket,
): Promise<AnalyzedRow | null> {
  try {
    const [klines5m, klines1h, klines1d] = await Promise.all([
      getKlines(symbol, "5m", 200, market),
      getKlines(symbol, "1h", 200, market),
      getKlines(symbol, "1d", config.highDays, market),
    ]);

    if (!klines5m.length || !klines1d.length) return null;

    const closes5m = klines5m.map((k) => parseFloat(k[4]));
    const { macd: macdLine, signal: signalLine } = calcMacd(
      closes5m,
      config.macdFast,
      config.macdSlow,
      config.macdSignal,
    );

    const { found, crossType, barsAgo } = detectMacdSignal(macdLine, signalLine, config);

    const high90d = Math.max(...klines1d.map((k) => parseFloat(k[2])));
    const currentPrice = parseFloat(ticker.lastPrice);
    const dropPct = ((currentPrice - high90d) / high90d) * 100;
    const dropMatch = dropPct >= config.minDropPct && dropPct <= config.maxDropPct;

    const lastMacd = macdLine[macdLine.length - 1];
    const lastSignal = signalLine[signalLine.length - 1];
    const macdBearish = lastMacd < lastSignal && lastMacd < 0;

    const ohlc1h = klines1h.map((k) => ({
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));
    const setup = analyzeSetup(ohlc1h, currentPrice, config, found, macdBearish);

    const signals: string[] = [];
    if (found) signals.push(crossType);
    if (setup.setupType !== "일반" && setup.setupType !== "-") signals.push(setup.setupType);
    if (found && config.detectGoldenCross && config.detectZeroCross) {
      if (crossType === "골든크로스" && lastMacd > 0) signals.push("0선 위");
      if (crossType === "0선 돌파" && lastMacd > lastSignal) signals.push("시그널 위");
    }
    if (!found) signals.push("MACD 미충족");
    if (!dropMatch) signals.push("고점범위 미충족");

    const score = scoreCoin(
      found,
      barsAgo,
      dropPct,
      quoteRank,
      volRank,
      config,
      setupScoreBonus(setup),
    );

    return {
      symbol: symbol.replace("USDT", ""),
      price: currentPrice,
      changePct24h: parseFloat(ticker.priceChangePercent),
      quoteVolumeRank: quoteRank,
      volumeRank: volRank,
      high90d,
      dropFromHighPct: Math.round(dropPct * 100) / 100,
      macd: Math.round(lastMacd * 1e6) / 1e6,
      macdSignal: Math.round(lastSignal * 1e6) / 1e6,
      macdCrossType: found ? crossType : "-",
      macdCrossBarsAgo: found ? barsAgo : -1,
      signals,
      score,
      macdMatch: found,
      dropMatch,
      setupType: setup.setupType,
      consolidateRangePct: setup.consolidateRangePct,
      pumpPct: setup.pumpPct,
      pullbackFromPumpPct: setup.pullbackFromPumpPct,
      pullbackMatch: setup.pullbackMatch,
      bias: setup.bias,
      biasLabel: setup.biasLabel,
      biasReasons: setup.biasReasons,
      rsi14: setup.rsi14,
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function validateConfig(config: ScannerConfig): string | null {
  if (config.lookbackMin > config.lookbackMax) {
    return "MACD '최소 봉'은 '최대 봉'보다 작거나 같아야 합니다.";
  }
  if (config.minDropPct > config.maxDropPct) {
    return "'최대 하락%'는 '최소 하락%'보다 작거나 같아야 합니다. (예: -35 ~ -10)";
  }
  if (!config.detectGoldenCross && !config.detectZeroCross) {
    return "골든크로스 또는 0선 돌파 중 하나 이상을 선택하세요.";
  }
  if (config.resultTopN < 1 || config.resultTopN > 100) {
    return "표시 개수는 1~100 사이여야 합니다.";
  }
  return null;
}

export async function scan(
  config: ScannerConfig,
): Promise<{
  results: CoinResult[];
  candidates: number;
  fullMatch: number;
  market: BinanceMarket;
  tickerCount: number;
}> {
  const { tickers: usdtTickers, market } = await fetchPerpetualUsdtTickers();
  const tickerCount = usdtTickers.length;

  const quoteSorted = [...usdtTickers].sort(
    (a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume),
  );
  const volSorted = [...usdtTickers].sort(
    (a, b) => parseFloat(b.volume) - parseFloat(a.volume),
  );

  const quoteRanks = new Map<string, number>();
  const volRanks = new Map<string, number>();

  quoteSorted.forEach((t, i) => quoteRanks.set(t.symbol, i + 1));
  volSorted.forEach((t, i) => volRanks.set(t.symbol, i + 1));

  const candidateSet = new Set<string>();

  if (config.scanAllPerpetuals) {
    usdtTickers.forEach((t) => candidateSet.add(t.symbol));
  } else {
    quoteSorted.slice(0, config.quoteVolumeTopN).forEach((t) => candidateSet.add(t.symbol));
    volSorted.slice(0, config.volumeTopN).forEach((t) => candidateSet.add(t.symbol));
  }

  const candidates = [...candidateSet];
  const tickerMap = new Map(usdtTickers.map((t) => [t.symbol, t]));

  const analyzed = await mapWithConcurrency(candidates, 12, async (sym) => {
    const ticker = tickerMap.get(sym)!;
    const quoteRank = quoteRanks.get(sym) ?? 999;
    const volRank = volRanks.get(sym) ?? 999;
    return analyzeSymbol(sym, ticker, quoteRank, volRank, config, market);
  });

  const ranked = analyzed
    .filter((r): r is AnalyzedRow => r !== null)
    .filter((r) => !config.pullbackSetupOnly || r.setupType === "눌림목 롱")
    .sort((a, b) => b.score - a.score)
    .slice(0, config.resultTopN)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const fullMatch = ranked.filter((r) => r.macdMatch && r.dropMatch).length;

  return { results: ranked, candidates: candidates.length, fullMatch, market, tickerCount };
}
