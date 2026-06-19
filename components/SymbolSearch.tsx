"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addRecentSearch, loadFavorites, loadRecentSearches, toggleFavorite } from "@/lib/storage";
import type { RecentSearch, SymbolInfo } from "@/lib/types";

interface Props {
  onSelect?: (symbol: SymbolInfo) => void;
}

export function SymbolSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setFavorites(loadFavorites());
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSymbols = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/symbols${params}`);
      const data = await res.json();
      setResults(data.symbols ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSymbols(value), 250);
  };

  const handleSelect = (sym: SymbolInfo) => {
    setQuery(sym.baseAsset);
    setOpen(false);
    const next = addRecentSearch(sym.baseAsset, sym.price);
    setRecent(next);
    onSelect?.(sym);
  };

  const handleToggleFav = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setFavorites(toggleFavorite(symbol));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2">
        <span className="text-zinc-500">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (results.length === 0) fetchSymbols(query);
          }}
          placeholder="종목 검색 (예: BTC, ETH, SOL...)"
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        {loading && <span className="text-xs text-zinc-500">로딩...</span>}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          {results.map((sym) => (
            <button
              key={sym.baseAsset}
              onClick={() => handleSelect(sym)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <span
                  role="button"
                  onClick={(e) => handleToggleFav(e, sym.baseAsset)}
                  className="text-base"
                >
                  {favorites.includes(sym.baseAsset) ? "⭐" : "☆"}
                </span>
                <span className="font-medium text-emerald-400">{sym.baseAsset}</span>
                <span className="text-zinc-400">USDT</span>
              </div>
              <div className="text-right">
                <div>{sym.price}</div>
                <div className={sym.changePct24h >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {sym.changePct24h >= 0 ? "+" : ""}{sym.changePct24h.toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {favorites.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-zinc-500">즐겨찾기</p>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <FavoriteChip
                key={f}
                symbol={f}
                onSelect={handleSelect}
                onRemove={() => setFavorites(toggleFavorite(f))}
              />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-zinc-500">최근 검색</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <RecentChip key={`${r.symbol}-${r.searchedAt}`} item={r} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentChip({
  item,
  onSelect,
}: {
  item: RecentSearch;
  onSelect: (sym: SymbolInfo) => void;
}) {
  const handleClick = async () => {
    try {
      const res = await fetch(`/api/prices?symbols=${item.symbol}`);
      const data = await res.json();
      const p = data.prices?.[0];
      onSelect({
        symbol: item.symbol,
        baseAsset: item.symbol,
        price: p?.price ?? item.price,
        changePct24h: p?.changePct24h ?? 0,
        quoteVolume: 0,
      });
    } catch {
      onSelect({
        symbol: item.symbol,
        baseAsset: item.symbol,
        price: item.price,
        changePct24h: 0,
        quoteVolume: 0,
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-xs hover:bg-zinc-800"
    >
      <span className="font-medium text-emerald-400">{item.symbol}</span>
      <span className="ml-2 text-zinc-400">{item.price}</span>
    </button>
  );
}

function FavoriteChip({
  symbol,
  onSelect,
  onRemove,
}: {
  symbol: string;
  onSelect: (sym: SymbolInfo) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/prices?symbols=${symbol}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.prices?.[0]) setPrice(d.prices[0].price);
      })
      .catch(() => {});
  }, [symbol]);

  return (
    <button
      onClick={() =>
        onSelect({
          symbol,
          baseAsset: symbol,
          price: price ?? 0,
          changePct24h: 0,
          quoteVolume: 0,
        })
      }
      className="group flex items-center gap-1 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-1.5 text-xs hover:bg-amber-950/50"
    >
      <span>⭐</span>
      <span className="font-medium text-amber-300">{symbol}</span>
      {price !== null && <span className="text-zinc-400">{price}</span>}
      <span
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-1 text-zinc-500 hover:text-red-400"
      >
        ×
      </span>
    </button>
  );
}
