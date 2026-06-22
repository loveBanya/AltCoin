export interface ScannerConfig {
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  lookbackMin: number;
  lookbackMax: number;
  detectGoldenCross: boolean;
  detectZeroCross: boolean;
  highDays: number;
  minDropPct: number;
  maxDropPct: number;
  quoteVolumeTopN: number;
  volumeTopN: number;
  resultTopN: number;
  /** true면 거래량 상위 N 무시하고 USDT 무기한 선물 전 종목 스캔 */
  scanAllPerpetuals: boolean;
  /** 횡보 판단: 1시간봉 N시간 구간 최대 변동폭% */
  consolidationHours: number;
  maxConsolidationRangePct: number;
  /** 급등 판단: 최근 N시간 고점 상승률% */
  pumpLookbackHours: number;
  minPumpPct: number;
  /** 눌림목: 급등 고점 대비 하락% 범위 (음수) */
  pullbackMinPct: number;
  pullbackMaxPct: number;
  /** 눌림목 패턴만 우선 표시 */
  pullbackSetupOnly: boolean;
}

export interface CoinResult {
  rank: number;
  symbol: string;
  price: number;
  changePct24h: number;
  quoteVolumeRank: number;
  volumeRank: number;
  high90d: number;
  dropFromHighPct: number;
  macd: number;
  macdSignal: number;
  macdCrossType: string;
  macdCrossBarsAgo: number;
  signals: string[];
  score: number;
  macdMatch: boolean;
  dropMatch: boolean;
  /** 횡보→급등→눌림목 */
  setupType: string;
  consolidateRangePct: number;
  pumpPct: number;
  pullbackFromPumpPct: number;
  pullbackMatch: boolean;
  /** long | short | sideways */
  bias: "long" | "short" | "sideways";
  biasLabel: string;
  biasReasons: string[];
  rsi14: number;
  /** 이전 스캔 대비 (클라이언트에서 채움) */
  prevPrice?: number;
  profitPct?: number;
}

export interface ScanResponse {
  results: CoinResult[];
  count: number;
  scannedAt: string;
  candidates: number;
  fullMatch: number;
  market: "futures" | "spot";
  marketLabel?: string;
  /** USDT 무기한 선물 24h 티커 전체 개수 */
  tickerCount?: number;
}

export interface ScanError {
  error: string;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  price: number;
  changePct24h: number;
  quoteVolume: number;
}

export interface RecentSearch {
  symbol: string;
  searchedAt: string;
  price: number;
}

export interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  count: number;
  results: { symbol: string; price: number }[];
}

export interface ProfitSimulation {
  prevScannedAt: string;
  currentScannedAt: string;
  investAmount: number;
  prevCount: number;
  matchedCount: number;
  totalReturnPct: number;
  profitAmount: number;
  details: {
    symbol: string;
    prevPrice: number;
    currentPrice: number;
    profitPct: number;
    invested: number;
    currentValue: number;
  }[];
}
