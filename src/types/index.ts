export type HalfInning = 'top' | 'bottom'

export type Position = '投' | '捕' | '一' | '二' | '三' | '遊' | '左' | '中' | '右' | 'DH' | '代' | ''

/** 全選手名簿 CSV の守備位置カテゴリ */
export type PositionCategory = '投手' | '捕手' | '内野手' | '外野手'

/** 全選手名簿の1選手エントリ */
export interface RosterPlayer {
  number: string
  name: string
  positionCategory: PositionCategory
  // 基本表示用
  battingAvg?: string   // 打率
  homeRuns?: string     // 本塁打
  rbi?: string          // 打点
  ops?: string          // OPS
  // 詳細打撃成績
  games?: string            // 試合
  plateAppearances?: string // 打席
  atBats?: string           // 打数
  runs?: string             // 得点
  hits?: string             // 安打
  doubles?: string          // 二塁打
  triples?: string          // 三塁打
  totalBases?: string       // 塁打
  stolenBases?: string      // 盗塁
  caughtStealing?: string   // 盗塁刺
  sacrificeHits?: string    // 犠打
  sacrificeFlies?: string   // 犠飛
  walks?: string            // 四球
  intentionalWalks?: string // 故意四球
  hitByPitch?: string       // 死球
  strikeouts?: string       // 三振
  groundedIntoDoublePlays?: string // 併殺打
  sluggingPct?: string      // 長打率
  onBasePct?: string        // 出塁率
  // 投手用
  appearances?: string  // 投手: 登板数
  record?: string       // 投手: 勝敗（後方互換）
  wins?: string
  losses?: string
  saves?: string
  holds?: string
  holdPoints?: string
  completeGames?: string
  shutouts?: string
  noWalkGames?: string
  winPct?: string
  battersFaced?: string
  inningsPitched?: string
  hitsAllowed?: string
  homeRunsAllowed?: string
  walksAllowed?: string
  intentionalWalksAllowed?: string
  hitByPitchAllowed?: string
  strikeoutsThrown?: string
  wildPitches?: string
  balks?: string
  runsAllowed?: string
  earnedRuns?: string
  era?: string
  whip?: string
}

export interface Count {
  balls: number
  strikes: number
  outs: number
}

export interface Runners {
  first: boolean
  second: boolean
  third: boolean
}

/** 各塁に出塁している打順インデックス（0-8）。null = 誰もいない */
export interface RunnerIndices {
  first: number | null
  second: number | null
  third: number | null
}

/** 各塁の走者を出塁させた責任投手キー。キー形式: "${team}-${number}"。null = 誰もいない */
export interface RunnerResponsiblePitcher {
  first: string | null
  second: string | null
  third: string | null
}

export interface PlayerInfo {
  name: string
  number: string
  stat: string
  statLabel: string
}

export interface LineupPlayer {
  order: number
  name: string
  number: string
  position: Position
  // 打者用（1-9番）基本表示用
  battingAvg?: string   // 打率
  homeRuns?: string     // 本塁打数
  rbi?: string          // 打点
  ops?: string          // OPS
  // 打者用 詳細成績
  games?: string
  plateAppearances?: string
  atBats?: string
  runs?: string
  hits?: string
  doubles?: string
  triples?: string
  totalBases?: string
  stolenBases?: string
  caughtStealing?: string
  sacrificeHits?: string
  sacrificeFlies?: string
  walks?: string
  intentionalWalks?: string
  hitByPitch?: string
  strikeouts?: string
  groundedIntoDoublePlays?: string
  sluggingPct?: string
  onBasePct?: string
  // 打者用 試合内成績（全部0スタートで手動編集可能）
  gameAtBats?: number       // 打数
  gameWalks?: number        // 四球
  gameHitByPitch?: number   // 死球
  gameSacFlies?: number     // 犠飛
  gameSacBunts?: number     // 犠打
  gameSingles?: number      // 単打
  gameDoubles?: number      // 二塁打
  gameTriples?: number      // 三塁打
  gameHomeRuns?: number     // 本塁打
  // 投手用（10番目）
  appearances?: string  // 登板数
  record?: string       // 勝敗（後方互換）
  wins?: string
  losses?: string
  saves?: string
  holds?: string
  holdPoints?: string
  completeGames?: string
  shutouts?: string
  noWalkGames?: string
  winPct?: string
  battersFaced?: string
  inningsPitched?: string
  hitsAllowed?: string
  homeRunsAllowed?: string
  walksAllowed?: string
  intentionalWalksAllowed?: string
  hitByPitchAllowed?: string
  strikeoutsThrown?: string
  wildPitches?: string
  balks?: string
  runsAllowed?: string
  earnedRuns?: string
  era?: string
  whip?: string
}

