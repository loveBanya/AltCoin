import type { ProfitSimulation } from "./types";

export function calcProfitSimulation(
  prevResults: { symbol: string; price: number }[],
  currentPrices: Map<string, number>,
  prevScannedAt: string,
  currentScannedAt: string,
  investAmount: number,
): ProfitSimulation {
  if (prevResults.length === 0) {
    return {
      prevScannedAt,
      currentScannedAt,
      investAmount,
      prevCount: 0,
      matchedCount: 0,
      totalReturnPct: 0,
      profitAmount: 0,
      details: [],
    };
  }

  const perCoin = investAmount / prevResults.length;
  let totalValue = 0;
  const details: ProfitSimulation["details"] = [];

  for (const { symbol, price: prevPrice } of prevResults) {
    const currentPrice = currentPrices.get(symbol) ?? prevPrice;
    const profitPct = ((currentPrice - prevPrice) / prevPrice) * 100;
    const currentValue = perCoin * (currentPrice / prevPrice);
    totalValue += currentValue;
    details.push({
      symbol,
      prevPrice,
      currentPrice,
      profitPct: Math.round(profitPct * 100) / 100,
      invested: perCoin,
      currentValue: Math.round(currentValue * 100) / 100,
    });
  }

  details.sort((a, b) => b.profitPct - a.profitPct);

  const profitAmount = totalValue - investAmount;
  const totalReturnPct = (profitAmount / investAmount) * 100;

  return {
    prevScannedAt,
    currentScannedAt,
    investAmount,
    prevCount: prevResults.length,
    matchedCount: prevResults.filter((r) => currentPrices.has(r.symbol)).length,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    profitAmount: Math.round(profitAmount * 100) / 100,
    details,
  };
}

export function enrichWithPrevPrices(
  results: { symbol: string; price: number }[],
  prevResults: { symbol: string; price: number }[] | null,
) {
  if (!prevResults) return results.map((r) => ({ ...r, prevPrice: undefined, profitPct: undefined }));
  const prevMap = new Map(prevResults.map((r) => [r.symbol, r.price]));
  return results.map((r) => {
    const prevPrice = prevMap.get(r.symbol);
    if (prevPrice === undefined) return { ...r, prevPrice: undefined, profitPct: undefined };
    const profitPct = ((r.price - prevPrice) / prevPrice) * 100;
    return { ...r, prevPrice, profitPct: Math.round(profitPct * 100) / 100 };
  });
}
