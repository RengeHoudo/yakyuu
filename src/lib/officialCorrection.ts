import type { BatterGameStats, BoxScoreData, GameState, PlateAppearanceRecord } from '../types'
import { computeLiveBattingStats, defaultBatterGameStats, formatBatterStat, getBatterBaseState, getBatterCountSplit } from '../types'

const fields = Object.keys(defaultBatterGameStats) as (keyof BatterGameStats)[]
export const appearanceCount = (s: BatterGameStats) => s.gameAtBats + s.gameWalks + s.gameHitByPitch + s.gameSacFlies + s.gameSacBunts
const hits = (s: BatterGameStats) => s.gameSingles + s.gameDoubles + s.gameTriples + s.gameHomeRuns
const normalize = (s: string) => s.normalize('NFKC').replace(/\s/g, '')
const matches = (p: { name: string; npbDisplayName?: string }, name: string) =>
  normalize(p.npbDisplayName || p.name) === normalize(name) || normalize(p.name) === normalize(name) ||
  (!p.npbDisplayName && normalize(p.name.trim().split(/[\s　]+/)[0] ?? '') === normalize(name))

export function describeBatting(s: BatterGameStats): string {
  if (s.gameHomeRuns) return '本塁打'
  if (s.gameTriples) return '三塁打'
  if (s.gameDoubles) return '二塁打'
  if (s.gameSingles) return '単打'
  if (s.gameWalks) return '四球'
  if (s.gameHitByPitch) return '死球'
  if (s.gameSacFlies) return '犠飛'
  if (s.gameSacBunts) return '犠打'
  return '安打なし'
}

/** 打点の丸数字を塁打数と誤認しないよう、NFKC変換の前に除去する。 */
export function officialBatting(text: string): BatterGameStats | null {
  const t = normalize(text.replace(/[①-⑳]/g, ''))
  const stats = { ...defaultBatterGameStats }
  if (/四球|敬遠|故意四/.test(t)) stats.gameWalks = 1
  else if (/死球/.test(t)) stats.gameHitByPitch = 1
  else if (/犠飛/.test(t)) stats.gameSacFlies = 1
  else if (/犠打/.test(t)) stats.gameSacBunts = 1
  else if (/安|本|[23]|ゴ|飛|直|振|失|併|選|邪/.test(t)) {
    stats.gameAtBats = 1
    if (!/失|選/.test(t)) {
      if (/本/.test(t)) stats.gameHomeRuns = 1
      else if (/3/.test(t)) stats.gameTriples = 1
      else if (/2/.test(t)) stats.gameDoubles = 1
      else if (/安/.test(t)) stats.gameSingles = 1
    }
  } else return null
  return stats
}

export function recordAppearance(s: GameState, before: BatterGameStats, after: BatterGameStats): PlateAppearanceRecord[] {
  const team = s.currentHalf === 'top' ? 'away' : 'home'
  const p = s[`${team}Lineup`][s[`${team}BatterIndex`]]
  if (!p?.number) return s.plateAppearanceRecords ?? []
  const stats = { ...defaultBatterGameStats }
  for (const k of fields) stats[k] = after[k] - before[k]
  const defending = team === 'away' ? s.homeLineup : s.awayLineup
  return [...(s.plateAppearanceRecords ?? []), {
    id: crypto.randomUUID(), scoreUrl: s.scoreUrl, team, number: p.number, name: p.name, npbDisplayName: p.npbDisplayName,
    order: p.order, ordinal: appearanceCount(before), inning: s.currentInning,
    baseState: getBatterBaseState(s.runners), countSplit: getBatterCountSplit(s.count),
    pitcherHand: s.pitcher.throwHand ?? defending.find(p => p.number === s.pitcher.number)?.throwHand,
    original: { ...stats }, stats,
  }]
}

