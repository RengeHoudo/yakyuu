import { computeLiveBattingStats, getBatterBaseState } from '../types'
import type { BatterBaseState, BatterCountGameStats, BatterCountSplit, BatterPitcherHand, BatterPitcherHandGameStats, BatterSituationalGameStats, LineupPlayer, Runners } from '../types'

const NPB_SCHOLAR_BASE_URL = 'https://npbscholar.com'
const PLAYER_INDEX_URL = `${NPB_SCHOLAR_BASE_URL}/data/players_index.json`
const NO_CACHE: RequestInit = { cache: 'no-store' }

export type NpbScholarBaseState = BatterBaseState

export interface BatterAverageDetail {
  average: string
  atBats: number
  hits: number
}

export interface BatterSituationalStats {
  risp: BatterAverageDetail
  nonRisp: BatterAverageDetail
  byBaseState: Partial<Record<NpbScholarBaseState, BatterAverageDetail>>
  byPitcherHand: Partial<Record<BatterPitcherHand, BatterAverageDetail>>
  byCount: Partial<Record<BatterCountSplit, BatterAverageDetail>>
}

export interface PitcherSeasonStats {
  era: string | null
  whip: string | null
  average?: BatterAverageDetail
  byBatterHand: Partial<Record<'L' | 'R', BatterAverageDetail>>
  onBasePct: string | null
  walks: number | null
  hitByPitch: number | null
}

interface NpbScholarIndexPlayer {
  slug?: string
  player_slug?: string
  player_type?: string
  player_name?: string
  name?: string
  batter_name?: string
  pitcher_name?: string
  team_name?: string
}

interface NpbScholarBaseStateRow {
  Group?: string
  Split?: string
  AVG?: string
  AB?: string | number
  H?: string | number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

let playerIndexPromise: Promise<NpbScholarIndexPlayer[]> | null = null
const batterStatsPromises = new Map<string, Promise<BatterSituationalStats | null>>()
const pitcherStatsPromises = new Map<string, Promise<PitcherSeasonStats | null>>()

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

function addGameLine(
  season: BatterAverageDetail | undefined,
  game: { atBats: number; hits: number } | undefined,
): BatterAverageDetail {
  const atBats = (season?.atBats ?? 0) + (game?.atBats ?? 0)
  const hits = (season?.hits ?? 0) + (game?.hits ?? 0)
  return { average: formatAverage(hits, atBats), atBats, hits }
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
      table_tabs?: {
        base_state?: { rows?: NpbScholarBaseStateRow[] }
        vs_hand?: { rows?: NpbScholarBaseStateRow[] }
        count?: { rows?: NpbScholarBaseStateRow[] }
      }
    }
  )?.table_tabs?.base_state?.rows ?? []

  const tableTabs = (payload as {
    table_tabs?: {
      vs_hand?: { rows?: NpbScholarBaseStateRow[] }
      count?: { rows?: NpbScholarBaseStateRow[] }
    }
  })?.table_tabs

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

  const handRows = tableTabs?.vs_hand?.rows ?? []
  const byPitcherHand: Partial<Record<BatterPitcherHand, BatterAverageDetail>> = {}
  const right = handRows.find((row) => row.Group === '対左右' && row.Split === '対右投手')
  const left = handRows.find((row) => row.Group === '対左右' && row.Split === '対左投手')
  if (right) byPitcherHand.R = parseAverageRow(right)
  if (left) byPitcherHand.L = parseAverageRow(left)

  const byCount: Partial<Record<BatterCountSplit, BatterAverageDetail>> = {}
  for (const row of tableTabs?.count?.rows ?? []) {
    if (row.Group !== 'Count' || !row.Split || !/^[0-3]-[0-2]$/.test(row.Split)) continue
    byCount[row.Split as BatterCountSplit] = parseAverageRow(row)
  }

  return {
    risp: parseAverageRow(rowBySplit.get('RISP')),
    nonRisp: {
      average: formatAverage(nonRispHits, nonRispAtBats),
      atBats: nonRispAtBats,
      hits: nonRispHits,
    },
    byBaseState,
    byPitcherHand,
    byCount,
  }
}

