"""바이낸스 USDT 선물 코인 스캐너 UI"""

import streamlit as st

from scanner import (
    BinanceScanner,
    ScannerConfig,
    load_config,
    results_to_dataframe,
    save_config,
)

st.set_page_config(
    page_title="알트코인 스캐너",
    page_icon="📊",
    layout="wide",
)

st.title("📊 바이낸스 USDT 선물 스캐너")
st.caption("MACD 신호 + 90일 고점 대비 하락 + 거래량 상위 종목 필터")

if "config" not in st.session_state:
    st.session_state.config = load_config()

cfg: ScannerConfig = st.session_state.config

with st.sidebar:
    st.header("⚙️ 필터 설정")

    st.subheader("① MACD (5분봉)")
    cfg.macd_fast = st.number_input("Fast EMA", min_value=2, max_value=50, value=cfg.macd_fast)
    cfg.macd_slow = st.number_input("Slow EMA", min_value=5, max_value=100, value=cfg.macd_slow)
    cfg.macd_signal = st.number_input("Signal EMA", min_value=2, max_value=50, value=cfg.macd_signal)

    col_a, col_b = st.columns(2)
    with col_a:
        cfg.lookback_min = st.number_input(
            "최소 봉", min_value=1, max_value=20, value=cfg.lookback_min,
            help="최근 N봉 이내에서 신호 감지 (하한)",
        )
    with col_b:
        cfg.lookback_max = st.number_input(
            "최대 봉", min_value=1, max_value=20, value=cfg.lookback_max,
            help="최근 N봉 이내에서 신호 감지 (상한)",
        )

    cfg.detect_golden_cross = st.checkbox("골든크로스 감지", value=cfg.detect_golden_cross)
    cfg.detect_zero_cross = st.checkbox("0선 돌파 감지", value=cfg.detect_zero_cross)

    st.divider()
    st.subheader("② 90일 최고가 대비")
    cfg.high_days = st.number_input("고점 기간 (일)", min_value=7, max_value=365, value=cfg.high_days)

    col_c, col_d = st.columns(2)
    with col_c:
        cfg.max_drop_pct = st.number_input(
            "최소 하락%", min_value=-90.0, max_value=0.0, value=float(cfg.max_drop_pct), step=1.0,
            help="고점 대비 이만큼 이상 하락 (예: -10%)",
        )
    with col_d:
        cfg.min_drop_pct = st.number_input(
            "최대 하락%", min_value=-90.0, max_value=0.0, value=float(cfg.min_drop_pct), step=1.0,
            help="고점 대비 이만큼 이하 하락 (예: -35%)",
        )

    st.divider()
    st.subheader("③④ 거래량 필터")
    cfg.quote_volume_top_n = st.number_input(
        "거래대금 상위 N", min_value=10, max_value=500, value=cfg.quote_volume_top_n,
    )
    cfg.volume_top_n = st.number_input(
        "거래량 상위 N", min_value=10, max_value=500, value=cfg.volume_top_n,
    )

    if st.button("💾 설정 저장", use_container_width=True):
        save_config(cfg)
        st.success("config.yaml에 저장됨")

st.session_state.config = cfg

st.markdown("""
### 필터 조건
| # | 조건 | 설명 |
|---|------|------|
| ① | MACD 신호 | 5분봉 기준 골든크로스 또는 0선 돌파 (설정 가능) |
| ② | 고점 대비 하락 | 최근 N일 최고가 대비 설정 범위 내 |
| ③ | 거래대금 | 바이낸스 USDT 선물 상위 N |
| ④ | 거래량 | 바이낸스 USDT 선물 상위 N |
""")

if st.button("🔍 스캔 시작", type="primary", use_container_width=True):
    if cfg.lookback_min > cfg.lookback_max:
        st.error("MACD '최소 봉'은 '최대 봉'보다 작거나 같아야 합니다.")
    elif cfg.min_drop_pct > cfg.max_drop_pct:
        st.error("'최대 하락%'는 '최소 하락%'보다 작거나 같아야 합니다. (예: -35 ~ -10)")
    elif not cfg.detect_golden_cross and not cfg.detect_zero_cross:
        st.error("골든크로스 또는 0선 돌파 중 하나 이상을 선택하세요.")
    else:
        progress = st.progress(0, text="스캔 준비 중...")
        status = st.empty()

        def on_progress(done, total):
            pct = done / total if total else 0
            progress.progress(pct, text=f"분석 중... {done}/{total}")

        try:
            scanner = BinanceScanner(cfg)
            with st.spinner("바이낸스 데이터 수집 중..."):
                results = scanner.scan(progress_callback=on_progress)

            progress.empty()
            status.empty()

            st.success(f"✅ {len(results)}개 종목이 조건에 부합합니다.")

            if results:
                df = results_to_dataframe(results)
                st.dataframe(
                    df,
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "현재가": st.column_config.NumberColumn(format="%.6f"),
                        "90일최고가": st.column_config.NumberColumn(format="%.6f"),
                        "24h변동%": st.column_config.NumberColumn(format="%.2f%%"),
                        "최고가대비%": st.column_config.NumberColumn(format="%.2f%%"),
                    },
                )

                csv = df.to_csv(index=False).encode("utf-8-sig")
                st.download_button(
                    "📥 CSV 다운로드",
                    data=csv,
                    file_name="altcoin_scan.csv",
                    mime="text/csv",
                )
            else:
                st.info("조건에 맞는 종목이 없습니다. 설정을 완화해 보세요.")

        except Exception as e:
            progress.empty()
            st.error(f"스캔 실패: {e}")
