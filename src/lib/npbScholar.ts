import { computeLiveBattingStats } from '../types'
import type { LineupPlayer, Runners } from '../types'

const NPB_SCHOLAR_BASE_URL = 'https://npbscholar.com'
const PLAYER_INDEX_URL = `${NPB_SCHOLAR_BASE_URL}/data/players_index.json`
const NO_CACHE: RequestInit = { cache: 'no-store' }

export type NpbScholarBaseState =
  | 'Empty'
  | '1st'
  | '2nd'
  | '3rd'
  | '1st+2nd'
  | '1st+3rd'
  | '2nd+3rd'
  | 'Loaded'

export interface BatterAverageDetail {
  average: string
  atBats: number
  hits: number
}

export interface BatterSituationalStats {
  risp: BatterAverageDetail
  nonRisp: BatterAverageDetail
  byBaseState: Partial<Record<NpbScholarBaseState, BatterAverageDetail>>
}

interface NpbScholarIndexPlayer {
  slug?: string
  player_slug?: string
  player_type?: string
  player_name?: string
  name?: string
  batter_name?: string
  team_name?: string
}

interface NpbScholarBaseStateRow {
  Split?: string
  AVG?: string
  AB?: string | number
  H?: string | number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

let playerIndexPromise: Promise<NpbScholarIndexPlayer[]> | null = null
const batterStatsPromises = new Map<string, Promise<BatterSituationalStats | null>>()

function normalizeLookupText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s・.．]/g, '')
}

function toCount(value: string | number | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function formatAverage(hits: number, atBats: number): string {
  if (atBats <= 0) return '.000'
  const value = hits / atBats
  return value >= 1 ? value.toFixed(3) : value.toFixed(3).replace(/^0/, '')
}

function parseAverageRow(row: NpbScholarBaseStateRow | undefined): BatterAverageDetail {
  const atBats = toCount(row?.AB)
  const hits = toCount(row?.H)
  const sourceAverage = typeof row?.AVG === 'string' && row.AVG.trim() ? row.AVG.trim() : null
  return {
    average: sourceAverage ?? formatAverage(hits, atBats),
    atBats,
    hits,
  }
}

/** NPB Scholar の選手JSONから、オーバーレイで使う走者別打率だけを抽出する。 */
export function parseNpbScholarBatterStats(payload: unknown): BatterSituationalStats {
  const rows = (
    payload as {
      table_tabs?: { base_state?: { rows?: NpbScholarBaseStateRow[] } }
    }
  )?.table_tabs?.base_state?.rows ?? []

  const rowBySplit = new Map(rows.map((row) => [row.Split, row]))
  const empty = parseAverageRow(rowBySplit.get('Empty'))
  const first = parseAverageRow(rowBySplit.get('1st'))
  const nonRispAtBats = empty.atBats + first.atBats
  const nonRispHits = empty.hits + first.hits

  const baseStates: NpbScholarBaseState[] = [
    'Empty', '1st', '2nd', '3rd', '1st+2nd', '1st+3rd', '2nd+3rd', 'Loaded',
  ]
  const byBaseState: Partial<Record<NpbScholarBaseState, BatterAverageDetail>> = {}
  for (const split of baseStates) {
    const row = rowBySplit.get(split)
    if (row) byBaseState[split] = parseAverageRow(row)
  }

  return {
    risp: parseAverageRow(rowBySplit.get('RISP')),
    nonRisp: {
      average: formatAverage(nonRispHits, nonRispAtBats),
      atBats: nonRispAtBats,
      hits: nonRispHits,
    },
    byBaseState,
  }
}

/** 現在の塁状況を NPB Scholar の Split 名と日本語表示名へ変換する。 */
export function getBaseState(runners: Runners): { split: NpbScholarBaseState; label: string } {
  if (runners.first && runners.second && runners.third) return { split: 'Loaded', label: '満塁' }
  if (runners.first && runners.second) return { split: '1st+2nd', label: '1-2塁' }
  if (runners.first && runners.third) return { split: '1st+3rd', label: '1-3塁' }
  if (runners.second && runners.third) return { split: '2nd+3rd', label: '2-3塁' }
  if (runners.first) return { split: '1st', label: '1塁' }
  if (runners.second) return { split: '2nd', label: '2塁' }
  if (runners.third) return { split: '3rd', label: '3塁' }
  return { split: 'Empty', label: '走者なし' }
}

/** 既存ロジックと同じライブ打率に、その計算元の打数・安打数を付ける。 */
export function getLiveBatterAverage(player: LineupPlayer): BatterAverageDetail {
  const gameHits = (player.gameSingles ?? 0)
    + (player.gameDoubles ?? 0)
    + (player.gameTriples ?? 0)
    + (player.gameHomeRuns ?? 0)
  return {
    average: computeLiveBattingStats(player).battingAvg,
    atBats: toCount(player.atBats) + (player.gameAtBats ?? 0),
    hits: toCount(player.hits) + gameHits,
  }
}

async function fetchPlayerIndex(fetcher: FetchLike): Promise<NpbScholarIndexPlayer[]> {
  if (!playerIndexPromise) {
    playerIndexPromise = fetcher(PLAYER_INDEX_URL, NO_CACHE)
      .then(async (response) => {
        if (!response.ok) throw new Error(`NPB Scholar 選手一覧の取得に失敗しました (${response.status})`)
        const payload = await response.json() as { players?: NpbScholarIndexPlayer[] }
        return Array.isArray(payload.players) ? payload.players : []
      })
      .catch((error) => {
        playerIndexPromise = null
        throw error
      })
  }
  return playerIndexPromise
}

/** 選手名から現在シーズンのslugを解決し、走者別打率を取得する。 */
export async function fetchNpbScholarBatterStats(
  playerName: string,
  teamName = '',
  fetcher: FetchLike = fetch,
): Promise<BatterSituationalStats | null> {
  const normalizedName = normalizeLookupText(playerName)
  if (!normalizedName) return null
  const cacheKey = `${normalizedName}|${normalizeLookupText(teamName)}`
  const cached = batterStatsPromises.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    const players = await fetchPlayerIndex(fetcher)
    const candidates = players.filter((player) => {
      if (player.player_type && player.player_type !== 'batter') return false
      const candidateName = player.player_name ?? player.batter_name ?? player.name ?? ''
      return normalizeLookupText(candidateName) === normalizedName
    })
    if (candidates.length === 0) return null

    const normalizedTeam = normalizeLookupText(teamName)
    const player = candidates.find((candidate) => {
      if (!normalizedTeam) return false
      const candidateTeam = normalizeLookupText(candidate.team_name ?? '')
      if (!candidateTeam) return false
      return candidateTeam.includes(normalizedTeam) || normalizedTeam.includes(candidateTeam)
    }) ?? candidates[0]!
    const slug = player.slug ?? player.player_slug
    if (!slug) return null

    const response = await fetcher(
      `${NPB_SCHOLAR_BASE_URL}/data/players/${encodeURIComponent(slug)}.json`,
      NO_CACHE,
    )
    if (!response.ok) throw new Error(`NPB Scholar 選手成績の取得に失敗しました (${response.status})`)
    return parseNpbScholarBatterStats(await response.json())
  })().catch((error) => {
    batterStatsPromises.delete(cacheKey)
    throw error
  })

  batterStatsPromises.set(cacheKey, promise)
  return promise
}

/** テストと明示的な再取得用にメモリキャッシュを消去する。 */
export function clearNpbScholarCache(): void {
  playerIndexPromise = null
  batterStatsPromises.clear()
}