/** 投手JSONの欠損値は0と区別する。 */
function optionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

type PitcherStatRow = Record<string, unknown>

function parsePitcherAverage(row: PitcherStatRow | undefined): BatterAverageDetail | undefined {
  const atBats = optionalNumber(row?.AB)
  const hits = optionalNumber(row?.H)
  if (atBats === null || hits === null) return undefined
  const average = optionalNumber(row?.BA)
  return {
    average: average === null ? formatAverage(hits, atBats) : average.toFixed(3).replace(/^0/, ''),
    atBats,
    hits,
  }
}

/** NPB Scholarの投手シーズン成績と「Group: 対左右」を抽出する。 */
export function parseNpbScholarPitcherStats(payload: unknown): PitcherSeasonStats | null {
  const data = payload as {
    snapshot?: { era?: unknown; whip?: unknown }
    pitcher_batted_summary?: PitcherStatRow
    table_tabs?: { vs_hand?: { rows?: PitcherStatRow[] } }
  } | null
  const summary = data?.pitcher_batted_summary
  const handRows = data?.table_tabs?.vs_hand?.rows
  if (!data?.snapshot && !summary && !Array.isArray(handRows)) return null

  const byBatterHand: PitcherSeasonStats['byBatterHand'] = {}
  for (const [hand, split] of [['R', '対右打者'], ['L', '対左打者']] as const) {
    const row = Array.isArray(handRows)
      ? handRows.find((row) => row.Group === '対左右' && row.Split === split)
      : undefined
    const detail = parsePitcherAverage(row)
    if (detail) byBatterHand[hand] = detail
  }

  const average = parsePitcherAverage(summary)
  const walks = optionalNumber(summary?.BB)
  const hitByPitch = optionalNumber(summary?.HBP)
  const sacrificeFlies = optionalNumber(summary?.SF)
  const sourceObp = optionalNumber(summary?.OBP)
  let onBasePct = sourceObp === null ? null : sourceObp.toFixed(3).replace(/^0/, '')
  if (onBasePct === null && average && walks !== null && hitByPitch !== null && sacrificeFlies !== null) {
    onBasePct = formatAverage(average.hits + walks + hitByPitch, average.atBats + walks + hitByPitch + sacrificeFlies)
  }

  return {
    era: optionalNumber(data?.snapshot?.era)?.toFixed(2) ?? null,
    whip: optionalNumber(data?.snapshot?.whip)?.toFixed(2) ?? null,
    average,
    byBatterHand,
    onBasePct,
    walks,
    hitByPitch,
  }
}

/** 現在の塁状況を NPB Scholar の Split 名と日本語表示名へ変換する。 */
export function getBaseState(runners: Runners): { split: NpbScholarBaseState; label: string } {
  const split = getBatterBaseState(runners)
  const labels: Record<NpbScholarBaseState, string> = {
    Empty: '走者なし',
    '1st': '1塁',
    '2nd': '2塁',
    '3rd': '3塁',
    '1st+2nd': '1-2塁',
    '1st+3rd': '1-3塁',
    '2nd+3rd': '2-3塁',
    Loaded: '満塁',
  }
  return { split, label: labels[split] }
}