/** 掲載済みで一意に照合できる打席の差分のみを適用する。進塁・得点は再実行しない。 */
export function reconcileOfficial(s: GameState, data: BoxScoreData): Partial<GameState> {
  const next = structuredClone({
    batterGameStats: s.batterGameStats ?? {}, batterSituationalGameStats: s.batterSituationalGameStats ?? {},
    batterPitcherHandGameStats: s.batterPitcherHandGameStats ?? {}, batterCountGameStats: s.batterCountGameStats ?? {},
    pitcherGameStats: s.pitcherGameStats ?? {}, awayLineup: s.awayLineup, homeLineup: s.homeLineup,
    plateAppearanceRecords: s.plateAppearanceRecords ?? [], officialCorrections: s.officialCorrections ?? [],
    awayHits: s.awayHits, homeHits: s.homeHits,
  })
  const log = (text: string) => next.officialCorrections.push({ id: crypto.randomUUID(), timestamp: data.fetchedAt, text })
  for (const r of next.plateAppearanceRecords) {
    if (r.scoreUrl !== s.scoreUrl) continue
    const candidates = data[r.team].filter(p => p.order === r.order && matches(r, p.name))
    if (candidates.length !== 1) continue
    const official = candidates[0]!
    const identities = new Set([...next.plateAppearanceRecords.filter(p => p.team === r.team), ...s[`${r.team}Lineup`]]
      .filter(p => p.order === r.order && matches(p, official.name)).map(p => p.number))
    if (identities.size !== 1) continue
    const result = official.results[r.ordinal]
    if (!result || (official.resultInnings && official.resultInnings[r.ordinal] !== r.inning)) continue
    const stats = officialBatting(result.text)
    if (!stats) continue
    const key = `${r.team}-${r.number}`
    const current = next.batterGameStats[key]
    if (!current) continue
    const changed = fields.some(k => stats[k] !== r.stats[k])
    if (changed) {
      // 集計の直接編集により差分を安全に引けない場合は自動補正しない。
      if (fields.some(k => current[k] + stats[k] - r.stats[k] < 0)) continue
      for (const k of fields) current[k] += stats[k] - r.stats[k]
      const dh = hits(stats) - hits(r.stats)
      const da = stats.gameAtBats - r.stats.gameAtBats
      next[`${r.team}Hits`] = Math.max(0, next[`${r.team}Hits`] + dh)
      const splits = [
        [next.batterSituationalGameStats, r.baseState],
        [next.batterCountGameStats, r.countSplit],
        [next.batterPitcherHandGameStats, r.pitcherHand],
      ] as const
      for (const [map, split] of splits) {
        if (!split) continue
        const entries = (map[key] ?? {}) as Record<string, { atBats: number; hits: number }>
        const prev = entries[split] ?? { atBats: 0, hits: 0 }
        entries[split] = { atBats: Math.max(0, prev.atBats + da), hits: Math.max(0, prev.hits + dh) }
        map[key] = entries
      }
      log(`${r.name} 第${r.ordinal + 1}打席：${r.officialText ?? describeBatting(r.stats)} → ${result.text}`)
    }
    r.stats = stats
    r.officialText = result.text
  }
  for (const team of ['away', 'home'] as const) {
    for (const p of next[`${team}Lineup`]) {
      const stats = next.batterGameStats[`${team}-${p.number}`]
      if (stats) { Object.assign(p, stats); Object.assign(p, computeLiveBattingStats(p)) }
    }
    const attack = team === 'away' ? 'home' : 'away'
    const officialPA = data[attack].reduce((n, p) => n + p.results.length, 0)
    const localPA = Object.entries(next.batterGameStats).filter(([k]) => k.startsWith(`${attack}-`)).reduce((n, [, p]) => n + appearanceCount(p), 0)
    // 投手表は累計のみ。未掲載の打席がある間は値を巻き戻さない。
    if (officialPA === 0 || officialPA !== localPA) continue
    if (data.totals && data.totals[attack] !== s[`${attack}Total`]) continue
    if (next.plateAppearanceRecords.some(r => r.team === attack && (r.scoreUrl !== s.scoreUrl || !r.officialText))) continue
    const players = [...s[`${team}Lineup`], ...(s.pitcherHistory ?? []).filter(p => p.team === team)]
    if ((s.currentHalf === 'top' ? 'home' : 'away') === team) players.push({ ...s.pitcher, order: 0, position: '' })
    for (const p of data.pitchers?.[team] ?? []) {
      const numbers = [...new Set(players.filter(player => matches(player, p.name)).map(player => player.number).filter(Boolean))]
      if (numbers.length !== 1) continue
      const current = next.pitcherGameStats[`${team}-${numbers[0]}`]
      if (!current) continue
      const labels = { hitsAllowed: '被安打', walksAllowed: '四球', hitByPitchAllowed: '死球', earnedRunsAllowed: '自責点' } as const
      for (const k of Object.keys(labels) as (keyof typeof labels)[]) {
        if ((current[k] ?? 0) !== p[k]) log(`${p.name} ${labels[k]}：${current[k] ?? 0} → ${p[k]}`)
        current[k] = p[k]
      }
    }
  }
  const team = s.currentHalf === 'top' ? 'away' : 'home'
  const batter = next[`${team}Lineup`][s[`${team}BatterIndex`]]
  return { ...next, boxScoreData: data, ...(batter ? { batter: { ...s.batter, stat: formatBatterStat(batter, s.statDisplaySettings) } } : {}) }
}