export interface InningScore {
  inning: number
  top: number | null
  bottom: number | null
}

export interface PlayLogEntry {
  id: string
  timestamp: number
  inning: number
  half: HalfInning
  text: string
}

/** 打者の試合中成績トラッキング用。キー形式: "${team}-${number}" で GameState.batterGameStats に格納 */
export interface BatterGameStats {
  gameAtBats: number
  gameWalks: number
  gameHitByPitch: number
  gameSacFlies: number
  gameSacBunts: number
  gameSingles: number
  gameDoubles: number
  gameTriples: number
  gameHomeRuns: number
}

export const defaultBatterGameStats: BatterGameStats = {
  gameAtBats: 0,
  gameWalks: 0,
  gameHitByPitch: 0,
  gameSacFlies: 0,
  gameSacBunts: 0,
  gameSingles: 0,
  gameDoubles: 0,
  gameTriples: 0,
  gameHomeRuns: 0,
}

/** 投手の試合中成績トラッキング用 */
export interface PitcherGameStats {
  hitsAllowed: number
  walksAllowed: number
  runsAllowed: number
  earnedRunsAllowed: number
  outsRecorded: number
  /** 投球数（試合内成績として手動編集可能） */
  pitchCount?: number
}

export const defaultPitcherGameStats: PitcherGameStats = {
  hitsAllowed: 0,
  walksAllowed: 0,
  runsAllowed: 0,
  earnedRunsAllowed: 0,
  outsRecorded: 0,
  pitchCount: 0,
}

/** 投手の登板履歴エントリ */
export interface PitcherAppearance {
  name: string
  number: string
  team: 'away' | 'home'
  /** 0 = 先発, 1 = 中継ぎ1番手, 2 = 中継ぎ2番手, ... */
  order: number
  /** true = 現在登板中 */
  isActive: boolean
}

export type MascotMode = 'idle' | 'hidden' | 'celebration' | 'waiting'

export type EffectType = 'homerun' | 'strikeout' | 'double' | 'triple' | 'hit' | 'steal' | 'fineplay' | 'error' | 'walk' | 'change' | null

export interface Team {
  name: string
  shortName: string
  color: string
}

export interface OverlayPosition {
  x: number
  y: number
}

