"use client";

import { toggleFavorite, loadFavorites } from "@/lib/storage";
import type { CoinResult } from "@/lib/types";
import { useEffect, useState } from "react";

interface Props {
  results: CoinResult[];
  onDownload: () => void;
}

export function ResultsTable({ results, onDownload }: Props) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [fullMatchOnly, setFullMatchOnly] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const handleFav = (symbol: string) => {
    setFavorites(toggleFavorite(symbol));
  };

  const filtered = results.filter((r) => {
    if (favOnly && !favorites.includes(r.symbol)) return false;
    if (fullMatchOnly && !(r.macdMatch && r.dropMatch)) return false;
    if (filter && !r.symbol.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const hasPrev = results.some((r) => r.prevPrice !== undefined);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="결과 내 검색..."
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={fullMatchOnly}
            onChange={(e) => setFullMatchOnly(e.target.checked)}
            className="accent-emerald-500"
          />
          조건 완전 충족만
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={favOnly}
            onChange={(e) => setFavOnly(e.target.checked)}
            className="accent-emerald-500"
          />
          즐겨찾기만
        </label>
        <button onClick={onDownload} className="text-sm text-emerald-400 hover:underline">
          CSV 다운로드
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="w-8 px-2 py-3"></th>
              {["순위", "매칭", "심볼", "현재가", ...(hasPrev ? ["이전가", "수익률"] : []), "24h%", "거래대금#", "거래량#", "90일고", "고점대비%", "MACD신호", "봉전", "점수"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const full = r.macdMatch && r.dropMatch;
              return (
                <tr
                  key={r.symbol}
                  className={`border-t border-zinc-800 hover:bg-zinc-900/50 ${full ? "bg-emerald-950/10" : ""}`}
                >
                  <td className="px-2 py-2">
                    <button onClick={() => handleFav(r.symbol)} className="text-base">
                      {favorites.includes(r.symbol) ? "⭐" : "☆"}
                    </button>
                  </td>
                  <td className="px-3 py-2">{r.rank}</td>
                  <td className="px-3 py-2">
                    {full ? (
                      <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-xs text-emerald-400">완전</span>
                    ) : (
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">부분</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-emerald-400">{r.symbol}</td>
                  <td className="px-3 py-2">{r.price}</td>
                  {hasPrev && (
                    <>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.prevPrice !== undefined ? r.prevPrice : "-"}
                      </td>
                      <td className={`px-3 py-2 ${(r.profitPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.profitPct !== undefined
                          ? `${r.profitPct >= 0 ? "+" : ""}${r.profitPct}%`
                          : "-"}
                      </td>
                    </>
                  )}
                  <td className={`px-3 py-2 ${r.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {r.changePct24h.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2">{r.quoteVolumeRank}</td>
                  <td className="px-3 py-2">{r.volumeRank}</td>
                  <td className="px-3 py-2">{r.high90d}</td>
                  <td className="px-3 py-2">{r.dropFromHighPct}%</td>
                  <td className="px-3 py-2">{r.macdCrossType}</td>
                  <td className="px-3 py-2">{r.macdCrossBarsAgo >= 0 ? r.macdCrossBarsAgo : "-"}</td>
                  <td className="px-3 py-2 text-zinc-400">{Math.round(r.score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-zinc-500">표시할 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
