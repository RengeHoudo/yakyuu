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

/** NPB名簿ページ（/announcement/roster/）を取得 */
export function fetchNpbRosterPage(): Promise<Response> {
  if (isProduction()) {
    return fetch(`${CORS_PROXY}${encodeURIComponent('https://npb.jp/announcement/roster/')}`, NO_CACHE)
  }
  return fetch('/api/npb-roster', NO_CACHE)
}

/** NPB成績ページを取得 */
export function fetchNpbStatsPage(type: 'batting' | 'pitching', year: number, code: string): Promise<Response> {
  if (isProduction()) {
    const prefix = type === 'batting' ? 'idb1' : 'idp1'
    return fetch(`${CORS_PROXY}${encodeURIComponent(`https://npb.jp/bis/${year}/stats/${prefix}_${code}.html`)}`, NO_CACHE)
  }
  return fetch(`/api/npb-stats/${type}/${year}/${code}`, NO_CACHE)
}

/** NPBスコアページを取得 */
export function fetchNpbScorePage(year: string, date: string, homeCode: string, awayCode: string, gameNum: string): Promise<Response> {
  if (isProduction()) {
    return fetch(`${CORS_PROXY}${encodeURIComponent(`https://npb.jp/scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`)}`, NO_CACHE)
  }
  return fetch(`/api/npb-scores/${year}/${date}/${homeCode}-${awayCode}-${gameNum}/`, NO_CACHE)
}