export interface GameState {
  awayTeam: Team
  homeTeam: Team
  currentInning: number
  currentHalf: HalfInning
  isGameOver: boolean
  innings: InningScore[]
  awayTotal: number
  homeTotal: number
  awayHits: number
  homeHits: number
  awayErrors: number
  homeErrors: number
  count: Count
  runners: Runners
  batter: PlayerInfo
  pitcher: PlayerInfo
  awayLineup: LineupPlayer[]
  homeLineup: LineupPlayer[]
  awayBatterIndex: number
  homeBatterIndex: number
  playLog: PlayLogEntry[]
  pitchCount: number
  gameStartTime: number | null
  ticker: string
  activeEffect: EffectType
  effectTimestamp: number
  showMascot: boolean
  mascotMode: MascotMode
  mascotImages: Record<string, string>
  autoChangeEffect: boolean
  showWaitingScreen: boolean
  overlayPositions: Record<string, OverlayPosition>
  overlayScale: number
  /** コントロールパネルで選択中のチーム。オーバーレイの打順表示に連動する */
  lineupDisplayTeam: 'away' | 'home'
  /** 投手ごとの累計投球数。キー形式: "${team}-${number}" (例: "home-18") */
  pitcherStats: Record<string, number>
  /** 投手ごとの試合中成績。キー形式: "${team}-${number}" */
  pitcherGameStats: Record<string, PitcherGameStats>
  /** 各塁に出塁している攻撃チーム打順インデックス */
  runnerIndices: RunnerIndices
  /** 各塁の走者を出塁させた責任投手キー */
  runnerResponsiblePitcher: RunnerResponsiblePitcher
  /** 直前にプレーした打者の打順インデックス（打点帰属用）。null = 帰属先なし */
  lastBatterIndex: number | null
  /** オーバーレイへのスタッツ表示設定 */
  statDisplaySettings: StatDisplaySettings
  /** NPBスコアページURL */
  scoreUrl: string
  /** 投手の登板履歴。試合中に登板した全投手を記録する */
  pitcherHistory: PitcherAppearance[]
  /** 打者ごとの試合中成績。キー形式: "${team}-${number}" (例: "away-3") */
  batterGameStats: Record<string, BatterGameStats>
}

/**
 * 選手名から表示用の短縮名を抽出する。
 * - "秋山 翔吾" → "秋山"  (苗字のみ)
 * - "S.サンタナ" → "サンタナ" (カタカナ部分のみ)
 * - "マクブルーム" → "マクブルーム" (そのまま)
 */
export function extractDisplayName(name: string): string {
  if (!name) return ''
  // "A.カタカナ" スタイル: アルファベット + ドット + カタカナ
  const alphaKatakanaMatch = name.match(/^[A-Za-z]+\.([\u30A1-\u30FE]+)$/)
  if (alphaKatakanaMatch) return alphaKatakanaMatch[1]!
  // 日本語氏名 (スペース区切り): 苗字部分のみ
  if (name.includes(' ')) return name.split(' ')[0]!
  // ニックネームなど: そのまま
  return name
}

/**
 * チーム内の同姓選手の有無に応じて表示名を決定する。
 * - 同姓なし: 姓のみ
 * - 同姓あり: 姓+名先頭1文字
 * - 姓+名先頭1文字も同じ選手あり: 姓+名先頭2文字
 * - 外国人 "A.カタカナ" スタイル: カタカナ部分のみ
 * - スペースなし: そのまま
 * @param name 対象選手のフルネーム（例: "山本 祐大"）
 * @param teamNames チーム全員のフルネーム配列
 */
export function getDisplayNameInContext(name: string, teamNames: string[]): string {
  if (!name) return ''
  // "A.カタカナ" スタイル
  const alphaKatakanaMatch = name.match(/^[A-Za-z]+\.([\u30A1-\u30FE]+)$/)
  if (alphaKatakanaMatch) return alphaKatakanaMatch[1]!
  // スペースなし → そのまま
  if (!name.includes(' ')) return name

  const [lastName, ...firstParts] = name.split(' ')
  const firstName = firstParts.join(' ')

  // 自分以外で同姓の選手を探す
  const sameLastName = teamNames.filter((n) => {
    if (n === name) return false
    return n.split(' ')[0] === lastName
  })

  if (sameLastName.length === 0) return lastName!

  // 同姓あり → 姓+名先頭1文字
  const display1 = lastName! + firstName.charAt(0)

  // 姓+名先頭1文字も同じ選手がいるか確認
  const sameDisplay1 = teamNames.filter((n) => {
    if (n === name) return false
    const parts = n.split(' ')
    const ln = parts[0]!
    const fn = parts.slice(1).join(' ')
    return ln + fn.charAt(0) === display1
  })

  if (sameDisplay1.length === 0) return display1

  // 姓+名先頭2文字
  return lastName! + firstName.slice(0, 2)
}

