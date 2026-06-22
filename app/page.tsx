"use client";

import { useCallback, useEffect, useState } from "react";
import { ScanHistoryPanel } from "@/components/ScanHistoryPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { SymbolSearch } from "@/components/SymbolSearch";
import { fetchJson } from "@/lib/http";
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/lib/default-config";
import { calcProfitSimulation, enrichWithPrevPrices } from "@/lib/profit";
import {
  addScanHistory,
  loadInvestAmount,
  loadScanHistory,
  saveInvestAmount,
} from "@/lib/storage";
import type {
  CoinResult,
  ProfitSimulation,
  ScanHistoryEntry,
  ScanResponse,
  ScannerConfig,
  SymbolInfo,
} from "@/lib/types";

function loadConfig(): ScannerConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

function saveConfigLocal(config: ScannerConfig) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function toCsv(results: CoinResult[]): string {
  const hasPrev = results.some((r) => r.prevPrice !== undefined);
  const headers = [
    "순위", "판단", "패턴", "심볼", "현재가",
    ...(hasPrev ? ["이전가", "수익률%"] : []),
    "24h변동%", "횡보%", "급등%", "눌림%", "RSI",
    "거래대금순위", "거래량순위", "90일최고가", "최고가대비%",
    "MACD", "시그널", "MACD신호", "신호봉전", "판단근거", "점수",
  ];
  const rows = results.map((r) => [
    r.rank, r.biasLabel, r.setupType, r.symbol, r.price,
    ...(hasPrev ? [r.prevPrice ?? "", r.profitPct ?? ""] : []),
    r.changePct24h, r.consolidateRangePct, r.pumpPct, r.pullbackFromPumpPct, r.rsi14,
    r.quoteVolumeRank, r.volumeRank, r.high90d, r.dropFromHighPct,
    r.macd, r.macdSignal, r.macdCrossType, r.macdCrossBarsAgo,
    r.biasReasons?.join("; ") ?? "", r.score,
  ]);
  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}

function NumInput({
  label, value, onChange, min, max, step = 1, hint,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        title={hint}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
    </label>
  );
}

