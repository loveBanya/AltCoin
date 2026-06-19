"use client";

import { useState } from "react";
import { clearScanHistory } from "@/lib/storage";
import type { ProfitSimulation, ScanHistoryEntry } from "@/lib/types";

interface Props {
  history: ScanHistoryEntry[];
  profitSim: ProfitSimulation | null;
  investAmount: number;
  onInvestAmountChange: (v: number) => void;
  onClearHistory: () => void;
}

export function ScanHistoryPanel({
  history,
  profitSim,
  investAmount,
  onInvestAmountChange,
  onClearHistory,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (history.length === 0 && !profitSim) return null;

  return (
    <div className="mb-6 space-y-4">
      {profitSim && profitSim.prevCount > 0 && (
        <div className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-4">
          <h3 className="mb-2 font-semibold text-blue-300">가상 수익 시뮬레이션</h3>
          <p className="mb-3 text-xs text-zinc-400">
            이전 스캔({new Date(profitSim.prevScannedAt).toLocaleString("ko-KR")}) 결과에
            균등 분할 투자했다면?
          </p>

          <label className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-zinc-400">가상 투자금 (USDT)</span>
            <input
              type="number"
              min={100}
              step={100}
              value={investAmount}
              onChange={(e) => onInvestAmountChange(parseFloat(e.target.value) || 1000)}
              className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="이전 종목 수" value={`${profitSim.prevCount}개`} />
            <Stat
              label="총 수익률"
              value={`${profitSim.totalReturnPct >= 0 ? "+" : ""}${profitSim.totalReturnPct}%`}
              color={profitSim.totalReturnPct >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <Stat
              label="수익금"
              value={`${profitSim.profitAmount >= 0 ? "+" : ""}${profitSim.profitAmount} USDT`}
              color={profitSim.profitAmount >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>

          {profitSim.details.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-blue-400">종목별 상세</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      {["심볼", "이전가", "현재가", "수익률", "투자", "평가"].map((h) => (
                        <th key={h} className="px-2 py-1">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profitSim.details.map((d) => (
                      <tr key={d.symbol} className="border-t border-zinc-800">
                        <td className="px-2 py-1 text-emerald-400">{d.symbol}</td>
                        <td className="px-2 py-1">{d.prevPrice}</td>
                        <td className="px-2 py-1">{d.currentPrice}</td>
                        <td className={`px-2 py-1 ${d.profitPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {d.profitPct >= 0 ? "+" : ""}{d.profitPct}%
                        </td>
                        <td className="px-2 py-1">{d.invested.toFixed(1)}</td>
                        <td className="px-2 py-1">{d.currentValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">스캔 기록</h3>
            <button
              onClick={() => {
                clearScanHistory();
                onClearHistory();
              }}
              className="text-xs text-zinc-500 hover:text-red-400"
            >
              기록 삭제
            </button>
          </div>
          <div className="space-y-2">
            {history.slice(0, 10).map((h) => (
              <div key={h.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <button
                  onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{new Date(h.scannedAt).toLocaleString("ko-KR")}</span>
                  <span className="text-zinc-400">{h.count}개 종목</span>
                </button>
                {expanded === h.id && (
                  <div className="border-t border-zinc-800 px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {h.results.map((r) => (
                        <span
                          key={r.symbol}
                          className="rounded bg-zinc-800 px-2 py-1 text-xs"
                        >
                          <span className="text-emerald-400">{r.symbol}</span>
                          <span className="ml-1 text-zinc-400">{r.price}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-zinc-900/50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold ${color ?? ""}`}>{value}</p>
    </div>
  );
}