export const initialPlayerInfo: PlayerInfo = {
  name: '',
  number: '',
  stat: '',
  statLabel: '',
}

function emptyLineup(): LineupPlayer[] {
  return Array.from({ length: 10 }, (_, i) => ({
    order: i + 1,
    name: '',
    number: '',
    position: (i === 9 ? '投' : '') as Position,
  }))
}

/** オーバーレイへの打者・投手スタッツ表示設定 */
export interface StatDisplaySettings {
  // 打者用（既存）
  showBattingAvg: boolean
  showHomeRuns: boolean
  showRbi: boolean
  showOps: boolean
  // 投手用（既存）
  showAppearances: boolean
  showRecord: boolean
  // 投手用（新規）
  showSaves: boolean
  showHolds: boolean
  showEra: boolean
  showWhip: boolean
}

export const defaultStatDisplaySettings: StatDisplaySettings = {
  showBattingAvg: true,
  showHomeRuns: false,
  showRbi: false,
  showOps: true,
  showAppearances: false,
  showRecord: false,
  showSaves: false,
  showHolds: false,
  showEra: true,
  showWhip: true,
}

/**
 * 投球回文字列を数値に変換する。
 * NPBの投球回は "142.1" 形式 (.1=1/3アウト, .2=2/3アウト)。
 * @example parseInningsPitched("142.1") // => 142.333...
 */
export function parseInningsPitched(ip: string): number {
  const parts = ip.split('.')
  const full = parseInt(parts[0] ?? '0', 10)
  const frac = parseInt(parts[1] ?? '0', 10) // 0, 1, 2 (= 0/3, 1/3, 2/3)
  return full + frac / 3
}

/**
 * 投手のシーズン勝敗成績文字列を生成。 0の項目は省略。全て0なら空文字。
 * @example formatPitcherRecord({ wins: '2', losses: '1', holds: '40', saves: '20' }) // => "2W/1L/40H/20S"
 */
export function formatPitcherRecord(player: {
  wins?: string
  losses?: string
  holds?: string
  saves?: string
}): string {
  const parts: string[] = []
  const w = Number(player.wins) || 0
  const l = Number(player.losses) || 0
  const h = Number(player.holds) || 0
  const s = Number(player.saves) || 0
  if (w > 0) parts.push(`${w}W`)
  if (l > 0) parts.push(`${l}L`)
  if (h > 0) parts.push(`${h}H`)
  if (s > 0) parts.push(`${s}S`)
  return parts.join('/')
}

// ─────────────────────────────────────────────
// ライブ成績計算ユーティリティ（通算 + 試合内合算）
// ─────────────────────────────────────────────

function _numVal(v: string | undefined | number): number {
  return Number(v) || 0
}

function _fmtRate(val: number): string {
  if (isNaN(val) || !isFinite(val)) return '.000'
  if (val >= 1) return val.toFixed(3)
  return val.toFixed(3).replace(/^0/, '')
}

/**
 * シーズン通算成績＋試合内成績（game*フィールド）を合算して
 * 打率・出塁率・長打率・OPS を再計算する。
 *
 * - 試合内成績が全て 0/undefined の場合はシーズン成績のみで計算
 * - atBats 等の詳細フィールドがない場合は試合成績のみで計算
 * - どちらも 0 の場合は元の battingAvg を保持（'.000' にしない）
 */
