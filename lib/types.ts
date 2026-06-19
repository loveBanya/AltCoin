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
