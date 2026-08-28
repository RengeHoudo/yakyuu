/**
 * NPBサイトへのフェッチを環境に応じてラップするヘルパー。
 *
 * - 開発中 (npm run dev): Vite dev serverのプロキシパスをそのまま使用
 * - 本番 (GitHub Pages等): CORSプロキシ経由でNPBサイトへ直接アクセス
 */

const DEFAULT_NPB_PROXY_BASE = 'https://r.jina.ai/'

/**
 * 本番用NPB取得プロキシ。
 * 専用プロキシを用意した場合は VITE_NPB_PROXY_BASE で差し替えられる。
 * 値は `https://example.com/` のように、対象URLを末尾へ連結できる形式を想定する。
 */
const NPB_PROXY_BASE = (import.meta.env.VITE_NPB_PROXY_BASE as string | undefined)?.trim()
  || DEFAULT_NPB_PROXY_BASE

/** キャッシュ無効化オプション */
const NO_CACHE: RequestInit = { cache: 'no-store' }

/** ReaderからNPBのDOM構造を保持したHTMLを取得するオプション */
const PROXY_REQUEST: RequestInit = {
  ...NO_CACHE,
  headers: {
    'x-respond-with': 'html',
    'x-no-cache': 'true',
  },
}

function isProduction(): boolean {
  return import.meta.env.PROD
}

/**
 * CORSプロキシ用URLを生成する。
 * プロキシサーバー側キャッシュを回避するため _cb パラメータを付与する。
 */
export function buildCorsProxyUrl(targetUrl: string): string {
  const separator = targetUrl.includes('?') ? '&' : '?'
  const busted = `${targetUrl}${separator}_cb=${Date.now()}`
  const proxyBase = NPB_PROXY_BASE.endsWith('/') ? NPB_PROXY_BASE : `${NPB_PROXY_BASE}/`
  return `${proxyBase}${busted}`
}

function fetchProductionPage(targetUrl: string): Promise<Response> {
  return fetch(buildCorsProxyUrl(targetUrl), PROXY_REQUEST)
}

/** NPB名簿ページ（/announcement/roster/）を取得 */
export function fetchNpbRosterPage(): Promise<Response> {
  if (isProduction()) {
    return fetchProductionPage('https://npb.jp/announcement/roster/')
  }
  return fetch('/api/npb-roster', NO_CACHE)
}

/** NPB成績ページを取得 */
export function fetchNpbStatsPage(type: 'batting' | 'pitching', year: number, code: string): Promise<Response> {
  if (isProduction()) {
    const prefix = type === 'batting' ? 'idb1' : 'idp1'
    return fetchProductionPage(`https://npb.jp/bis/${year}/stats/${prefix}_${code}.html`)
  }
  return fetch(`/api/npb-stats/${type}/${year}/${code}`, NO_CACHE)
}

/** NPBスコアページを取得 */
export function fetchNpbScorePage(year: string, date: string, homeCode: string, awayCode: string, gameNum: string): Promise<Response> {
  if (isProduction()) {
    return fetchProductionPage(`https://npb.jp/scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`)
  }
  return fetch(`/api/npb-scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`, NO_CACHE)
}

/** NPB試合ベンチ入り選手ページ（roster.html）を取得する */
export function fetchNpbGameRosterPage(scoreUrl: string): Promise<Response> {
  const base = scoreUrl.endsWith('/') ? scoreUrl : scoreUrl + '/'
  const rosterUrl = base + 'roster.html'
  if (isProduction()) {
    return fetchProductionPage(rosterUrl)
  }
  const devPath = rosterUrl.replace('https://npb.jp/scores/', '/api/npb-scores/')
  return fetch(devPath, NO_CACHE)
}

/** オールスター／フレッシュオールスターの出場者ページを取得する */
export function fetchNpbEventRosterPage(
  eventType: 'allstar' | 'freshas',
  year: string,
): Promise<Response> {
  const rosterUrl = `https://npb.jp/${eventType}/${year}/roster.html`
  if (isProduction()) {
    return fetchProductionPage(rosterUrl)
  }
  return fetch(`/api/npb-event/${eventType}/${year}/roster.html`, NO_CACHE)
}

/**
 * NPBボックススコアページ（box.html）を取得する。
 * scoreUrl には末尾スラッシュあり・なし両方対応。
 * 3分ごとのポーリングに使用するため、キャッシュは必ず無効化する。
 */
export function fetchBoxScorePage(scoreUrl: string): Promise<Response> {
  const base = scoreUrl.endsWith('/') ? scoreUrl : scoreUrl + '/'
  const boxUrl = base + 'box.html'
  if (isProduction()) {
    return fetchProductionPage(boxUrl)
  }
  // 開発時: Vite dev proxy (/api/npb-scores/ → https://npb.jp/scores/)
  const devPath = boxUrl.replace('https://npb.jp/scores/', '/api/npb-scores/')
  return fetch(devPath, NO_CACHE)
}