export function computeLiveBattingStats(player: LineupPlayer): {
  battingAvg: string
  onBasePct: string
  sluggingPct: string
  ops: string
} {
  const seasonAB  = _numVal(player.atBats)
  const seasonH   = _numVal(player.hits)
  const seasonBB  = _numVal(player.walks)
  const seasonHBP = _numVal(player.hitByPitch)
  const seasonSF  = _numVal(player.sacrificeFlies)
  const seasonTB  = _numVal(player.totalBases)

  const gameSingles = player.gameSingles ?? 0
  const gameDoubles = player.gameDoubles ?? 0
  const gameTriples = player.gameTriples ?? 0
  const gameHR      = player.gameHomeRuns ?? 0
  const gameHits    = gameSingles + gameDoubles + gameTriples + gameHR
  const gameTB      = gameSingles + gameDoubles * 2 + gameTriples * 3 + gameHR * 4

  const totalAB  = seasonAB  + (player.gameAtBats    ?? 0)
  const totalH   = seasonH   + gameHits
  const totalBB  = seasonBB  + (player.gameWalks     ?? 0)
  const totalHBP = seasonHBP + (player.gameHitByPitch ?? 0)
  const totalSF  = seasonSF  + (player.gameSacFlies  ?? 0)
  const totalTB  = seasonTB  + gameTB

  // 打数が 0 のときは元の battingAvg を保持（未登録選手などへの配慮）
  const battingAvg = totalAB > 0
    ? _fmtRate(totalH / totalAB)
    : (player.battingAvg ?? '.000')

  const obpDenom = totalAB + totalBB + totalHBP + totalSF
  const obpVal   = obpDenom > 0 ? (totalH + totalBB + totalHBP) / obpDenom : 0
  const onBasePct   = _fmtRate(obpVal)

  const slgVal      = totalAB > 0 ? totalTB / totalAB : 0
  const sluggingPct = _fmtRate(slgVal)
  const ops         = _fmtRate(obpVal + slgVal)

  return { battingAvg, onBasePct, sluggingPct, ops }
}

/**
 * 投手のライブERAを計算する。シーズン通算 + 試合中成績を統合。
 * シーズンデータがなく、試合データもない場合は undefined。
 */
export function computeLiveEra(player: LineupPlayer, gameStats?: PitcherGameStats): string | undefined {
  const seasonIP = player.inningsPitched ? parseInningsPitched(player.inningsPitched) : 0
  const seasonER = Number(player.earnedRuns) || 0
  const gameIP = gameStats ? gameStats.outsRecorded / 3 : 0
  const gameER = gameStats ? gameStats.earnedRunsAllowed : 0
  const totalIP = seasonIP + gameIP
  const totalER = seasonER + gameER
  if (totalIP === 0) return player.era || undefined
  return ((totalER * 9) / totalIP).toFixed(2)
}

/**
 * 投手のライブWHIPを計算する。シーズン通算 + 試合中成績を統合。
 */
export function computeLiveWhip(player: LineupPlayer, gameStats?: PitcherGameStats): string | undefined {
  const seasonIP = player.inningsPitched ? parseInningsPitched(player.inningsPitched) : 0
  const seasonH = Number(player.hitsAllowed) || 0
  const seasonBB = Number(player.walksAllowed) || 0
  const gameIP = gameStats ? gameStats.outsRecorded / 3 : 0
  const gameH = gameStats ? gameStats.hitsAllowed : 0
  const gameBB = gameStats ? gameStats.walksAllowed : 0
  const totalIP = seasonIP + gameIP
  if (totalIP === 0) return player.whip || undefined
  return ((seasonH + gameH + seasonBB + gameBB) / totalIP).toFixed(2)
}

/** 打者のスタッツ文字列を生成 */
export function formatBatterStat(player: LineupPlayer, settings?: StatDisplaySettings): string {
  const s = settings ?? defaultStatDisplaySettings
  const parts: string[] = []
  if (s.showBattingAvg && player.battingAvg) parts.push(player.battingAvg)
  if (s.showHomeRuns && player.homeRuns) parts.push(`${player.homeRuns}本`)
  if (s.showRbi && player.rbi) parts.push(`${player.rbi}打点`)
  if (s.showOps && player.ops) parts.push(`OPS${player.ops}`)
  return parts.join(' ')
}

