"""바이낸스 USDT 선물 코인 스캐너 - 핵심 로직"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
import yaml

BINANCE_FAPI = "https://fapi.binance.com"
DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.yaml"


@dataclass
class ScannerConfig:
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    lookback_min: int = 1
    lookback_max: int = 5
    detect_golden_cross: bool = True
    detect_zero_cross: bool = True
    high_days: int = 90
    min_drop_pct: float = -35.0
    max_drop_pct: float = -10.0
    quote_volume_top_n: int = 100
    volume_top_n: int = 100

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ScannerConfig:
        macd = data.get("macd", {})
        price = data.get("price_from_high", {})
        vol = data.get("volume", {})
        return cls(
            macd_fast=macd.get("fast_period", 12),
            macd_slow=macd.get("slow_period", 26),
            macd_signal=macd.get("signal_period", 9),
            lookback_min=macd.get("lookback_candles_min", 1),
            lookback_max=macd.get("lookback_candles_max", 5),
            detect_golden_cross=macd.get("detect_golden_cross", True),
            detect_zero_cross=macd.get("detect_zero_cross", True),
            high_days=price.get("days", 90),
            min_drop_pct=price.get("min_drop_pct", -35.0),
            max_drop_pct=price.get("max_drop_pct", -10.0),
            quote_volume_top_n=vol.get("quote_volume_top_n", 100),
            volume_top_n=vol.get("volume_top_n", 100),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "macd": {
                "fast_period": self.macd_fast,
                "slow_period": self.macd_slow,
                "signal_period": self.macd_signal,
                "lookback_candles_min": self.lookback_min,
                "lookback_candles_max": self.lookback_max,
                "detect_golden_cross": self.detect_golden_cross,
                "detect_zero_cross": self.detect_zero_cross,
            },
            "price_from_high": {
                "days": self.high_days,
                "min_drop_pct": self.min_drop_pct,
                "max_drop_pct": self.max_drop_pct,
            },
            "volume": {
                "quote_volume_top_n": self.quote_volume_top_n,
                "volume_top_n": self.volume_top_n,
            },
        }


def load_config(path: Path | str = DEFAULT_CONFIG_PATH) -> ScannerConfig:
    path = Path(path)
    if not path.exists():
        return ScannerConfig()
    with open(path, encoding="utf-8") as f:
        return ScannerConfig.from_dict(yaml.safe_load(f) or {})


def save_config(config: ScannerConfig, path: Path | str = DEFAULT_CONFIG_PATH) -> None:
    path = Path(path)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(config.to_dict(), f, allow_unicode=True, default_flow_style=False)


@dataclass
class CoinResult:
    symbol: str
    price: float
    quote_volume_24h: float
    volume_24h: float
    quote_volume_rank: int
    volume_rank: int
    high_90d: float
    drop_from_high_pct: float
    macd: float
    macd_signal: float
    macd_cross_type: str
    macd_cross_bars_ago: int
    change_pct_24h: float = 0.0
    signals: list[str] = field(default_factory=list)


class BinanceScanner:
    def __init__(self, config: ScannerConfig | None = None):
        self.config = config or ScannerConfig()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "altcoin-scanner/1.0"})

    def _get(self, endpoint: str, params: dict | None = None, retries: int = 3) -> Any:
        url = f"{BINANCE_FAPI}{endpoint}"
        for attempt in range(retries):
            try:
                resp = self.session.get(url, params=params, timeout=15)
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException:
                if attempt == retries - 1:
                    raise
                time.sleep(0.5 * (attempt + 1))
        return None

    def get_usdt_perpetual_symbols(self) -> list[str]:
        info = self._get("/fapi/v1/exchangeInfo")
        symbols = []
        for s in info["symbols"]:
            if (
                s["contractType"] == "PERPETUAL"
                and s["quoteAsset"] == "USDT"
                and s["status"] == "TRADING"
            ):
                symbols.append(s["symbol"])
        return symbols

    def get_24h_tickers(self) -> pd.DataFrame:
        data = self._get("/fapi/v1/ticker/24hr")
        df = pd.DataFrame(data)
        df = df[df["symbol"].str.endswith("USDT")]
        for col in ("lastPrice", "quoteVolume", "volume", "priceChangePercent"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df

    def get_klines(self, symbol: str, interval: str, limit: int) -> pd.DataFrame:
        raw = self._get(
            "/fapi/v1/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
        )
        df = pd.DataFrame(
            raw,
            columns=[
                "open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades", "taker_buy_base",
                "taker_buy_quote", "ignore",
            ],
        )
        for col in ("open", "high", "low", "close", "volume"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df

    @staticmethod
    def calc_macd(
        closes: pd.Series,
        fast: int,
        slow: int,
        signal: int,
    ) -> tuple[pd.Series, pd.Series, pd.Series]:
        ema_fast = closes.ewm(span=fast, adjust=False).mean()
        ema_slow = closes.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    def detect_macd_signal(
        self,
        macd_line: pd.Series,
        signal_line: pd.Series,
    ) -> tuple[bool, str, int]:
        """최근 lookback_min~lookback_max 봉 이내 MACD 신호 감지."""
        cfg = self.config
        n = len(macd_line)
        if n < cfg.macd_slow + cfg.macd_signal + 2:
            return False, "", -1

        look_start = max(1, n - cfg.lookback_max)
        look_end = n - cfg.lookback_min

        for i in range(look_end, look_start - 1, -1):
            prev_i = i - 1
            bars_ago = n - 1 - i

            if cfg.detect_golden_cross:
                if (
                    macd_line.iloc[prev_i] <= signal_line.iloc[prev_i]
                    and macd_line.iloc[i] > signal_line.iloc[i]
                ):
                    return True, "골든크로스", bars_ago

            if cfg.detect_zero_cross:
                if macd_line.iloc[prev_i] <= 0 and macd_line.iloc[i] > 0:
                    return True, "0선 돌파", bars_ago

        return False, "", -1

    def analyze_symbol(
        self,
        symbol: str,
        ticker_row: pd.Series,
        quote_rank: int,
        vol_rank: int,
    ) -> CoinResult | None:
        cfg = self.config
        try:
            klines_5m = self.get_klines(symbol, "5m", 200)
            klines_1d = self.get_klines(symbol, "1d", cfg.high_days)

            if klines_5m.empty or klines_1d.empty:
                return None

            closes_5m = klines_5m["close"]
            macd_line, signal_line, _ = self.calc_macd(
                closes_5m, cfg.macd_fast, cfg.macd_slow, cfg.macd_signal
            )

            has_signal, cross_type, bars_ago = self.detect_macd_signal(macd_line, signal_line)
            if not has_signal:
                return None

            high_90d = klines_1d["high"].max()
            current_price = float(ticker_row["lastPrice"])
            drop_pct = (current_price - high_90d) / high_90d * 100

            if not (cfg.min_drop_pct <= drop_pct <= cfg.max_drop_pct):
                return None

            signals = [cross_type]
            if cfg.detect_golden_cross and cfg.detect_zero_cross:
                if cross_type == "골든크로스" and macd_line.iloc[-1] > 0:
                    signals.append("0선 위")
                elif cross_type == "0선 돌파" and macd_line.iloc[-1] > signal_line.iloc[-1]:
                    signals.append("시그널 위")

            return CoinResult(
                symbol=symbol,
                price=current_price,
                quote_volume_24h=float(ticker_row["quoteVolume"]),
                volume_24h=float(ticker_row["volume"]),
                quote_volume_rank=quote_rank,
                volume_rank=vol_rank,
                high_90d=high_90d,
                drop_from_high_pct=drop_pct,
                macd=float(macd_line.iloc[-1]),
                macd_signal=float(signal_line.iloc[-1]),
                macd_cross_type=cross_type,
                macd_cross_bars_ago=bars_ago,
                change_pct_24h=float(ticker_row["priceChangePercent"]),
                signals=signals,
            )
        except Exception:
            return None

    def scan(self, progress_callback=None, max_workers: int = 8) -> list[CoinResult]:
        tickers = self.get_24h_tickers()
        cfg = self.config

        quote_top = (
            tickers.nlargest(cfg.quote_volume_top_n, "quoteVolume")
            .reset_index(drop=True)
        )
        vol_top = (
            tickers.nlargest(cfg.volume_top_n, "volume")
            .reset_index(drop=True)
        )

        quote_ranks = {row["symbol"]: i + 1 for i, row in quote_top.iterrows()}
        vol_ranks = {row["symbol"]: i + 1 for i, row in vol_top.iterrows()}

        candidates = set(quote_ranks) & set(vol_ranks)
        ticker_map = {row["symbol"]: row for _, row in tickers.iterrows()}

        results: list[CoinResult] = []
        total = len(candidates)
        done = 0

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.analyze_symbol,
                    sym,
                    ticker_map[sym],
                    quote_ranks[sym],
                    vol_ranks[sym],
                ): sym
                for sym in candidates
            }
            for future in as_completed(futures):
                done += 1
                if progress_callback:
                    progress_callback(done, total)
                result = future.result()
                if result:
                    results.append(result)

        results.sort(key=lambda r: r.quote_volume_rank)
        return results


def results_to_dataframe(results: list[CoinResult]) -> pd.DataFrame:
    if not results:
        return pd.DataFrame()
    rows = []
    for i, r in enumerate(results, 1):
        rows.append({
            "순위": i,
            "심볼": r.symbol.replace("USDT", ""),
            "현재가": r.price,
            "24h변동%": r.change_pct_24h,
            "거래대금순위": r.quote_volume_rank,
            "거래량순위": r.volume_rank,
            "90일최고가": r.high_90d,
            "최고가대비%": round(r.drop_from_high_pct, 2),
            "MACD": round(r.macd, 6),
            "시그널": round(r.macd_signal, 6),
            "MACD신호": r.macd_cross_type,
            "신호봉전": r.macd_cross_bars_ago,
            "신호목록": ", ".join(r.signals),
        })
    return pd.DataFrame(rows)