/** NPB Scholarのシーズン値へ、この試合で記録した走者状況別の打数・安打数を加える。 */
export function mergeBatterSituationalStats(
  season: BatterSituationalStats,
  game: BatterSituationalGameStats | undefined,
  pitcherHandGame?: BatterPitcherHandGameStats,
  countGame?: BatterCountGameStats,
): BatterSituationalStats {
  if (!game && !pitcherHandGame && !countGame) return season

  const baseStates: NpbScholarBaseState[] = [
    'Empty', '1st', '2nd', '3rd', '1st+2nd', '1st+3rd', '2nd+3rd', 'Loaded',
  ]
  const byBaseState: Partial<Record<NpbScholarBaseState, BatterAverageDetail>> = {}
  for (const split of baseStates) {
    const seasonLine = season.byBaseState[split]
    const gameLine = game?.[split]
    if (seasonLine || gameLine) byBaseState[split] = addGameLine(seasonLine, gameLine)
  }

  const nonRispGame = ['Empty', '1st'].reduce(
    (total, split) => ({
      atBats: total.atBats + (game?.[split as NpbScholarBaseState]?.atBats ?? 0),
      hits: total.hits + (game?.[split as NpbScholarBaseState]?.hits ?? 0),
    }),
    { atBats: 0, hits: 0 },
  )
  const rispGame = ['2nd', '3rd', '1st+2nd', '1st+3rd', '2nd+3rd', 'Loaded'].reduce(
    (total, split) => ({
      atBats: total.atBats + (game?.[split as NpbScholarBaseState]?.atBats ?? 0),
      hits: total.hits + (game?.[split as NpbScholarBaseState]?.hits ?? 0),
    }),
    { atBats: 0, hits: 0 },
  )

  const byPitcherHand: Partial<Record<BatterPitcherHand, BatterAverageDetail>> = {}
  for (const hand of ['R', 'L'] as const) {
    const seasonLine = season.byPitcherHand[hand]
    const gameLine = pitcherHandGame?.[hand]
    if (seasonLine || gameLine) byPitcherHand[hand] = addGameLine(seasonLine, gameLine)
  }

  const byCount: Partial<Record<BatterCountSplit, BatterAverageDetail>> = { ...season.byCount }
  for (const [split, gameLine] of Object.entries(countGame ?? {})) {
    const countSplit = split as BatterCountSplit
    byCount[countSplit] = addGameLine(season.byCount[countSplit], gameLine)
  }

  return {
    risp: addGameLine(season.risp, rispGame),
    nonRisp: addGameLine(season.nonRisp, nonRispGame),
    byBaseState,
    byPitcherHand,
    byCount,
  }
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
  return fetchNpbScholarPlayerStats(playerName, teamName, 'batter', batterStatsPromises, parseNpbScholarBatterStats, fetcher)
}

/** 選手名と所属チームから現在シーズンの投手成績を取得する。 */
export async function fetchNpbScholarPitcherStats(
  playerName: string,
  teamName = '',
  fetcher: FetchLike = fetch,
): Promise<PitcherSeasonStats | null> {
  return fetchNpbScholarPlayerStats(playerName, teamName, 'pitcher', pitcherStatsPromises, parseNpbScholarPitcherStats, fetcher)
}

async function fetchNpbScholarPlayerStats<T>(
  playerName: string,
  teamName: string,
  playerType: 'batter' | 'pitcher',
  cache: Map<string, Promise<T | null>>,
  parse: (payload: unknown) => T | null,
  fetcher: FetchLike,
): Promise<T | null> {
  const normalizedName = normalizeLookupText(playerName)
  if (!normalizedName) return null
  const cacheKey = `${normalizedName}|${normalizeLookupText(teamName)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    const players = await fetchPlayerIndex(fetcher)
    const candidates = players.filter((player) => {
      const type = player.player_type ?? (player.pitcher_name ? 'pitcher' : 'batter')
      if (type !== playerType) return false
      const candidateName = player.player_name ?? player.pitcher_name ?? player.batter_name ?? player.name ?? ''
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
    return parse(await response.json())
  })().catch((error) => {
    cache.delete(cacheKey)
    throw error
  })

  cache.set(cacheKey, promise)
  return promise
}

/** テストと明示的な再取得用にメモリキャッシュを消去する。 */
export function clearNpbScholarCache(): void {
  playerIndexPromise = null
  batterStatsPromises.clear()
  pitcherStatsPromises.clear()
}