/** 投手のスタッツ文字列を生成 */
export function formatPitcherStat(player: LineupPlayer, settings?: StatDisplaySettings, gameStats?: PitcherGameStats): string {
  const s = settings ?? defaultStatDisplaySettings
  const parts: string[] = []
  if (s.showAppearances && player.appearances) parts.push(`${player.appearances}登板`)
  if (s.showRecord) {
    const rec = formatPitcherRecord({ wins: player.wins, losses: player.losses })
    if (rec) {
      parts.push(rec)
    } else if (player.record) {
      parts.push(player.record)
    }
  }
  if (s.showSaves && player.saves && Number(player.saves) > 0) parts.push(`${player.saves}S`)
  if (s.showHolds && player.holds && Number(player.holds) > 0) parts.push(`${player.holds}H`)
  if (s.showEra) {
    const era = computeLiveEra(player, gameStats)
    if (era) parts.push(`防御率 ${era}`)
  }
  if (s.showWhip) {
    const whip = computeLiveWhip(player, gameStats)
    if (whip) parts.push(`WHIP ${whip}`)
  }
  return parts.join(' ')
}

/** 投手の試合中成績サマリーを生成 (コントロールパネル用) */
/** outsRecorded から投球回文字列を生成する (例: 18→"6", 10→"3.1", 2→"0.2", 0→"0") */
export function formatOutsAsInnings(outsRecorded: number): string {
  if (outsRecorded >= 3) {
    const full = Math.floor(outsRecorded / 3)
    const frac = outsRecorded % 3
    return frac > 0 ? `${full}.${frac}` : `${full}`
  }
  return outsRecorded > 0 ? `0.${outsRecorded}` : '0'
}

export function formatPitcherGameSummary(gs: PitcherGameStats): string {
  const ip = formatOutsAsInnings(gs.outsRecorded)
  const parts: string[] = []
  parts.push(`${ip}回`)
  if (gs.hitsAllowed > 0) parts.push(`被安打${gs.hitsAllowed}`)
  if (gs.walksAllowed > 0) parts.push(`与四球${gs.walksAllowed}`)
  if (gs.earnedRunsAllowed > 0) parts.push(`自責${gs.earnedRunsAllowed}`)
  if (gs.runsAllowed > gs.earnedRunsAllowed) parts.push(`失点${gs.runsAllowed}`)
  return parts.join(' ')
}

// デモ用: 広島東洋カープ 2025スタメン
export const CARP_LINEUP: LineupPlayer[] = [
  { order: 1, name: '秋山 翔吾', number: '55', position: '左', battingAvg: '.278', homeRuns: '4', rbi: '28', ops: '.735' },
  { order: 2, name: '野間 峻祥', number: '37', position: '中', battingAvg: '.265', homeRuns: '3', rbi: '22', ops: '.698' },
  { order: 3, name: '小園 海斗', number: '51', position: '遊', battingAvg: '.291', homeRuns: '14', rbi: '58', ops: '.815' },
  { order: 4, name: '坂倉 将吾', number: '31', position: '捕', battingAvg: '.288', homeRuns: '16', rbi: '62', ops: '.838' },
  { order: 5, name: '末包 昇大', number: '64', position: '右', battingAvg: '.258', homeRuns: '20', rbi: '60', ops: '.798' },
  { order: 6, name: 'マクブルーム', number: '42', position: '一', battingAvg: '.272', homeRuns: '22', rbi: '68', ops: '.825' },
  { order: 7, name: '菊池 涼介', number: '33', position: '二', battingAvg: '.248', homeRuns: '5', rbi: '30', ops: '.672' },
  { order: 8, name: '上本 崇司', number: '0', position: '三', battingAvg: '.242', homeRuns: '3', rbi: '18', ops: '.655' },
  { order: 9, name: '田村 俊介', number: '38', position: 'DH', battingAvg: '.240', homeRuns: '2', rbi: '15', ops: '.638' },
  { order: 10, name: '森下 暢仁', number: '18', position: '投', appearances: '22', record: '10勝5敗', wins: '10', losses: '5' },
]

