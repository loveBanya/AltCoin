import type { ScannerConfig } from "./types";

export type TradeBias = "long" | "short" | "sideways";

export interface KlineOHLC {
  high: number;
  low: number;
  close: number;
}

export interface SetupAnalysis {
  consolidateRangePct: number;
  consolidateMatch: boolean;
  pumpPct: number;
  pumpMatch: boolean;
  pumpHigh: number;
  pullbackFromPumpPct: number;
  pullbackMatch: boolean;
  setupType: string;
  bias: TradeBias;
  biasLabel: string;
  biasReasons: string[];
  ema20: number;
  rsi14: number;
}

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** 횡보 → 급등 → 눌림목 패턴 + 롱/숏/횡보 판단 */
export function analyzeSetup(
  klines1h: KlineOHLC[],
  currentPrice: number,
  config: ScannerConfig,
  macdBullish: boolean,
  macdBearish: boolean,
): SetupAnalysis {
  const consH = config.consolidationHours;
  const pumpH = config.pumpLookbackHours;
  const need = consH + pumpH + 5;

  const empty: SetupAnalysis = {
    consolidateRangePct: 0,
    consolidateMatch: false,
    pumpPct: 0,
    pumpMatch: false,
    pumpHigh: currentPrice,
    pullbackFromPumpPct: 0,
    pullbackMatch: false,
    setupType: "-",
    bias: "sideways",
    biasLabel: "횡보",
    biasReasons: ["데이터 부족"],
    ema20: currentPrice,
    rsi14: 50,
  };

  if (klines1h.length < need) return empty;

  const closes = klines1h.map((k) => k.close);
  const ema20Arr = ema(closes, 20);
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const rsi14 = calcRsi(closes);

  const n = klines1h.length;
  const pumpSlice = klines1h.slice(n - pumpH);
  const consSlice = klines1h.slice(n - pumpH - consH, n - pumpH);

  const consHigh = Math.max(...consSlice.map((k) => k.high));
  const consLow = Math.min(...consSlice.map((k) => k.low));
  const consAvg = consSlice.reduce((s, k) => s + k.close, 0) / consSlice.length;
  const consolidateRangePct = consAvg > 0 ? ((consHigh - consLow) / consAvg) * 100 : 100;
  const consolidateMatch = consolidateRangePct <= config.maxConsolidationRangePct;

  const pumpHigh = Math.max(...pumpSlice.map((k) => k.high));
  const pumpStart = consSlice[consSlice.length - 1]?.close ?? consAvg;
  const pumpPct = pumpStart > 0 ? ((pumpHigh - pumpStart) / pumpStart) * 100 : 0;
  const pumpMatch = pumpPct >= config.minPumpPct;

  const pullbackFromPumpPct = pumpHigh > 0 ? ((currentPrice - pumpHigh) / pumpHigh) * 100 : 0;
  const pullbackMatch =
    pullbackFromPumpPct <= config.pullbackMaxPct &&
    pullbackFromPumpPct >= config.pullbackMinPct;

  let setupType = "일반";
  if (consolidateMatch && pumpMatch && pullbackMatch) setupType = "눌림목 롱";
  else if (consolidateMatch && pumpMatch) setupType = "횡보 후 급등";
  else if (consolidateMatch && !pumpMatch) setupType = "횡보 중";
  else if (pumpMatch && pullbackMatch) setupType = "급등 후 눌림";
  else if (pumpMatch) setupType = "급등 진행";

  let longScore = 0;
  let shortScore = 0;
  let sidewaysScore = 0;
  const biasReasons: string[] = [];

  if (consolidateMatch && pumpMatch && pullbackMatch) {
    longScore += 4;
    biasReasons.push("횡보→급등→눌림목 패턴");
  }
  if (macdBullish) {
    longScore += 2;
    biasReasons.push("MACD 상승 신호");
  }
  if (currentPrice > ema20) {
    longScore += 1;
    biasReasons.push("20EMA 위");
  }
  if (rsi14 >= 40 && rsi14 <= 65) {
    longScore += 1;
    biasReasons.push("RSI 눌림 구간");
  } else if (rsi14 > 75) {
    shortScore += 1;
    biasReasons.push("RSI 과매수");
  }

  if (macdBearish) {
    shortScore += 3;
    biasReasons.push("MACD 하락 신호");
  }
  if (currentPrice < ema20) {
    shortScore += 2;
    biasReasons.push("20EMA 아래");
  }
  if (pumpMatch && pullbackFromPumpPct < config.pullbackMinPct) {
    shortScore += 1;
    biasReasons.push("급등 고점 이탈");
  }

  if (consolidateMatch && !pumpMatch) {
    sidewaysScore += 4;
    biasReasons.push("장기 횡보");
  }
  if (Math.abs(pullbackFromPumpPct) < 2 && !pumpMatch) {
    sidewaysScore += 2;
  }

  let bias: TradeBias = "sideways";
  let biasLabel = "횡보";
  if (longScore > shortScore && longScore > sidewaysScore) {
    bias = "long";
    biasLabel = "롱";
  } else if (shortScore > longScore && shortScore > sidewaysScore) {
    bias = "short";
    biasLabel = "숏";
  }

  return {
    consolidateRangePct: Math.round(consolidateRangePct * 100) / 100,
    consolidateMatch,
    pumpPct: Math.round(pumpPct * 100) / 100,
    pumpMatch,
    pumpHigh,
    pullbackFromPumpPct: Math.round(pullbackFromPumpPct * 100) / 100,
    pullbackMatch,
    setupType,
    bias,
    biasLabel,
    biasReasons: biasReasons.slice(0, 4),
    ema20: Math.round(ema20 * 1e6) / 1e6,
    rsi14: Math.round(rsi14 * 100) / 100,
  };
}

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    result.push(i === 0 ? values[0] : values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function setupScoreBonus(setup: SetupAnalysis): number {
  let bonus = 0;
  if (setup.setupType === "눌림목 롱") bonus += 800;
  else if (setup.consolidateMatch && setup.pumpMatch) bonus += 400;
  if (setup.bias === "long") bonus += 150;
  if (setup.pullbackMatch) bonus += 200;
  return bonus;
}
