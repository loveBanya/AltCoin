export const runtime = "edge";
export const preferredRegion = "sin1";

const UPSTREAM = "https://api.binance.com";

async function proxy(request: Request, pathSegments: string[]) {
  const url = new URL(request.url);
  const path = pathSegments.join("/");
  const target = `${UPSTREAM}/${path}${url.search}`;

  const res = await fetch(target, {
    headers: {
      "User-Agent": "altcoin-scanner/1.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

type RouteCtx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
