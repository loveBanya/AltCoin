/**
 * Cloudflare Workers 프록시 (지역 제한 우회용)
 *
 * 1. Cloudflare Dashboard → Workers → Create
 * 2. 이 코드 붙여넣기 → Deploy
 * 3. Vercel/local .env 에 설정:
 *    BINANCE_FAPI_BASE=https://your-worker.workers.dev
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = `https://fapi.binance.com${url.pathname}${url.search}`;

    const res = await fetch(target, {
      headers: {
        "User-Agent": "altcoin-scanner/1.0",
        Accept: "application/json",
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
