import { NextResponse } from "next/server";
import { scan, validateConfig } from "@/lib/scanner";
import { marketLabel } from "@/lib/binance-client";
import type { ScannerConfig } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["sin1", "hnd1", "syd1"];

export async function POST(request: Request) {
  try {
    const config = (await request.json()) as ScannerConfig;
    const error = validateConfig(config);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const { results, candidates, fullMatch, market, tickerCount } = await scan(config);

    return NextResponse.json({
      results,
      count: results.length,
      candidates,
      fullMatch,
      tickerCount,
      market,
      marketLabel: marketLabel(market),
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "스캔 중 오류가 발생했습니다.";
    const status = message.includes("451") || message.includes("지역 제한") ? 451 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