export default function Home() {
  const [config, setConfig] = useState<ScannerConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<CoinResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    candidates: number;
    scannedAt: string;
    fullMatch: number;
    marketLabel?: string;
    tickerCount?: number;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolInfo | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [profitSim, setProfitSim] = useState<ProfitSimulation | null>(null);
  const [investAmount, setInvestAmount] = useState(1000);

  const recalcProfit = useCallback(
    async (amount: number, history: ScanHistoryEntry[]) => {
      if (history.length < 2) return;
      const current = history[0];
      const prev = history[1];
      const currentPrices = new Map(current.results.map((r) => [r.symbol, r.price]));
      const missing = prev.results.map((r) => r.symbol).filter((s) => !currentPrices.has(s));
      if (missing.length > 0) {
        try {
          const priceData = await fetchJson<{ prices?: { symbol: string; price: number }[] }>(
            `/api/prices?symbols=${missing.join(",")}`,
          );
          for (const p of priceData.prices ?? []) {
            currentPrices.set(p.symbol, p.price);
          }
        } catch {
          /* 가격 조회 실패 시 기록된 가격 사용 */
        }
      }
      setProfitSim(
        calcProfitSimulation(prev.results, currentPrices, prev.scannedAt, current.scannedAt, amount),
      );
    },
    [],
  );

  useEffect(() => {
    const history = loadScanHistory();
    const amount = loadInvestAmount();
    setConfig(loadConfig());
    setScanHistory(history);
    setInvestAmount(amount);
    if (history.length >= 2) {
      recalcProfit(amount, history);
    }
  }, [recalcProfit]);

  const update = useCallback(<K extends keyof ScannerConfig>(key: K, value: ScannerConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = () => {
    saveConfigLocal(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleInvestChange = (v: number) => {
    setInvestAmount(v);
    saveInvestAmount(v);
    recalcProfit(v, scanHistory);
  };

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setProfitSim(null);

    const prevHistory = loadScanHistory();
    const prevScan = prevHistory[0] ?? null;

    try {
      const scanData = await fetchJson<ScanResponse>("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const enriched = enrichWithPrevPrices(
        scanData.results,
        prevScan?.results ?? null,
      ) as CoinResult[];

      setResults(enriched.map((r, i) => ({ ...r, rank: i + 1 })));
      setMeta({
        candidates: scanData.candidates,
        scannedAt: scanData.scannedAt,
        fullMatch: scanData.fullMatch ?? 0,
        marketLabel: scanData.marketLabel,
        tickerCount: scanData.tickerCount,
      });

      const historyResults = scanData.results.map((r) => ({
        symbol: r.symbol,
        price: r.price,
      }));
      const newHistory = addScanHistory(scanData.scannedAt, historyResults);
      setScanHistory(newHistory);

      if (prevScan) {
        const updatedHistory = loadScanHistory();
        await recalcProfit(investAmount, updatedHistory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + toCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "altcoin_scan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 md:flex-row md:p-6">
      <aside className="w-full shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 md:w-72">
        <h2 className="mb-4 text-lg font-semibold">필터 설정</h2>

        <section className="mb-5">
          <h3 className="mb-3 text-sm font-medium text-emerald-400">① MACD (5분봉)</h3>
          <div className="space-y-3">
            <NumInput label="Fast EMA" value={config.macdFast} onChange={(v) => update("macdFast", v)} min={2} max={50} />
            <NumInput label="Slow EMA" value={config.macdSlow} onChange={(v) => update("macdSlow", v)} min={5} max={100} />
            <NumInput label="Signal EMA" value={config.macdSignal} onChange={(v) => update("macdSignal", v)} min={2} max={50} />
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="최소 봉" value={config.lookbackMin} onChange={(v) => update("lookbackMin", v)} min={1} max={20} />
              <NumInput label="최대 봉" value={config.lookbackMax} onChange={(v) => update("lookbackMax", v)} min={1} max={20} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.detectGoldenCross} onChange={(e) => update("detectGoldenCross", e.target.checked)} className="accent-emerald-500" />
              골든크로스 감지
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.detectZeroCross} onChange={(e) => update("detectZeroCross", e.target.checked)} className="accent-emerald-500" />
              0선 돌파 감지
            </label>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-3 text-sm font-medium text-emerald-400">② 고점 대비 하락</h3>
          <div className="space-y-3">
            <NumInput label="고점 기간 (일)" value={config.highDays} onChange={(v) => update("highDays", v)} min={7} max={365} />
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="최소 하락%" value={config.maxDropPct} onChange={(v) => update("maxDropPct", v)} min={-90} max={0} step={1} />
              <NumInput label="최대 하락%" value={config.minDropPct} onChange={(v) => update("minDropPct", v)} min={-90} max={0} step={1} />
            </div>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-3 text-sm font-medium text-amber-400">⑤ 횡보→급등→눌림목</h3>
          <div className="space-y-3">
            <NumInput label="횡보 기간 (시간)" value={config.consolidationHours ?? 72} onChange={(v) => update("consolidationHours", v)} min={24} max={168} />
            <NumInput label="횡보 최대 변동%" value={config.maxConsolidationRangePct ?? 12} onChange={(v) => update("maxConsolidationRangePct", v)} min={3} max={30} step={1} />
            <NumInput label="급등 감지 (시간)" value={config.pumpLookbackHours ?? 24} onChange={(v) => update("pumpLookbackHours", v)} min={6} max={72} />
            <NumInput label="최소 급등%" value={config.minPumpPct ?? 8} onChange={(v) => update("minPumpPct", v)} min={3} max={50} step={1} />
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="눌림 최대%" value={config.pullbackMaxPct ?? -2} onChange={(v) => update("pullbackMaxPct", v)} min={-5} max={0} step={1} />
              <NumInput label="눌림 최소%" value={config.pullbackMinPct ?? -15} onChange={(v) => update("pullbackMinPct", v)} min={-40} max={-5} step={1} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.pullbackSetupOnly ?? false}
                onChange={(e) => update("pullbackSetupOnly", e.target.checked)}
                className="accent-amber-500"
              />
              눌림목 롱 패턴만 표시
            </label>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-3 text-sm font-medium text-emerald-400">③④ 거래량 필터</h3>
          <div className="space-y-3">
            <NumInput label="거래대금 상위 N" value={config.quoteVolumeTopN} onChange={(v) => update("quoteVolumeTopN", v)} min={10} max={500} />
            <NumInput label="거래량 상위 N" value={config.volumeTopN} onChange={(v) => update("volumeTopN", v)} min={10} max={500} />
            <NumInput label="표시 상위 N" value={config.resultTopN ?? 30} onChange={(v) => update("resultTopN", v)} min={1} max={100} hint="전체 스캔 후 점수순 상위 N개" />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.scanAllPerpetuals ?? false}
                onChange={(e) => update("scanAllPerpetuals", e.target.checked)}
                className="accent-emerald-500"
              />
              전체 USDT 무기한 선물 스캔 (24h 티커 전 종목)
            </label>
            {config.scanAllPerpetuals && (
              <p className="text-xs text-amber-500">종목 많으면 60초 초과 가능. 표시 상위 N만 줄이세요.</p>
            )}
          </div>
        </section>

        <button onClick={handleSave} className="w-full rounded-lg border border-zinc-700 py-2 text-sm hover:bg-zinc-800">
          {saved ? "저장됨" : "설정 저장 (브라우저)"}
        </button>
      </aside>

      <main className="flex-1">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">바이낸스 USDT 선물 스캐너</h1>
          <p className="mt-1 text-sm text-zinc-400">
            MACD + 고점 필터 + 횡보→급등→눌림목 + 롱/숏/횡보 판단
          </p>
        </header>

        <div className="mb-6">
          <SymbolSearch onSelect={setSelectedSymbol} />
        </div>

        {selectedSymbol && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3">
            <div>
              <span className="text-lg font-bold text-emerald-400">{selectedSymbol.baseAsset}</span>
              <span className="ml-2 text-zinc-400">USDT</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold">{selectedSymbol.price}</div>
              <div className={selectedSymbol.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}>
                {selectedSymbol.changePct24h >= 0 ? "+" : ""}{selectedSymbol.changePct24h.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={loading}
          className="mb-6 w-full rounded-xl bg-emerald-600 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50 sm:w-auto sm:px-10"
        >
          {loading ? "스캔 중..." : "스캔 시작"}
        </button>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-red-300">{error}</div>
        )}

        <ScanHistoryPanel
          history={scanHistory}
          profitSim={profitSim}
          investAmount={investAmount}
          onInvestAmountChange={handleInvestChange}
          onClearHistory={() => {
            setScanHistory([]);
            setProfitSim(null);
          }}
        />

        {meta && !loading && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-emerald-950 px-3 py-1 text-emerald-400">
              상위 {results.length}개 표시
            </span>
            <span className="rounded-full bg-blue-950 px-3 py-1 text-blue-400">
              조건 완전 충족 {meta.fullMatch}개
            </span>
            {meta.marketLabel && (
              <span className="rounded-full bg-amber-950 px-3 py-1 text-amber-400">
                {meta.marketLabel} 데이터
              </span>
            )}
            <span className="text-zinc-500">전체 스캔 {meta.candidates}개</span>
            {meta.tickerCount !== undefined && (
              <span className="text-zinc-500">24h 티커 {meta.tickerCount}개</span>
            )}
            <span className="text-zinc-500">{new Date(meta.scannedAt).toLocaleString("ko-KR")}</span>
            {scanHistory.length >= 2 && (
              <span className="text-blue-400">이전 스캔 대비 가격 비교 적용됨</span>
            )}
          </div>
        )}

        {results.length > 0 && <ResultsTable results={results} onDownload={handleDownload} />}

        {meta && results.length === 0 && !loading && !error && (
          <p className="text-zinc-500">조건에 맞는 종목이 없습니다. 설정을 완화해 보세요.</p>
        )}
      </main>
    </div>
  );
}
