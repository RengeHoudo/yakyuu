import { computeLiveBattingStats, getBatterBaseState } from '../types'
import type { BatterBaseState, BatterCountGameStats, BatterCountSplit, BatterPitcherHand, BatterPitcherHandGameStats, BatterSituationalGameStats, LineupPlayer, Runners } from '../types'
import { clearScholarDataCache, fetchScholarManifest, fetchScholarRows, type ScholarFetch, type ScholarRow } from './scholarData'
import { normalizeLookupText, normalizePlayerLookupName } from './playerLookup'

export type NpbScholarBaseState = BatterBaseState

export interface BatterAverageDetail {
  average: string
  atBats: number
  hits: number
}

export interface BatterSituationalStats {
  risp?: BatterAverageDetail
  nonRisp?: BatterAverageDetail
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

interface NpbScholarBaseStateRow {
  Group?: string
  Split?: string
  AVG?: string
  AB?: string | number
  H?: string | number
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
    // 走者別成績そのものが未配信なら、当日の記録だけをシーズン値として表示しない。
    if (seasonLine || (gameLine && (season.risp || season.nonRisp))) {
      byBaseState[split] = addGameLine(seasonLine, gameLine)
    }
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
    risp: season.risp ? addGameLine(season.risp, rispGame) : undefined,
    nonRisp: season.nonRisp ? addGameLine(season.nonRisp, nonRispGame) : undefined,
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

/** 移転後の公開成績から最新NPBシーズンの左右別打率を取得する。 */
export async function fetchNpbScholarBatterStats(
  playerName: string,
  teamName = '',
  fetcher: ScholarFetch = fetch,
): Promise<BatterSituationalStats | null> {
  const data = await fetchPlayerRows(playerName, teamName, 'batting', fetcher)
  if (!data) return null
  return { byBaseState: {}, byPitcherHand: parseHandRows(data.hands), byCount: {} }
}

/** 選手名と所属チームから現在シーズンの投手成績を取得する。 */
export async function fetchNpbScholarPitcherStats(
  playerName: string,
  teamName = '',
  fetcher: ScholarFetch = fetch,
): Promise<PitcherSeasonStats | null> {
  const data = await fetchPlayerRows(playerName, teamName, 'pitching', fetcher)
  if (!data) return null
  // 左右不明(U)も総計に含める。欠損した項目を0と見なさない。
  const total: ScholarRow = {}
  for (const field of ['AB', 'H', 'BB', 'HBP', 'SF']) {
    const values = data.hands.map((row) => optionalNumber(row[field]))
    if (values.length && values.every((value) => value !== null)) {
      total[field] = values.reduce<number>((sum, value) => sum + value!, 0)
    }
  }
  const stats = parseNpbScholarPitcherStats({
    snapshot: { era: data.annual.ERA, whip: data.annual.WHIP },
    pitcher_batted_summary: total,
  })!
  return {
    ...stats,
    byBatterHand: parseHandRows(data.hands),
    walks: optionalNumber(data.annual.BB_allowed) ?? stats.walks,
    hitByPitch: optionalNumber(data.annual.HBP_allowed) ?? stats.hitByPitch,
  }
}

function parseHandRows(rows: ScholarRow[]): Partial<Record<'R' | 'L', BatterAverageDetail>> {
  const result: Partial<Record<'R' | 'L', BatterAverageDetail>> = {}
  for (const hand of ['R', 'L'] as const) {
    const detail = parsePitcherAverage(rows.find((row) => row.opponent_hand === hand))
    if (detail) result[hand] = detail
  }
  return result
}

async function fetchPlayerRows(
  playerName: string,
  teamName: string,
  domain: 'batting' | 'pitching',
  fetcher: ScholarFetch,
): Promise<{ annual: ScholarRow; hands: ScholarRow[] } | null> {
  const normalizedName = normalizePlayerLookupName(playerName)
  if (!normalizedName) return null
  const manifest = await fetchScholarManifest(fetcher)
  const descriptors = manifest.datasets.filter((item) =>
    item.sport_id === 101 && item.domain === domain && item.stats_scope_kind === 'level_total')
  const year = Math.max(...descriptors.map((item) => item.season))
  const descriptor = descriptors.find((item) => item.season === year)
  if (!descriptor) return null
  const rows = await fetchScholarRows(fetcher, descriptor)
  const candidates = rows.filter((row) => row.domain === domain && row.sport_id === 101
    && row.season === year && normalizePlayerLookupName(String(row.name ?? '')) === normalizedName)
  const normalizedTeam = normalizeLookupText(teamName)
  const matchingTeam = candidates.filter((row) => {
    const team = normalizeLookupText(String(row.team ?? ''))
    return normalizedTeam && team && (team.includes(normalizedTeam) || normalizedTeam.includes(team))
  })
  const matches = matchingTeam.length ? matchingTeam : candidates
  if (matches.length !== 1) return null
  const annual = matches[0]!
  const handsDescriptor = manifest.details.find((item) => item.sport_id === 101
    && item.domain === domain && item.season === year && item.kind === 'hand_splits')
  const hands = handsDescriptor ? (await fetchScholarRows(fetcher, handsDescriptor)).filter((row) =>
    row.player_id === annual.player_id && row.domain === domain && row.season === year && row.sport_id === 101) : []
  return { annual, hands }
}

/** テストと明示的な再取得用にメモリキャッシュを消去する。 */
export function clearNpbScholarCache(): void {
  clearScholarDataCache()
}
