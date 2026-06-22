import type { ScannerConfig } from "./types";

export const DEFAULT_CONFIG: ScannerConfig = {
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  lookbackMin: 1,
  lookbackMax: 5,
  detectGoldenCross: true,
  detectZeroCross: true,
  highDays: 90,
  minDropPct: -35,
  maxDropPct: -10,
  quoteVolumeTopN: 100,
  volumeTopN: 100,
  resultTopN: 30,
  scanAllPerpetuals: false,
  consolidationHours: 72,
  maxConsolidationRangePct: 12,
  pumpLookbackHours: 24,
  minPumpPct: 8,
  pullbackMinPct: -15,
  pullbackMaxPct: -2,
  pullbackSetupOnly: false,
};

export const CONFIG_STORAGE_KEY = "altcoin-scanner-config";
