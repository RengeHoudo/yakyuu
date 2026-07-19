/**
 * NPBサイトへのフェッチを環境に応じてラップするヘルパー。
 *
 * - 開発中 (npm run dev): Vite dev serverのプロキシパスをそのまま使用
 * - 本番 (GitHub Pages等): CORSプロキシ経由でNPBサイトへ直接アクセス
 */

const CORS_PROXY = 'https://corsproxy.io/?url='

/** キャッシュ無効化オプション */
const NO_CACHE: RequestInit = { cache: 'no-store' }

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
  return `${CORS_PROXY}${encodeURIComponent(busted)}`
}

/** NPB名簿ページ（/announcement/roster/）を取得 */
export function fetchNpbRosterPage(): Promise<Response> {
  if (isProduction()) {
    return fetch(buildCorsProxyUrl('https://npb.jp/announcement/roster/'), NO_CACHE)
  }
  return fetch('/api/npb-roster', NO_CACHE)
}

/** NPB成績ページを取得 */
export function fetchNpbStatsPage(type: 'batting' | 'pitching', year: number, code: string): Promise<Response> {
  if (isProduction()) {
    const prefix = type === 'batting' ? 'idb1' : 'idp1'
    return fetch(buildCorsProxyUrl(`https://npb.jp/bis/${year}/stats/${prefix}_${code}.html`), NO_CACHE)
  }
  return fetch(`/api/npb-stats/${type}/${year}/${code}`, NO_CACHE)
}

/** NPBスコアページを取得 */
export function fetchNpbScorePage(year: string, date: string, homeCode: string, awayCode: string, gameNum: string): Promise<Response> {
  if (isProduction()) {
    return fetch(buildCorsProxyUrl(`https://npb.jp/scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`), NO_CACHE)
  }
  return fetch(`/api/npb-scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`, NO_CACHE)
}

/** NPB試合ベンチ入り選手ページ（roster.html）を取得する */
export function fetchNpbGameRosterPage(scoreUrl: string): Promise<Response> {
  const base = scoreUrl.endsWith('/') ? scoreUrl : scoreUrl + '/'
  const rosterUrl = base + 'roster.html'
  if (isProduction()) {
    return fetch(buildCorsProxyUrl(rosterUrl), NO_CACHE)
  }
  const devPath = rosterUrl.replace('https://npb.jp/scores/', '/api/npb-scores/')
  return fetch(devPath, NO_CACHE)
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
    return fetch(buildCorsProxyUrl(boxUrl), NO_CACHE)
  }
  // 開発時: Vite dev proxy (/api/npb-scores/ → https://npb.jp/scores/)
  const devPath = boxUrl.replace('https://npb.jp/scores/', '/api/npb-scores/')
  return fetch(devPath, NO_CACHE)
}