// デモ用: 福岡ソフトバンクホークス 2025スタメン
export const HAWKS_LINEUP: LineupPlayer[] = [
  { order: 1, name: '周東 佑京', number: '4', position: '中', battingAvg: '.268', homeRuns: '5', rbi: '25', ops: '.710' },
  { order: 2, name: '今宮 健太', number: '6', position: '遊', battingAvg: '.255', homeRuns: '8', rbi: '35', ops: '.698' },
  { order: 3, name: '柳田 悠岐', number: '9', position: '左', battingAvg: '.285', homeRuns: '20', rbi: '65', ops: '.880' },
  { order: 4, name: '山川 穂高', number: '33', position: '一', battingAvg: '.270', homeRuns: '28', rbi: '80', ops: '.890' },
  { order: 5, name: '近藤 健介', number: '3', position: 'DH', battingAvg: '.302', homeRuns: '15', rbi: '58', ops: '.865' },
  { order: 6, name: '栗原 陵矢', number: '1', position: '右', battingAvg: '.262', homeRuns: '12', rbi: '45', ops: '.758' },
  { order: 7, name: '牧原 大成', number: '2', position: '二', battingAvg: '.278', homeRuns: '3', rbi: '20', ops: '.695' },
  { order: 8, name: '甲斐 拓也', number: '19', position: '捕', battingAvg: '.230', homeRuns: '8', rbi: '30', ops: '.640' },
  { order: 9, name: '三森 大貴', number: '0', position: '三', battingAvg: '.245', homeRuns: '4', rbi: '22', ops: '.665' },
  { order: 10, name: '東浜 巨', number: '14', position: '投', appearances: '20', record: '8勝6敗', wins: '8', losses: '6' },
]

export const DEFAULT_OVERLAY_POSITIONS: Record<string, OverlayPosition> = {
  scoreboard: { x: 24, y: 24 },
  timer: { x: 24, y: 160 },
  lineup: { x: 1420, y: 24 },
  playerInfo: { x: 24, y: 1020 },
  playLog: { x: 1560, y: 800 },
  mascot: { x: 1740, y: 900 },
  fieldingDiagram: { x: 1680, y: 24 },
}

export const initialGameState: GameState = {
  awayTeam: { name: '', shortName: '', color: '#538bb0' },
  homeTeam: { name: '', shortName: '', color: '#538bb0' },
  currentInning: 1,
  currentHalf: 'top',
  isGameOver: false,
  innings: Array.from({ length: 9 }, (_, i) => ({ inning: i + 1, top: null, bottom: null })),
  awayTotal: 0,
  homeTotal: 0,
  awayHits: 0,
  homeHits: 0,
  awayErrors: 0,
  homeErrors: 0,
  count: { balls: 0, strikes: 0, outs: 0 },
  runners: { first: false, second: false, third: false },
  batter: { ...initialPlayerInfo },
  runnerIndices: { first: null, second: null, third: null },
  runnerResponsiblePitcher: { first: null, second: null, third: null },
  lastBatterIndex: null,
  pitcher: { ...initialPlayerInfo },
  awayLineup: emptyLineup(),
  homeLineup: emptyLineup(),
  awayBatterIndex: 0,
  homeBatterIndex: 0,
  playLog: [],
  pitchCount: 0,
  gameStartTime: null,
  ticker: '',
  activeEffect: null,
  effectTimestamp: 0,
  showMascot: false,
  mascotMode: 'idle',
  mascotImages: {},
  autoChangeEffect: false,
  showWaitingScreen: false,
  overlayPositions: { ...DEFAULT_OVERLAY_POSITIONS },
  overlayScale: 1,
  lineupDisplayTeam: 'away',
  pitcherStats: {},
  pitcherGameStats: {},
  batterGameStats: {},
  statDisplaySettings: { ...defaultStatDisplaySettings },
  scoreUrl: '',
  pitcherHistory: [],
}

export { emptyLineup }
