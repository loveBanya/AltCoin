# 바이낸스 USDT 선물 알트코인 스캐너

바이낸스 USDT 무기한 선물 종목을 조건에 맞게 필터링하는 **서버리스 웹앱**입니다.

## 필터 조건

| # | 조건 | 기본값 |
|---|------|--------|
| ① | MACD 골든크로스 또는 0선 돌파 (5분봉) | UI에서 설정 |
| ② | 90일 최고가 대비 -10% ~ -35% | UI에서 설정 |
| ③ | 거래대금(USDT) 상위 100 | 100 |
| ④ | 거래량 상위 100 | 100 |

## 추가 기능

- **종목 검색** — 바이낸스 USDT 선물 전 종목 검색 + 실시간 가격
- **즐겨찾기** — ☆ 클릭으로 저장 (브라우저 localStorage)
- **최근 검색** — 최근 20개 검색 기록 유지
- **스캔 기록** — 매 스캔 시 가격 스냅샷 저장 (최대 30회)
- **가상 수익 시뮬레이션** — 이전 스캔 대비 현재 가격 비교, 균등 분할 투자 수익률 계산

## 로컬 개발

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인합니다.

## Vercel 서버리스 배포

1. [Vercel](https://vercel.com)에 GitHub 저장소 연결
2. 프레임워크: **Next.js** (자동 감지)
3. Deploy

또는 CLI:

```bash
npm i -g vercel
vercel
```

### 구조

- `app/page.tsx` — 프론트엔드 UI (설정은 브라우저 localStorage 저장)
- `app/api/scan/route.ts` — 서버리스 API (바이낸스 데이터 수집 + MACD 분석)
- `lib/scanner.ts` — 스캐너 핵심 로직

API Route는 최대 60초 실행 (`vercel.json` + `maxDuration`).

## API 451 지역 제한 오류

`Binance API error: 451` 은 바이낸스가 **특정 국가/지역 IP**에서 Futures API 접근을 차단할 때 발생합니다. (한국, 미국, Vercel 서버 등)

### 해결 방법

1. **Cloudflare Worker 프록시** (권장)
   - `proxy/cloudflare-worker.ts` 코드를 Cloudflare Workers에 배포
   - Vercel / 로컬 `.env` 설정:
   ```
   BINANCE_FAPI_BASE=https://your-worker.workers.dev
   ```

2. **자동 fallback** — `fapi1`~`fapi3` 미러 URL을 순차 시도 (같은 지역이면 여전히 451 가능)

3. **로컬 개발** — VPN(허용 지역) 사용 또는 `.env.local`에 프록시 URL 설정

```bash
cp .env.example .env.local
# BINANCE_FAPI_BASE=https://your-proxy.workers.dev
```

Vercel 배포 시: Project Settings → Environment Variables → `BINANCE_FAPI_BASE` 추가 후 Redeploy

## 레거시 (Python)

기존 Streamlit 버전은 `app.py`, `scanner.py`에 남아 있습니다.

```bash
pip install -r requirements.txt
streamlit run app.py
```
