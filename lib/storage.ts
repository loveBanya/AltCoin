import type { RecentSearch, ScanHistoryEntry } from "./types";

export const STORAGE_KEYS = {
  config: "altcoin-scanner-config",
  favorites: "altcoin-favorites",
  recentSearches: "altcoin-recent-searches",
  scanHistory: "altcoin-scan-history",
  investAmount: "altcoin-invest-amount",
} as const;

const MAX_RECENT = 20;
const MAX_HISTORY = 30;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadFavorites(): string[] {
  return read<string[]>(STORAGE_KEYS.favorites, []);
}

export function saveFavorites(favorites: string[]) {
  write(STORAGE_KEYS.favorites, favorites);
}

export function toggleFavorite(symbol: string): string[] {
  const base = symbol.replace(/USDT$/i, "").toUpperCase();
  const set = new Set(loadFavorites());
  if (set.has(base)) set.delete(base);
  else set.add(base);
  const next = [...set];
  saveFavorites(next);
  return next;
}

export function loadRecentSearches(): RecentSearch[] {
  return read<RecentSearch[]>(STORAGE_KEYS.recentSearches, []);
}

export function addRecentSearch(symbol: string, price: number): RecentSearch[] {
  const base = symbol.replace(/USDT$/i, "").toUpperCase();
  const entry: RecentSearch = {
    symbol: base,
    searchedAt: new Date().toISOString(),
    price,
  };
  const filtered = loadRecentSearches().filter((r) => r.symbol !== base);
  const next = [entry, ...filtered].slice(0, MAX_RECENT);
  write(STORAGE_KEYS.recentSearches, next);
  return next;
}

export function loadScanHistory(): ScanHistoryEntry[] {
  return read<ScanHistoryEntry[]>(STORAGE_KEYS.scanHistory, []);
}

export function saveScanHistory(history: ScanHistoryEntry[]) {
  write(STORAGE_KEYS.scanHistory, history.slice(0, MAX_HISTORY));
}

export function addScanHistory(
  scannedAt: string,
  results: { symbol: string; price: number }[],
): ScanHistoryEntry[] {
  const entry: ScanHistoryEntry = {
    id: crypto.randomUUID(),
    scannedAt,
    count: results.length,
    results,
  };
  const next = [entry, ...loadScanHistory()].slice(0, MAX_HISTORY);
  saveScanHistory(next);
  return next;
}

export function loadInvestAmount(): number {
  const v = read<number | null>(STORAGE_KEYS.investAmount, null);
  return v ?? 1000;
}

export function saveInvestAmount(amount: number) {
  write(STORAGE_KEYS.investAmount, amount);
}

export function clearScanHistory() {
  localStorage.removeItem(STORAGE_KEYS.scanHistory);
}
