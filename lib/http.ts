export async function parseResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text.trim()) {
    if (res.status === 504 || res.status === 408) {
      throw new Error("스캔 시간 초과. 표시 상위 N을 줄이거나 다시 시도하세요.");
    }
    throw new Error(
      res.ok
        ? "서버 응답이 비어 있습니다."
        : `요청 실패 (${res.status})`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("서버 응답 형식 오류");
  }
}

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await parseResponseJson<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? `요청 실패 (${res.status})`);
  }
  return data;
}
