import type { BatterBaseState } from '../types'
import type { BatterAverageDetail, BatterSituationalStats } from './npbScholar'
import { fetchNf3Page } from './fetchProxy'
import { normalizeLookupText, normalizePlayerLookupName } from './playerLookup'

const NF3_ORIGIN = 'https://nf3.sakura.ne.jp'
const TEAMS = [
  { code: 'T', league: 'Central', names: ['阪神'] },
  { code: 'DB', league: 'Central', names: ['DeNA', '横浜'] },
  { code: 'G', league: 'Central', names: ['巨人', '読売', 'ジャイアンツ'] },
  { code: 'D', league: 'Central', names: ['中日'] },
  { code: 'C', league: 'Central', names: ['広島'] },
  { code: 'S', league: 'Central', names: ['ヤクルト'] },
  { code: 'H', league: 'Pacific', names: ['ソフトバンク'] },
  { code: 'F', league: 'Pacific', names: ['日本ハム'] },
  { code: 'B', league: 'Pacific', names: ['オリックス'] },
  { code: 'E', league: 'Pacific', names: ['楽天'] },
  { code: 'L', league: 'Pacific', names: ['西武'] },
  { code: 'M', league: 'Pacific', names: ['ロッテ'] },
] as const

const BASE_LABELS: Record<string, BatterBaseState> = {
  無し: 'Empty', '1塁': '1st', '2塁': '2nd', '3塁': '3rd',
  '1・2塁': '1st+2nd', '1・3塁': '1st+3rd', '2・3塁': '2nd+3rd', 満塁: 'Loaded',
}
const RISP_STATES: BatterBaseState[] = ['2nd', '3rd', '1st+2nd', '1st+3rd', '2nd+3rd', 'Loaded']
const text = (value: string | null) => (value ?? '').normalize('NFKC').replace(/\s+/g, '')

function detail(atBats: number, hits: number): BatterAverageDetail {
  return { atBats, hits, average: (atBats ? hits / atBats : 0).toFixed(3).replace(/^0/, '') }
}

function sum(lines: (BatterAverageDetail | undefined)[]): BatterAverageDetail | undefined {
  if (lines.some((line) => !line)) return undefined
  return detail(lines.reduce((n, line) => n + line!.atBats, 0), lines.reduce((n, line) => n + line!.hits, 0))
}

/** 見出しと列名で表を選び、打席・代打・盗塁マトリクスとの混同を避ける。 */
export function parseNf3BatterStats(html: string): BatterSituationalStats | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = Array.from(doc.querySelectorAll('table')).find((candidate) =>
    /^ランナ[ー−-]別成績$/.test(text(candidate.querySelector('caption')?.textContent ?? '')))
  if (!table) return null
  const rows = Array.from(table.rows)
  const header = rows.find((row) => Array.from(row.cells).some((cell) => text(cell.textContent) === '打数'))
  if (!header) return null
  const columns = Array.from(header.cells, (cell) => text(cell.textContent))
  const abIndex = columns.indexOf('打数')
  const hitIndex = columns.indexOf('安打')
  const labelIndex = columns.indexOf('条件')
  if (abIndex < 0 || hitIndex < 0 || labelIndex < 0) return null

  const byBaseState: BatterSituationalStats['byBaseState'] = {}
  let risp: BatterAverageDetail | undefined
  for (const row of rows) {
    const label = text(row.cells[labelIndex]?.textContent ?? '')
    const base = BASE_LABELS[label]
    if (!base && label !== '得点圏') continue
    const ab = text(row.cells[abIndex]?.textContent ?? '')
    const hits = text(row.cells[hitIndex]?.textContent ?? '')
    if (!/^\d+$/.test(ab) || !/^\d+$/.test(hits) || Number(hits) > Number(ab)) continue
    const line = detail(Number(ab), Number(hits))
    if (base) byBaseState[base] = line
    else risp = line
  }
  if (!Object.keys(byBaseState).length && !risp) return null
  return {
    risp: risp ?? sum(RISP_STATES.map((base) => byBaseState[base])),
    nonRisp: sum([byBaseState.Empty, byBaseState['1st']]),
    byBaseState, byPitcherHand: {}, byCount: {},
  }
}

type PageFetcher = (path: string) => Promise<Response>
const caches = new Map<PageFetcher, Map<string, Promise<unknown>>>()
function cached<T>(fetchPage: PageFetcher, key: string, load: () => Promise<T>): Promise<T> {
  let cache = caches.get(fetchPage)
  if (!cache) { cache = new Map(); caches.set(fetchPage, cache) }
  const existing = cache.get(key)
  if (existing) return existing as Promise<T>
  const promise = load().catch((error) => { cache.delete(key); throw error })
  cache.set(key, promise)
  return promise
}

async function readPage(fetchPage: PageFetcher, path: string): Promise<string> {
  const response = await fetchPage(path)
  if (!response.ok) throw new Error(`nf3 成績の取得に失敗しました (${response.status})`)
  return response.text()
}

export async function fetchNf3BatterStats(
  playerName: string, teamName: string, fetchPage: PageFetcher = fetchNf3Page,
): Promise<BatterSituationalStats | null> {
  const name = normalizePlayerLookupName(playerName)
  const teamKey = normalizeLookupText(teamName)
  const teams = TEAMS.filter((team) => team.names.some((alias) => teamKey.includes(normalizeLookupText(alias))))
  if (!name || teams.length !== 1) return null
  const team = teams[0]!
  const indexPath = `/php/stat_disp/stat_disp.php?y=0&leg=${team.league === 'Central' ? 0 : 1}&tm=${team.code}&fp=0&dn=1&dk=0`
  const players = await cached(fetchPage, indexPath, async () => {
    const html = await readPage(fetchPage, indexPath)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = new Map<string, Set<string>>()
    for (const anchor of doc.querySelectorAll('a[href]')) {
      let url: URL
      try { url = new URL(anchor.getAttribute('href')!, NF3_ORIGIN + '/') } catch { continue }
      if (url.origin !== NF3_ORIGIN || !new RegExp(`^/${team.league}/${team.code}/f/\\d+_stat\\.htm$`).test(url.pathname)) continue
      const playerKey = normalizePlayerLookupName(anchor.textContent ?? '')
      if (!playerKey) continue
      const paths = result.get(playerKey) ?? new Set<string>()
      paths.add(url.pathname)
      result.set(playerKey, paths)
    }
    if (!result.size) throw new Error('nf3 の打者一覧を読み取れませんでした')
    return result
  })
  const paths = players.get(name)
  if (!paths || paths.size !== 1) return null
  const path = [...paths][0]!
  return cached(fetchPage, path, async () => {
    const stats = parseNf3BatterStats(await readPage(fetchPage, path))
    if (!stats) throw new Error('nf3 の走者別成績を読み取れませんでした')
    return stats
  })
}

export function clearNf3Cache(): void { caches.clear() }
