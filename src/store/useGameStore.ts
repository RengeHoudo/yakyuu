import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BatterGameStats, EffectType, GameState, HalfInning, LineupPlayer, MascotMode, OverlayPosition, PitcherGameStats, PlayerInfo, Runners, RunnerIndices, RunnerResponsiblePitcher, StatDisplaySettings } from '../types'
import { defaultBatterGameStats, initialGameState, initialPlayerInfo, formatBatterStat, DEFAULT_OVERLAY_POSITIONS, defaultPitcherGameStats, computeLiveBattingStats } from '../types'
import { broadcastState } from '../lib/sync'
import { backupToIDB, restoreFromIDB } from '../lib/idbBackup'

/**
 * オーバーレイページでは localStorage への書き込みを禁止する。
 * コントロールパネルだけが writer、オーバーレイは reader に徹することで
 * 書き込み競合（チーム名が反映されない・選手データが初期化される等）を防止する。
 */
let _preventPersistWrites = false
export function setPreventPersistWrites(prevent: boolean) {
  _preventPersistWrites = prevent
}

/** エフェクト自動クリア用タイマー。多重発火を防ぐため前回をクリアしてから再セットする。 */
let _effectTimer: ReturnType<typeof setTimeout> | null = null
const EFFECT_DURATION_MS = 6000

const DATA_KEYS: (keyof GameState)[] = [
  'awayTeam', 'homeTeam', 'currentInning', 'currentHalf', 'isGameOver',
  'innings', 'awayTotal', 'homeTotal', 'awayHits', 'homeHits',
  'awayErrors', 'homeErrors', 'count', 'runners',
  'batter', 'pitcher', 'awayLineup', 'homeLineup',
  'awayBatterIndex', 'homeBatterIndex', 'playLog',
  'pitchCount', 'gameStartTime', 'ticker', 'activeEffect', 'effectTimestamp',
  'showMascot', 'mascotMode', 'mascotImages', 'autoChangeEffect', 'showWaitingScreen',
  'overlayPositions', 'overlayScale', 'lineupDisplayTeam', 'pitcherStats', 'pitcherGameStats', 'runnerIndices',
  'runnerResponsiblePitcher', 'lastBatterIndex', 'statDisplaySettings', 'scoreUrl', 'pitcherHistory',
  'batterGameStats',
]

export function extractGameState(store: GameState): GameState {
  return Object.fromEntries(
    DATA_KEYS.map((key) => [key, store[key]]),
  ) as unknown as GameState
}

function recalcTotals(state: GameState): GameState {
  let awayTotal = 0
  let homeTotal = 0
  for (const inn of state.innings) {
    awayTotal += inn.top ?? 0
    homeTotal += inn.bottom ?? 0
  }
  return { ...state, awayTotal, homeTotal }
}

/** 数値スタッツの文字列を数値化するヘルパー */
function numStat(val: string | undefined): number {
  return Number(val) || 0
}

/** 打率・出塁率・長打率のフォーマット（.XXX 形式） */
function formatRate(val: number): string {
  if (isNaN(val) || !isFinite(val)) return '.000'
  if (val >= 1) return val.toFixed(3)
  return val.toFixed(3).replace(/^0/, '')
}

/** 成績から打率・長打率・出塁率・OPSを再計算する（後方互換用） */
export function recalcBattingStats(player: LineupPlayer): Partial<LineupPlayer> {
  const atBats = numStat(player.atBats)
  const hits = numStat(player.hits)
  const walks = numStat(player.walks)
  const hbp = numStat(player.hitByPitch)
  const sf = numStat(player.sacrificeFlies)
  const totalBases = numStat(player.totalBases)

  const battingAvg = atBats > 0 ? formatRate(hits / atBats) : '.000'
  const obpDenom = atBats + walks + hbp + sf
  const obpVal = obpDenom > 0 ? (hits + walks + hbp) / obpDenom : 0
  const onBasePct = formatRate(obpVal)
  const slgVal = atBats > 0 ? totalBases / atBats : 0
  const sluggingPct = formatRate(slgVal)
  const ops = formatRate(obpVal + slgVal)

  return { battingAvg, onBasePct, sluggingPct, ops }
}

/** 打撃統計フィールド → game* フィールドのマッピング */
const STAT_TO_GAME_FIELD: Partial<Record<string, keyof LineupPlayer>> = {
  atBats:         'gameAtBats',
  walks:          'gameWalks',
  hitByPitch:     'gameHitByPitch',
  sacrificeFlies: 'gameSacFlies',
  sacrificeHits:  'gameSacBunts',
  doubles:        'gameDoubles',
  triples:        'gameTriples',
  homeRuns:       'gameHomeRuns',
}

/** シーズン文字列を直接変更せず game* で管理するフィールド群 */
const AVG_RELEVANT_FIELDS = new Set([
  'atBats', 'hits', 'totalBases', 'walks', 'hitByPitch',
  'sacrificeFlies', 'sacrificeHits', 'doubles', 'triples', 'homeRuns',
])

/** 現在の投手の試合中成績を更新する */
function updatePitcherGameStatsPatch(
  s: GameState,
  patch: Partial<PitcherGameStats>,
): Partial<GameState> {
  const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
  const key = `${defTeam}-${s.pitcher.number}`
  const prev = s.pitcherGameStats?.[key] ?? { ...defaultPitcherGameStats }
  const updated = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    ;(updated as any)[k] = ((updated as any)[k] ?? 0) + v
  }
  return { pitcherGameStats: { ...s.pitcherGameStats, [key]: updated } }
}

/**
 * 責任投手ごとに失点・自責点を分配するパッチを生成する。
 * scoredPitcherKeys の各エントリが1得点に対応し、その投手の runsAllowed/earnedRunsAllowed を+1する。
 * currentPatch は現在の投手に加算する非得点系スタッツ (hitsAllowed, walksAllowed, outsRecorded など)。
 */
function distributePitcherRunsPatch(
  s: GameState,
  scoredPitcherKeys: string[],
  earned: boolean,
  currentPatch?: Partial<PitcherGameStats>,
): Partial<GameState> {
  const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
  const currentKey = `${defTeam}-${s.pitcher.number}`
  const pgs = { ...s.pitcherGameStats }

  // Apply currentPatch (non-run stats) to current pitcher
  if (currentPatch) {
    const prev = pgs[currentKey] ?? { ...defaultPitcherGameStats }
    const updated = { ...prev }
    for (const [k, v] of Object.entries(currentPatch)) {
      ;(updated as any)[k] = ((updated as any)[k] ?? 0) + v
    }
    pgs[currentKey] = updated
  }

  // Distribute runs to responsible pitchers
  for (const key of scoredPitcherKeys) {
    const prev = pgs[key] ?? { ...defaultPitcherGameStats }
    const updated = { ...prev }
    updated.runsAllowed += 1
    if (earned) updated.earnedRunsAllowed += 1
    pgs[key] = updated
  }

  return { pitcherGameStats: pgs }
}

/** 現在の打者の LineupPlayer 成績を更新する */
export function updateBatterStats(s: GameState, patch: Record<string, number>): Partial<GameState> {
  const isAway = s.currentHalf === 'top'
  const key = isAway ? 'awayLineup' as const : 'homeLineup' as const
  const idxKey = isAway ? 'awayBatterIndex' as const : 'homeBatterIndex' as const
  const team = isAway ? 'away' : 'home'
  const batterIdx = s[idxKey]
  const lineup = [...s[key]]
  const player = { ...lineup[batterIdx]! }

  // 選手キーで batterGameStats を取得・更新
  const bKey = player.number ? `${team}-${player.number}` : null
  const currentBGS: BatterGameStats = bKey
    ? (s.batterGameStats?.[bKey] ?? { ...defaultBatterGameStats })
    : { ...defaultBatterGameStats }
  const newBGS = { ...currentBGS }

  for (const [k, increment] of Object.entries(patch)) {
    const gameField = STAT_TO_GAME_FIELD[k]
    if (gameField) {
      // batterGameStats（正本）と player.game*（ミラー）の両方を更新
      ;(newBGS as any)[gameField] = ((newBGS as any)[gameField] ?? 0) + increment
      ;(player as any)[gameField] = (newBGS as any)[gameField]
    } else if (!AVG_RELEVANT_FIELDS.has(k)) {
      // rbi, plateAppearances, strikeouts, intentionalWalks 等はシーズン文字列を更新
      ;(player as any)[k] = String(numStat((player as any)[k]) + increment)
    }
    // totalBases は game* ヒットフィールドから算出するためスキップ
  }

  // 単打: hits がありかつ doubles/triples/homeRuns がない場合 → gameSingles に積算
  if ((patch.hits ?? 0) > 0 && !patch.doubles && !patch.triples && !patch.homeRuns) {
    newBGS.gameSingles = newBGS.gameSingles + (patch.hits ?? 0)
    player.gameSingles = newBGS.gameSingles
  }

  Object.assign(player, computeLiveBattingStats(player))
  lineup[batterIdx] = player

  const newBatterGameStats = bKey
    ? { ...(s.batterGameStats ?? {}), [bKey]: newBGS }
    : (s.batterGameStats ?? {})

  return { [key]: lineup, batterGameStats: newBatterGameStats }
}

/** 走者進塁を適用し、生還数を返す */
export function advanceRunners(
  s: GameState,
  basesForBatter: 0 | 1 | 2 | 3 | 4,
  _forceOnly: boolean,
): { runners: Runners; runnerIndices: RunnerIndices; runnerResponsiblePitcher: RunnerResponsiblePitcher; runsScored: number; scoredPitcherKeys: string[] } {
  const ri = s.runnerIndices
  const rrp = s.runnerResponsiblePitcher
  const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
  const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
  const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
  let runsScored = 0
  const scoredPitcherKeys: string[] = []

  if (basesForBatter === 4) {
    if (ri.first !== null) { runsScored++; scoredPitcherKeys.push(rrp.first ?? currentPitcherKey) }
    if (ri.second !== null) { runsScored++; scoredPitcherKeys.push(rrp.second ?? currentPitcherKey) }
    if (ri.third !== null) { runsScored++; scoredPitcherKeys.push(rrp.third ?? currentPitcherKey) }
    runsScored++; scoredPitcherKeys.push(currentPitcherKey) // batter
    return {
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
      runnerResponsiblePitcher: { first: null, second: null, third: null },
      runsScored, scoredPitcherKeys,
    }
  }

  if (basesForBatter === 3) {
    if (ri.first !== null) { runsScored++; scoredPitcherKeys.push(rrp.first ?? currentPitcherKey) }
    if (ri.second !== null) { runsScored++; scoredPitcherKeys.push(rrp.second ?? currentPitcherKey) }
    if (ri.third !== null) { runsScored++; scoredPitcherKeys.push(rrp.third ?? currentPitcherKey) }
    return {
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: currentBatterIdx },
      runnerResponsiblePitcher: { first: null, second: null, third: currentPitcherKey },
      runsScored, scoredPitcherKeys,
    }
  }

  if (basesForBatter === 2) {
    if (ri.third !== null) { runsScored++; scoredPitcherKeys.push(rrp.third ?? currentPitcherKey) }
    const newRI: RunnerIndices = { first: null, second: currentBatterIdx, third: null }
    const newR: Runners = { first: false, second: true, third: false }
    const newRRP: RunnerResponsiblePitcher = { first: null, second: currentPitcherKey, third: null }
    if (ri.first !== null) {
      newRI.third = ri.first
      newR.third = true
      newRRP.third = rrp.first ?? currentPitcherKey
      if (ri.second !== null) {
        runsScored++ // 2nd pushed home by 1st→3rd
        scoredPitcherKeys.push(rrp.second ?? currentPitcherKey)
      }
    } else if (ri.second !== null) {
      newRI.third = ri.second
      newR.third = true
      newRRP.third = rrp.second ?? currentPitcherKey
    }
    return { runners: newR, runnerIndices: newRI, runnerResponsiblePitcher: newRRP, runsScored, scoredPitcherKeys }
  }

  if (basesForBatter === 1) {
    const newRI: RunnerIndices = { first: currentBatterIdx, second: null, third: null }
    const newR: Runners = { first: true, second: false, third: false }
    const newRRP: RunnerResponsiblePitcher = { first: currentPitcherKey, second: null, third: null }
    if (ri.first !== null) {
      newRI.second = ri.first
      newR.second = true
      newRRP.second = rrp.first ?? currentPitcherKey
      if (ri.second !== null) {
        newRI.third = ri.second
        newR.third = true
        newRRP.third = rrp.second ?? currentPitcherKey
        if (ri.third !== null) {
          runsScored++ // 3rd pushed home
          scoredPitcherKeys.push(rrp.third ?? currentPitcherKey)
        }
      } else {
        if (ri.third !== null) {
          newRI.third = ri.third
          newR.third = true
          newRRP.third = rrp.third ?? currentPitcherKey
        }
      }
    } else {
      if (ri.second !== null) {
        newRI.second = ri.second
        newR.second = true
        newRRP.second = rrp.second ?? currentPitcherKey
      }
      if (ri.third !== null) {
        newRI.third = ri.third
        newR.third = true
        newRRP.third = rrp.third ?? currentPitcherKey
      }
    }
    return { runners: newR, runnerIndices: newRI, runnerResponsiblePitcher: newRRP, runsScored, scoredPitcherKeys }
  }

  // basesForBatter === 0: 全走者を1塁ずつ進塁（犠打・WP/PB）
  const newRI: RunnerIndices = { first: null, second: null, third: null }
  const newR: Runners = { first: false, second: false, third: false }
  const newRRP: RunnerResponsiblePitcher = { first: null, second: null, third: null }
  if (ri.third !== null) { runsScored++; scoredPitcherKeys.push(rrp.third ?? currentPitcherKey) }
  if (ri.second !== null) { newRI.third = ri.second; newR.third = true; newRRP.third = rrp.second ?? currentPitcherKey }
  if (ri.first !== null) { newRI.second = ri.first; newR.second = true; newRRP.second = rrp.first ?? currentPitcherKey }
  return { runners: newR, runnerIndices: newRI, runnerResponsiblePitcher: newRRP, runsScored, scoredPitcherKeys }
}

/** 得点を現在のイニングに加算する */
function addScoreRuns(s: GameState, runs: number): Partial<GameState> {
  if (runs <= 0) return {}
  const innings = [...s.innings]
  const idx = innings.findIndex((inn) => inn.inning === s.currentInning)
  if (idx === -1) return {}
  const inn = { ...innings[idx]! }
  inn[s.currentHalf] = (inn[s.currentHalf] ?? 0) + runs
  innings[idx] = inn
  const totals = recalcTotals({ ...extractGameState(s), innings })
  return { innings: totals.innings, awayTotal: totals.awayTotal, homeTotal: totals.homeTotal }
}

/** 指定打順インデックスの打者の rbi を +n し成績再計算する */
function addRBIToBatter(s: GameState, batterIndex: number, count: number = 1): Partial<GameState> {
  const isAway = s.currentHalf === 'top'
  const key = isAway ? 'awayLineup' as const : 'homeLineup' as const
  const lineup = [...s[key]]
  const player = { ...lineup[batterIndex]! }
  player.rbi = String(numStat(player.rbi) + count)
  Object.assign(player, computeLiveBattingStats(player))
  lineup[batterIndex] = player
  return { [key]: lineup }
}

interface GameActions {
  addBall: () => void
  addStrike: () => void
  addFoul: () => void
  addOut: () => void
  resetCount: () => void
  advanceInning: () => void
  setRunner: (base: keyof Runners, on: boolean) => void
  addRun: (team: 'away' | 'home') => void
  setInningScore: (inning: number, half: HalfInning, score: number) => void
  setBatter: (info: PlayerInfo) => void
  setPitcher: (info: PlayerInfo) => void
  addHit: (team: 'away' | 'home') => void
  recordSingle: () => void
  recordDouble: () => void
  recordTriple: () => void
  recordHitByPitch: () => void
  recordHomeRun: () => void
  recordWalk: () => void
  recordIntentionalWalk: () => void
  recordGroundout: () => void
  recordFlyout: () => void
  recordForceOut: () => void
  recordFieldersChoice: () => void
  recordSacrificeBuntFC: () => void
  recordDoublePlay: () => void
  recordTriplePlay: () => void
  recordSacrificeBunt: () => void
  recordSacrificeFly: () => void
  recordUncaughtThirdStrike: () => void
  recordError: () => void
  addError: (team: 'away' | 'home') => void
  setHits: (team: 'away' | 'home', count: number) => void
  setErrors: (team: 'away' | 'home', count: number) => void
  setLineup: (team: 'away' | 'home', lineup: LineupPlayer[]) => void
  setLineupPlayer: (team: 'away' | 'home', index: number, player: LineupPlayer) => void
  selectBatter: (team: 'away' | 'home', index: number) => void
  nextBatter: () => void
  prevBatter: () => void
  addPlayLog: (text: string) => void
  clearPlayLog: () => void
  setTeamName: (team: 'away' | 'home', name: string, shortName: string) => void
  setGameOver: (over: boolean) => void
  newGame: () => void
  replaceState: (state: GameState) => void
  subtractBall: () => void
  subtractStrike: () => void
  subtractOut: () => void
  subtractRun: (team: 'away' | 'home') => void
  addPitch: () => void
  setPitchCount: (n: number) => void
  startGameTimer: () => void
  stopGameTimer: () => void
  setTicker: (text: string) => void
  triggerEffect: (type: EffectType) => void
  setTeamColor: (team: 'away' | 'home', color: string) => void
  rewindInning: () => void
  setShowMascot: (show: boolean) => void
  setMascotMode: (mode: MascotMode) => void
  setMascotImage: (mode: string, dataUrl: string | null) => void
  setAutoChangeEffect: (on: boolean) => void
  setShowWaitingScreen: (show: boolean) => void
  setOverlayPosition: (id: string, pos: OverlayPosition) => void
  resetOverlayPositions: () => void
  setOverlayScale: (scale: number) => void
  setLineupDisplayTeam: (team: 'away' | 'home') => void
  /** 塁に攻撃チーム打順インデックスをセットする。nullはクリア */
  setRunnerAtBase: (base: keyof RunnerIndices, lineupIndex: number | null) => void
  /** H🏏 打点あり生還: lastBatterIndex の rbi +1 */
  scoreRunnerWithRBI: (lineupIndex: number) => void
  /** H🏃‍♀️ 打点なし生還: 得点のみ */
  scoreRunnerNoRBI: (lineupIndex: number) => void
  /** 非自責点生還: 失点+1 だが自責点には加算しない */
  scoreRunnerUnearned: (lineupIndex: number) => void
  /** 暴投/パスボール: 全走者1塁ずつ進塁、3塁走者は打点なし生還 */
  advanceRunnersOnWildPitch: () => void
  /** オーバーレイ表示スタッツ設定を部分更新する */
  setStatDisplaySettings: (settings: Partial<StatDisplaySettings>) => void
  /** NPBスコアページURLをセットする */
  setScoreUrl: (url: string) => void
  /** 打者の試合内成績を直接セット（0から編集可能） */
  setLineupPlayerGameStats: (team: 'away' | 'home', index: number, stats: {
    gameAtBats: number
    gameWalks: number
    gameHitByPitch: number
    gameSacFlies: number
    gameSacBunts: number
    gameSingles: number
    gameDoubles: number
    gameTriples: number
    gameHomeRuns: number
  }) => void
  /** 投手の試合内成績を直接セット */
  setPitcherGameStats: (key: string, stats: PitcherGameStats) => void
  /** 直前の状態に戻す */
  undo: () => void
  /** undo 履歴件数（0 = undo 不可） */
  undoCount: number
}

type GameStore = GameState & GameActions

// ─────────────────────────────────────────────
// Undo 用履歴スタック（persist 対象外）
// ─────────────────────────────────────────────
const MAX_HISTORY = 20
const _undoHistory: GameState[] = []
let _undoInProgress = false

/** テスト用: undo 履歴をクリアする */
export function clearUndoHistory(): void {
  _undoHistory.length = 0
  useGameStore.setState({ undoCount: 0 })
}

/**
 * Undo ミドルウェア:
 * set を呼ぶたびに現在の GameState スナップショットを _undoHistory に push する。
 * undo() 実行中や replaceState/newGame/setOverlayPosition 等の非ゲーム操作はスキップする。
 */
function pushHistory(currentState: GameStore, rawSet: (partial: Partial<GameStore>) => unknown): void {
  if (_undoInProgress) return
  _undoHistory.push(extractGameState(currentState))
  if (_undoHistory.length > MAX_HISTORY) _undoHistory.shift()
  // undoCount をリアクティブに更新（再レンダリングをトリガー）
  _undoInProgress = true
  rawSet({ undoCount: _undoHistory.length })
  _undoInProgress = false
}

export const useGameStore = create<GameStore>()(
  persist(
    (rawSet, get) => {
      // set を wrap して呼び出し前にスナップショットを保存
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set = ((...args: any[]) => {
        pushHistory(get(), rawSet as any)
        return (rawSet as any)(...args)
      }) as typeof rawSet
      return {
      ...initialGameState,
      undoCount: 0,

      addBall: () =>
        set((s) => {
          const balls = s.count.balls + 1
          if (balls >= 4) {
            const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
            const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
            const statPatch = updateBatterStats(s, {
              plateAppearances: 1,
              walks: 1,
              ...(runsScored > 0 ? { rbi: runsScored } : {}),
            })
            const walkResult = applyWalk(s)
            const { _walkScoredPitcherKey, ...walkPatch } = walkResult
            const pgsPatch = _walkScoredPitcherKey
              ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true, { walksAllowed: 1 })
              : updatePitcherGameStatsPatch(s, { walksAllowed: 1 })
            return {
              ...walkPatch,
              ...statPatch,
              ...advanceBatterPatch(s),
              ...pgsPatch,
              pitchCount: s.pitchCount + 1,
              lastBatterIndex: currentBatterIdx,
            }
          }
          return { count: { ...s.count, balls }, pitchCount: s.pitchCount + 1 }
        }),

      addStrike: () =>
        set((s) => {
          const strikes = s.count.strikes + 1
          if (strikes >= 3) {
            const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
            const statPatch = updateBatterStats(s, {
              plateAppearances: 1,
              atBats: 1,
              strikeouts: 1,
            })
            const pgsPatch = updatePitcherGameStatsPatch(s, { outsRecorded: 1 })
            const outs = s.count.outs + 1
            if (outs >= 3) {
              const sWithPitch = { ...extractGameState(s), pitchCount: s.pitchCount + 1 } as GameState
              return { ...statPatch, ...advanceBatterPatch(s), ...advanceInningPatch(sWithPitch), ...pgsPatch }
            }
            const newPitchCount = s.pitchCount + 1
            const sWithOuts = { ...extractGameState(s), count: { ...s.count, outs }, pitchCount: newPitchCount }
            return { ...statPatch, ...advanceBatterPatch(sWithOuts), ...pgsPatch, pitchCount: newPitchCount, lastBatterIndex: currentBatterIdx }
          }
          return { count: { ...s.count, strikes }, pitchCount: s.pitchCount + 1 }
        }),

      addFoul: () =>
        set((s) => {
          if (s.count.strikes >= 2) {
            // 2ストライク: 投球数のみ+1
            return { pitchCount: s.pitchCount + 1 }
          }
          // 0 or 1ストライク: ストライク+1 & 投球数+1
          return { count: { ...s.count, strikes: s.count.strikes + 1 }, pitchCount: s.pitchCount + 1 }
        }),

      addOut: () =>
        set((s) => {
          const outs = s.count.outs + 1
          if (outs >= 3) {
            return { ...advanceBatterPatch(s), ...advanceInningPatch(s), ...updatePitcherGameStatsPatch(s, { outsRecorded: 1 }) }
          }
          // +1ボタン: out追加のみ（打者は進めない）
          return { count: { balls: 0, strikes: 0, outs }, ...updatePitcherGameStatsPatch(s, { outsRecorded: 1 }) }
        }),

      resetCount: () =>
        set((s) => ({ count: { ...s.count, balls: 0, strikes: 0 } })),

      advanceInning: () => set((s) => ({ ...advanceBatterPatch(s), ...advanceInningPatch(s) })),

      setRunner: (base, on) =>
        set((s) => ({ runners: { ...s.runners, [base]: on } })),

      setRunnerAtBase: (base, lineupIndex) =>
        set((s) => {
          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
          // 同じ選手が既に別の塁にいる場合は先にクリアし、責任投手を引き継ぐ
          const newRI = { ...s.runnerIndices }
          const newRunners = { ...s.runners }
          const newRRP = { ...s.runnerResponsiblePitcher }
          let existingRRP: string | null = null
          if (lineupIndex !== null) {
            for (const b of ['first', 'second', 'third'] as const) {
              if (b !== base && newRI[b] === lineupIndex) {
                existingRRP = newRRP[b] // 元の責任投手を保持
                newRI[b] = null
                newRunners[b] = false
                newRRP[b] = null
              }
            }
          }
          newRI[base] = lineupIndex
          newRunners[base] = lineupIndex !== null
          newRRP[base] = lineupIndex !== null ? (existingRRP ?? currentPitcherKey) : null
          return { runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP }
        }),

      scoreRunnerWithRBI: (lineupIndex) =>
        set((s) => {
          const ri = s.runnerIndices
          let base: keyof RunnerIndices | null = null
          if (ri.first === lineupIndex) base = 'first'
          else if (ri.second === lineupIndex) base = 'second'
          else if (ri.third === lineupIndex) base = 'third'
          if (!base) return s

          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
          const responsibleKey = s.runnerResponsiblePitcher[base] ?? currentPitcherKey
          const scorePatch = addScoreRuns(s, 1)
          const rbiPatch = s.lastBatterIndex !== null ? addRBIToBatter(s, s.lastBatterIndex) : {}
          return {
            ...scorePatch,
            ...rbiPatch,
            ...distributePitcherRunsPatch(s, [responsibleKey], true),
            runners: { ...s.runners, [base]: false },
            runnerIndices: { ...ri, [base]: null },
            runnerResponsiblePitcher: { ...s.runnerResponsiblePitcher, [base]: null },
          }
        }),

      scoreRunnerNoRBI: (lineupIndex) =>
        set((s) => {
          const ri = s.runnerIndices
          let base: keyof RunnerIndices | null = null
          if (ri.first === lineupIndex) base = 'first'
          else if (ri.second === lineupIndex) base = 'second'
          else if (ri.third === lineupIndex) base = 'third'
          if (!base) return s

          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
          const responsibleKey = s.runnerResponsiblePitcher[base] ?? currentPitcherKey
          return {
            ...addScoreRuns(s, 1),
            ...distributePitcherRunsPatch(s, [responsibleKey], true),
            runners: { ...s.runners, [base]: false },
            runnerIndices: { ...ri, [base]: null },
            runnerResponsiblePitcher: { ...s.runnerResponsiblePitcher, [base]: null },
          }
        }),

      scoreRunnerUnearned: (lineupIndex) =>
        set((s) => {
          const ri = s.runnerIndices
          let base: keyof RunnerIndices | null = null
          if (ri.first === lineupIndex) base = 'first'
          else if (ri.second === lineupIndex) base = 'second'
          else if (ri.third === lineupIndex) base = 'third'
          if (!base) return s

          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
          const responsibleKey = s.runnerResponsiblePitcher[base] ?? currentPitcherKey
          return {
            ...addScoreRuns(s, 1),
            ...distributePitcherRunsPatch(s, [responsibleKey], false),
            runners: { ...s.runners, [base]: false },
            runnerIndices: { ...ri, [base]: null },
            runnerResponsiblePitcher: { ...s.runnerResponsiblePitcher, [base]: null },
          }
        }),

      advanceRunnersOnWildPitch: () =>
        set((s) => {
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 0, false)
          return {
            runners,
            runnerIndices,
            runnerResponsiblePitcher,
            ...addScoreRuns(s, runsScored),
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, true) : {}),
          }
        }),

      setStatDisplaySettings: (settings) =>
        set((s) => ({
          statDisplaySettings: { ...s.statDisplaySettings, ...settings },
        })),

      setScoreUrl: (url) => set({ scoreUrl: url }),

      addRun: (team) =>
        set((s) => {
          const innings = [...s.innings]
          const currentIdx = innings.findIndex(
            (inn) => inn.inning === s.currentInning,
          )
          if (currentIdx === -1) return s

          const inn = { ...innings[currentIdx]! }
          const half = team === 'away' ? 'top' as const : 'bottom' as const
          inn[half] = (inn[half] ?? 0) + 1
          innings[currentIdx] = inn

          return recalcTotals({ ...extractGameState(s), innings })
        }),

      setInningScore: (inning, half, score) =>
        set((s) => {
          const innings = [...s.innings]
          const idx = innings.findIndex((inn) => inn.inning === inning)
          if (idx === -1) return s

          const inn = { ...innings[idx]! }
          inn[half] = score
          innings[idx] = inn

          return recalcTotals({ ...extractGameState(s), innings })
        }),

      setBatter: (info) => set({ batter: info }),

      setPitcher: (info) =>
        set((s) => {
          // 投手番号が変わらない場合（内容編集のみ）： pitchCount はそのまま
          if (s.pitcher.number === info.number) {
            return { pitcher: info }
          }
          // 投手交代: 旧投手の投球数を保存、新投手の累積投球数を復元
          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const prevKey = `${defTeam}-${s.pitcher.number}`
          const newKey  = `${defTeam}-${info.number}`
          const prevStats = s.pitcherStats ?? {}
          const pitcherStats = s.pitcher.number
            ? { ...prevStats, [prevKey]: s.pitchCount }
            : { ...prevStats }
          const restoredPitchCount = pitcherStats[newKey] ?? 0
          // 投手履歴を更新
          const historyPatch = registerPitcherAppearance(s, defTeam, info.name, info.number)
          return { pitcher: info, pitchCount: restoredPitchCount, pitcherStats, ...historyPatch }
        }),

      addHit: (team) =>
        set((s) => team === 'away'
          ? { awayHits: s.awayHits + 1 }
          : { homeHits: s.homeHits + 1 }),

      recordSingle: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 1, true)
          const attackTeam = s.currentHalf === 'top' ? 'away' : 'home'
          const hitsPatch = attackTeam === 'away'
            ? { awayHits: s.awayHits + 1 }
            : { homeHits: s.homeHits + 1 }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, hits: 1, totalBases: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          return {
            ...hitsPatch,
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, true, { hitsAllowed: 1 }) : updatePitcherGameStatsPatch(s, { hitsAllowed: 1 })),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      recordDouble: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 2, false)
          const attackTeam = s.currentHalf === 'top' ? 'away' : 'home'
          const hitsPatch = attackTeam === 'away'
            ? { awayHits: s.awayHits + 1 }
            : { homeHits: s.homeHits + 1 }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, hits: 1, doubles: 1, totalBases: 2,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          return {
            ...hitsPatch,
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, true, { hitsAllowed: 1 }) : updatePitcherGameStatsPatch(s, { hitsAllowed: 1 })),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      recordTriple: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 3, false)
          const attackTeam = s.currentHalf === 'top' ? 'away' : 'home'
          const hitsPatch = attackTeam === 'away'
            ? { awayHits: s.awayHits + 1 }
            : { homeHits: s.homeHits + 1 }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, hits: 1, triples: 1, totalBases: 3,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          return {
            ...hitsPatch,
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, true, { hitsAllowed: 1 }) : updatePitcherGameStatsPatch(s, { hitsAllowed: 1 })),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      recordHitByPitch: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            hitByPitch: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const walkResult = applyWalk(s)
          const { _walkScoredPitcherKey, ...walkPatch } = walkResult
          const pgsPatch = _walkScoredPitcherKey
            ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true)
            : {}
          return {
            ...walkPatch,
            ...statPatch,
            ...advanceBatterPatch(s),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordHomeRun: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 4, false)
          const attackTeam = s.currentHalf === 'top' ? 'away' : 'home'
          const hitsPatch = attackTeam === 'away'
            ? { awayHits: s.awayHits + 1 }
            : { homeHits: s.homeHits + 1 }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, hits: 1, homeRuns: 1, totalBases: 4, rbi: runsScored,
          })
          return {
            ...hitsPatch,
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            ...distributePitcherRunsPatch(s, scoredPitcherKeys, true, { hitsAllowed: 1 }),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      recordWalk: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            walks: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const walkResult = applyWalk(s)
          const { _walkScoredPitcherKey, ...walkPatch } = walkResult
          const pgsPatch = _walkScoredPitcherKey
            ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true, { walksAllowed: 1 })
            : updatePitcherGameStatsPatch(s, { walksAllowed: 1 })
          return {
            ...walkPatch,
            ...statPatch,
            ...advanceBatterPatch(s),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordIntentionalWalk: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            walks: 1,
            intentionalWalks: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const walkResult = applyWalk(s)
          const { _walkScoredPitcherKey, ...walkPatch } = walkResult
          const pgsPatch = _walkScoredPitcherKey
            ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true, { walksAllowed: 1 })
            : updatePitcherGameStatsPatch(s, { walksAllowed: 1 })
          return {
            ...walkPatch,
            ...statPatch,
            ...advanceBatterPatch(s),
            ...pgsPatch,
            lastBatterIndex: currentBatterIdx,
            // 故意四球は投球数を加算しない
          }
        }),

      recordGroundout: () => set((s) => applyOutPlay(s, 1)),
      recordFlyout: () => set((s) => applyOutPlay(s, 1)),

      recordForceOut: () =>
        set((s) => {
          // 走者がいない場合は封殺は成立しないので何もしない
          if (!s.runners.first && !s.runners.second && !s.runners.third) return s
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`

          // 打者が一塁に進む（既存の一塁走者は封殺でアウト → newRI.first を上書きで除去）
          const newRI = { ...s.runnerIndices, first: currentBatterIdx }
          const newRunners = { ...s.runners, first: true }
          const newRRP = { ...s.runnerResponsiblePitcher, first: currentPitcherKey }

          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            atBats: 1,
          })
          const pgsPatch = updatePitcherGameStatsPatch(s, { outsRecorded: 1 })
          const newOuts = s.count.outs + 1
          const sWithPitch: GameState = { ...extractGameState(s), pitchCount: s.pitchCount + 1 }

          if (newOuts >= 3) {
            return {
              ...statPatch,
              runners: newRunners,
              runnerIndices: newRI,
              runnerResponsiblePitcher: newRRP,
              ...advanceBatterPatch(s),
              ...advanceInningPatch(sWithPitch),
              ...pgsPatch,
            }
          }
          const sWithOuts: GameState = { ...extractGameState(s), count: { ...s.count, outs: newOuts } }
          return {
            ...statPatch,
            runners: newRunners,
            runnerIndices: newRI,
            runnerResponsiblePitcher: newRRP,
            ...advanceBatterPatch(sWithOuts),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordFieldersChoice: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          // 野選: アウトカウントは増えない。打者→一塁、走者は四球と同じ押し出し
          const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            atBats: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const walkResult = applyWalk(s)
          const { _walkScoredPitcherKey, ...walkPatch } = walkResult
          const pgsPatch = _walkScoredPitcherKey
            ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true)
            : {}
          return {
            ...walkPatch,
            ...statPatch,
            ...advanceBatterPatch(s),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordSacrificeBuntFC: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          // 犠野（犠打フィルダースチョイス）: 打数なし・犠打+1・打席+1、アウト増えない、打者→一塁、走者は四球と同じ押し出し
          const runsScored = s.runners.first && s.runners.second && s.runners.third ? 1 : 0
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            sacrificeHits: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const walkResult = applyWalk(s)
          const { _walkScoredPitcherKey, ...walkPatch } = walkResult
          const pgsPatch = _walkScoredPitcherKey
            ? distributePitcherRunsPatch(s, [_walkScoredPitcherKey], true)
            : {}
          return {
            ...walkPatch,
            ...statPatch,
            ...advanceBatterPatch(s),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordDoublePlay: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          // 先頭走者を除去
          const newRunners = { ...s.runners }
          const newRI = { ...s.runnerIndices }
          const newRRP = { ...s.runnerResponsiblePitcher }
          if (newRI.first !== null) {
            newRI.first = null
            newRunners.first = false
            newRRP.first = null
          } else if (newRI.second !== null) {
            newRI.second = null
            newRunners.second = false
            newRRP.second = null
          }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, groundedIntoDoublePlays: 1,
          })
          const newOuts = s.count.outs + 2
          const sWithPitch: GameState = {
            ...extractGameState(s),
            runners: newRunners,
            runnerIndices: newRI,
            runnerResponsiblePitcher: newRRP,
            pitchCount: s.pitchCount + 1,
          }
          if (newOuts >= 3) {
            return {
              ...statPatch,
              runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP,
              ...advanceBatterPatch(s),
              ...advanceInningPatch(sWithPitch),
              ...updatePitcherGameStatsPatch(s, { outsRecorded: 2 }),
            }
          }
          const sWithOuts: GameState = {
            ...sWithPitch,
            count: { ...s.count, outs: newOuts },
          }
          return {
            ...statPatch,
            runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP,
            ...advanceBatterPatch(sWithOuts),
            ...updatePitcherGameStatsPatch(s, { outsRecorded: 2 }),
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordTriplePlay: () =>
        set((s) => {
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1,
          })
          const sWithPitch: GameState = {
            ...extractGameState(s),
            runners: { first: false, second: false, third: false },
            runnerIndices: { first: null, second: null, third: null },
            runnerResponsiblePitcher: { first: null, second: null, third: null },
            pitchCount: s.pitchCount + 1,
          }
          return {
            ...statPatch,
            runners: { first: false, second: false, third: false },
            runnerIndices: { first: null, second: null, third: null },
            runnerResponsiblePitcher: { first: null, second: null, third: null },
            ...advanceBatterPatch(s),
            ...advanceInningPatch(sWithPitch),
            ...updatePitcherGameStatsPatch(s, { outsRecorded: 3 }),
          }
        }),

      recordSacrificeBunt: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 0, false)
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            sacrificeHits: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const newOuts = s.count.outs + 1
          const scorePatch = addScoreRuns(s, runsScored)
          const pgsPatch = runsScored > 0
            ? distributePitcherRunsPatch(s, scoredPitcherKeys, true, { outsRecorded: 1 })
            : updatePitcherGameStatsPatch(s, { outsRecorded: 1 })
          const sWithPitch: GameState = {
            ...extractGameState(s),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
          }
          if (newOuts >= 3) {
            return {
              ...statPatch, ...scorePatch,
              runners, runnerIndices, runnerResponsiblePitcher,
              ...advanceBatterPatch(s),
              ...advanceInningPatch(sWithPitch),
              ...pgsPatch,
            }
          }
          const sWithOuts: GameState = {
            ...sWithPitch,
            count: { ...s.count, outs: newOuts },
          }
          return {
            ...statPatch, ...scorePatch,
            runners, runnerIndices, runnerResponsiblePitcher,
            ...advanceBatterPatch(sWithOuts),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordSacrificeFly: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          // 3塁走者必須 → 生還
          const newRunners = { ...s.runners, third: false }
          const newRI = { ...s.runnerIndices, third: null }
          const newRRP = { ...s.runnerResponsiblePitcher, third: null }
          const runsScored = s.runners.third ? 1 : 0
          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          const currentPitcherKey = `${defTeam}-${s.pitcher.number}`
          const responsibleKey = s.runnerResponsiblePitcher.third ?? currentPitcherKey
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1,
            sacrificeFlies: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          const newOuts = s.count.outs + 1
          const scorePatch = addScoreRuns(s, runsScored)
          const pgsPatch = runsScored > 0
            ? distributePitcherRunsPatch(s, [responsibleKey], true, { outsRecorded: 1 })
            : updatePitcherGameStatsPatch(s, { outsRecorded: 1 })
          const sWithPitch: GameState = {
            ...extractGameState(s),
            runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP,
            pitchCount: s.pitchCount + 1,
          }
          if (newOuts >= 3) {
            return {
              ...statPatch, ...scorePatch,
              runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP,
              ...advanceBatterPatch(s),
              ...advanceInningPatch(sWithPitch),
              ...pgsPatch,
            }
          }
          const sWithOuts: GameState = {
            ...sWithPitch,
            count: { ...s.count, outs: newOuts },
          }
          return {
            ...statPatch, ...scorePatch,
            runners: newRunners, runnerIndices: newRI, runnerResponsiblePitcher: newRRP,
            ...advanceBatterPatch(sWithOuts),
            ...pgsPatch,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
          }
        }),

      recordUncaughtThirdStrike: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          // 振り逃げ: 打者→1塁、フォース押し出し（2アウト時のみ1塁走者あり可）
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 1, true)
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1, strikeouts: 1,
          })
          return {
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, true) : {}),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      recordError: () =>
        set((s) => {
          const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
          const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
          // エラー: 打者→1塁、ランナー1塁ずつ進塁（フォース進塁）
          const { runners, runnerIndices, runnerResponsiblePitcher, runsScored, scoredPitcherKeys } = advanceRunners(s, 1, true)
          const errorPatch = defTeam === 'away'
            ? { awayErrors: s.awayErrors + 1 }
            : { homeErrors: s.homeErrors + 1 }
          const statPatch = updateBatterStats(s, {
            plateAppearances: 1, atBats: 1,
            ...(runsScored > 0 ? { rbi: runsScored } : {}),
          })
          return {
            ...errorPatch,
            ...statPatch,
            ...addScoreRuns(s, runsScored),
            // エラーによる得点は非自責点（earned=false）
            ...(runsScored > 0 ? distributePitcherRunsPatch(s, scoredPitcherKeys, false) : {}),
            runners, runnerIndices, runnerResponsiblePitcher,
            pitchCount: s.pitchCount + 1,
            lastBatterIndex: currentBatterIdx,
            ...advanceBatterPatch(s),
          }
        }),

      addError: (team) =>
        set((s) => team === 'away'
          ? { awayErrors: s.awayErrors + 1 }
          : { homeErrors: s.homeErrors + 1 }),

      setHits: (team, count) =>
        set(team === 'away' ? { awayHits: count } : { homeHits: count }),

      setErrors: (team, count) =>
        set(team === 'away' ? { awayErrors: count } : { homeErrors: count }),

      setLineup: (team, lineup) =>
        set((s) => {
          const key = team === 'away' ? 'awayLineup' : 'homeLineup'
          const GAME_STAT_FIELDS = [
            'gameAtBats', 'gameWalks', 'gameHitByPitch', 'gameSacFlies',
            'gameSacBunts', 'gameSingles', 'gameDoubles', 'gameTriples', 'gameHomeRuns',
          ] as const
          const processedLineup = lineup.map((player) => {
            const bKey = player.number ? `${team}-${player.number}` : null
            const existingBGS: BatterGameStats | null = bKey
              ? (s.batterGameStats?.[bKey] ?? null)
              : null
            const gameStatOverride: Partial<LineupPlayer> = {}
            for (const field of GAME_STAT_FIELDS) {
              gameStatOverride[field] = existingBGS
                ? (existingBGS[field as keyof BatterGameStats] as number)
                : undefined
            }
            const newPlayer = { ...player, ...gameStatOverride }
            Object.assign(newPlayer, computeLiveBattingStats(newPlayer))
            return newPlayer
          })
          return { [key]: processedLineup }
        }),

      setLineupPlayer: (team, index, player) =>
        set((s) => {
          const key = team === 'away' ? 'awayLineup' : 'homeLineup'
          const lineup = [...s[key]]

          // batterGameStats（選手キーの正本）から game* を取得して適用
          // - 成績あり→ lineup player に反映（打順変更でも自動引き継ぎ）
          // - 成績なし→ game* を undefined にリセット（新規選手交代）
          const bKey = player.number ? `${team}-${player.number}` : null
          const existingBGS: BatterGameStats | null = bKey
            ? (s.batterGameStats?.[bKey] ?? null)
            : null

          const GAME_STAT_FIELDS = [
            'gameAtBats', 'gameWalks', 'gameHitByPitch', 'gameSacFlies',
            'gameSacBunts', 'gameSingles', 'gameDoubles', 'gameTriples', 'gameHomeRuns',
          ] as const

          const gameStatOverride: Partial<LineupPlayer> = {}
          for (const field of GAME_STAT_FIELDS) {
            gameStatOverride[field] = existingBGS
              ? (existingBGS[field as keyof BatterGameStats] as number)
              : undefined
          }

          const newPlayer = { ...player, ...gameStatOverride }
          Object.assign(newPlayer, computeLiveBattingStats(newPlayer))
          lineup[index] = newPlayer

          return { [key]: lineup }
        }),

      selectBatter: (team, index) =>
        set((s) => {
          const key = team === 'away' ? 'awayLineup' : 'homeLineup'
          const player = s[key][index]
          if (!player) return s

          // 10番目（index 9）は投手 → 投手として登録
          if (index === 9) {
            // 同じ投手が既に登板中なら何もしない
            if (s.pitcher.number === player.number && s.pitcher.name === player.name) {
              return s
            }
            const pitcherInfo: PlayerInfo = {
              name: player.name,
              number: player.number,
              stat: player.record || '',
              statLabel: player.appearances ? `${player.appearances}登板` : '',
            }
            // 投手履歴を更新
            const historyPatch = registerPitcherAppearance(s, team, player.name, player.number)
            // 投手交代: 投球数の保存・復元
            const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
            const prevKey = `${defTeam}-${s.pitcher.number}`
            const newKey  = `${defTeam}-${player.number}`
            const prevStats = s.pitcherStats ?? {}
            const pitcherStats = s.pitcher.number
              ? { ...prevStats, [prevKey]: s.pitchCount }
              : { ...prevStats }
            const restoredPitchCount = pitcherStats[newKey] ?? 0
            return {
              pitcher: pitcherInfo,
              pitchCount: restoredPitchCount,
              pitcherStats,
              ...historyPatch,
            }
          }

          const idxKey = team === 'away' ? 'awayBatterIndex' : 'homeBatterIndex'
          return {
            [idxKey]: index,
            batter: {
              name: player.name,
              number: player.number,
              stat: formatBatterStat(player, s.statDisplaySettings),
              statLabel: '',
            },
          }
        }),

      nextBatter: () =>
        set((s) => {
          const isAway = s.currentHalf === 'top'
          const key = isAway ? 'awayLineup' : 'homeLineup'
          const idxKey = isAway ? 'awayBatterIndex' : 'homeBatterIndex'
          const currentIdx = s[idxKey]
          const nextIdx = (currentIdx + 1) % 9  // 1-9番のみ巡回（10番目=投手は除外）
          const player = s[key][nextIdx]
          if (!player) return s
          return {
            [idxKey]: nextIdx,
            batter: {
              name: player.name,
              number: player.number,
              stat: formatBatterStat(player, s.statDisplaySettings),
              statLabel: '',
            },
            count: { ...s.count, balls: 0, strikes: 0 },
          }
        }),

      prevBatter: () =>
        set((s) => {
          const isAway = s.currentHalf === 'top'
          const key = isAway ? 'awayLineup' : 'homeLineup'
          const idxKey = isAway ? 'awayBatterIndex' : 'homeBatterIndex'
          const currentIdx = s[idxKey]
          const prevIdx = (currentIdx - 1 + 9) % 9
          const player = s[key][prevIdx]
          if (!player) return s
          return {
            [idxKey]: prevIdx,
            batter: {
              name: player.name,
              number: player.number,
              stat: formatBatterStat(player, s.statDisplaySettings),
              statLabel: '',
            },
          }
        }),

      addPlayLog: (text) =>
        set((s) => {
          const entry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            inning: s.currentInning,
            half: s.currentHalf,
            text,
          }
          return { playLog: [entry, ...s.playLog] }
        }),

      clearPlayLog: () => set({ playLog: [] }),

      setTeamName: (team, name, shortName) =>
        set((s) => {
          if (team === 'away') {
            return { awayTeam: { ...s.awayTeam, name, shortName } }
          }
          return { homeTeam: { ...s.homeTeam, name, shortName } }
        }),

      setGameOver: (over) => set({ isGameOver: over }),

      newGame: () => set((s) => ({
        ...initialGameState,
        overlayPositions: s.overlayPositions,
        overlayScale: s.overlayScale,
      })),

      replaceState: (state) => set(state),

      subtractBall: () =>
        set((s) => ({
          count: { ...s.count, balls: Math.max(0, s.count.balls - 1) },
          pitchCount: s.count.balls > 0 ? Math.max(0, s.pitchCount - 1) : s.pitchCount,
        })),

      subtractStrike: () =>
        set((s) => ({
          count: { ...s.count, strikes: Math.max(0, s.count.strikes - 1) },
          pitchCount: s.count.strikes > 0 ? Math.max(0, s.pitchCount - 1) : s.pitchCount,
        })),

      subtractOut: () =>
        set((s) => ({
          count: { ...s.count, outs: Math.max(0, s.count.outs - 1) },
        })),

      subtractRun: (team) =>
        set((s) => {
          const innings = [...s.innings]
          const currentIdx = innings.findIndex(
            (inn) => inn.inning === s.currentInning,
          )
          if (currentIdx === -1) return s

          const inn = { ...innings[currentIdx]! }
          const half = team === 'away' ? 'top' as const : 'bottom' as const
          const current = inn[half] ?? 0
          if (current <= 0) return s
          inn[half] = current - 1
          innings[currentIdx] = inn

          return recalcTotals({ ...extractGameState(s), innings })
        }),

      addPitch: () => set((s) => ({ pitchCount: s.pitchCount + 1 })),

      setPitchCount: (n) => set({ pitchCount: n }),

      startGameTimer: () => set({ gameStartTime: Date.now(), showWaitingScreen: false }),

      stopGameTimer: () => set({ gameStartTime: null }),

      setTicker: (text) => set({ ticker: text }),

      triggerEffect: (type) => {
        // 前回のタイマーをクリアして多重発火を防止
        if (_effectTimer) { clearTimeout(_effectTimer); _effectTimer = null }
        if (type) {
          set({ activeEffect: type, effectTimestamp: Date.now() })
          _effectTimer = setTimeout(() => {
            _effectTimer = null
            set({ activeEffect: null, effectTimestamp: 0 })
          }, EFFECT_DURATION_MS)
        } else {
          set({ activeEffect: null, effectTimestamp: 0 })
        }
      },

      setTeamColor: (team, color) =>
        set((s) => {
          if (team === 'away') {
            return { awayTeam: { ...s.awayTeam, color } }
          }
          return { homeTeam: { ...s.homeTeam, color } }
        }),

      rewindInning: () =>
        set((s) => {
          const clearRunners = {
            count: { balls: 0, strikes: 0, outs: 0 },
            runners: { first: false, second: false, third: false },
            runnerIndices: { first: null, second: null, third: null },
            runnerResponsiblePitcher: { first: null, second: null, third: null } as RunnerResponsiblePitcher,
          }
          if (s.currentHalf === 'bottom') {
            return { ...clearRunners, currentHalf: 'top' as const }
          }
          if (s.currentInning <= 1) return s
          return {
            ...clearRunners,
            currentInning: s.currentInning - 1,
            currentHalf: 'bottom' as const,
          }
        }),

      setShowMascot: (show) => set({ showMascot: show }),

      setMascotMode: (mode) => set({ mascotMode: mode }),

      setMascotImage: (mode, dataUrl) =>
        set((s) => {
          const mascotImages = { ...s.mascotImages }
          if (dataUrl) {
            mascotImages[mode] = dataUrl
          } else {
            delete mascotImages[mode]
          }
          return { mascotImages }
        }),

      setAutoChangeEffect: (on) => set({ autoChangeEffect: on }),

      setShowWaitingScreen: (show) => set({ showWaitingScreen: show }),

      setOverlayPosition: (id, pos) =>
        set((s) => ({
          overlayPositions: { ...s.overlayPositions, [id]: pos },
        })),

      resetOverlayPositions: () =>
        set({ overlayPositions: { ...DEFAULT_OVERLAY_POSITIONS } }),

      setOverlayScale: (scale) =>
        set({ overlayScale: Math.max(0.5, Math.min(3, scale)) }),

      setLineupDisplayTeam: (team) => set({ lineupDisplayTeam: team }),

      setLineupPlayerGameStats: (team, index, stats) =>
        set((s) => {
          const lineupKey = team === 'away' ? 'awayLineup' : 'homeLineup'
          const lineup = [...s[lineupKey]]
          const player = { ...lineup[index]! }
          const bKey = player.number ? `${team}-${player.number}` : null

          const gameStats: BatterGameStats = {
            gameAtBats:     stats.gameAtBats,
            gameWalks:      stats.gameWalks,
            gameHitByPitch: stats.gameHitByPitch,
            gameSacFlies:   stats.gameSacFlies,
            gameSacBunts:   stats.gameSacBunts,
            gameSingles:    stats.gameSingles,
            gameDoubles:    stats.gameDoubles,
            gameTriples:    stats.gameTriples,
            gameHomeRuns:   stats.gameHomeRuns,
          }

          // lineup player に反映（ミラー）
          Object.assign(player, gameStats)
          // 通算成績＋試合内成績を合算して打率・OPS・出塁率・長打率を再計算
          Object.assign(player, computeLiveBattingStats(player))
          lineup[index] = player

          // batterGameStats（正本）を更新
          const newBatterGameStats = bKey
            ? { ...(s.batterGameStats ?? {}), [bKey]: gameStats }
            : (s.batterGameStats ?? {})

          return { [lineupKey]: lineup, batterGameStats: newBatterGameStats }
        }),

      setPitcherGameStats: (key, stats) =>
        set((s) => ({
          pitcherGameStats: { ...s.pitcherGameStats, [key]: stats },
        })),

      undo: () => {
        if (_undoHistory.length === 0) return
        _undoInProgress = true
        const prev = _undoHistory.pop()!
        rawSet({ ...prev, undoCount: _undoHistory.length })
        _undoInProgress = false
      },
    }
    },
    {
      name: 'yakyuu-game-state',
      storage: {
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name)
            if (raw) return JSON.parse(raw)
            // localStorage が空の場合 IndexedDB バックアップからの非同期復元をスケジュール
            // (getItem は同期 API なので初回は null を返し、復元完了後に replaceState する)
            if (!_preventPersistWrites) {
              restoreFromIDB().then((backup) => {
                if (backup) {
                  try {
                    const parsed = JSON.parse(backup)
                    const state = parsed.state
                    if (state) {
                      // localStorage に書き戻し + store を更新
                      localStorage.setItem(name, backup)
                      useGameStore.getState().replaceState(state)
                      console.info('Restored state from IndexedDB backup')
                    }
                  } catch { /* ignore */ }
                }
              })
            }
            return null
          } catch {
            // JSON 破損時はデータを削除して初期状態で起動（白画面防止）
            console.warn('Failed to parse localStorage — starting fresh')
            try { localStorage.removeItem(name) } catch { /* ignore */ }
            return null
          }
        },
        setItem: (name, value) => {
          if (_preventPersistWrites) return  // オーバーレイは書き込み禁止
          try {
            const raw = JSON.stringify(value)
            localStorage.setItem(name, raw)
            // IndexedDB にもバックアップ（非同期・失敗しても問題なし）
            backupToIDB(raw)
          } catch {
            // QuotaExceededError: 容量超過時は書き込みをスキップ
            console.warn('localStorage quota exceeded — state not persisted')
          }
        },
        removeItem: (name) => {
          if (_preventPersistWrites) return
          localStorage.removeItem(name)
        },
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<GameStore>
        return {
          ...current,
          ...p,
          // エフェクトは一時的な表示状態なので、リロード時にリセット
          activeEffect: null,
          effectTimestamp: 0,
          // 新しいデフォルト値を保持しつつ既存設定をマージ
          statDisplaySettings: {
            ...current.statDisplaySettings,
            ...(p.statDisplaySettings ?? {}),
          },
        }
      },
    },
  ),
)

// subscribe でstate変更時に自動ブロードキャスト（関数を含まないデータのみ送信）
useGameStore.subscribe((state) => {
  broadcastState(extractGameState(state))
})

/** 投手登板履歴を更新するパッチを生成する */
export function registerPitcherAppearance(
  s: GameState,
  team: 'away' | 'home',
  name: string,
  number: string,
): Partial<GameState> {
  const history = [...(s.pitcherHistory ?? [])]
  // 既にこの投手がこのチームの履歴にあるか
  const existing = history.find((h) => h.team === team && h.number === number)
  if (existing && existing.isActive) {
    // 既に登板中 → 何もしない
    return {}
  }
  // 前の登板中投手を非アクティブにする
  for (let i = 0; i < history.length; i++) {
    if (history[i]!.team === team && history[i]!.isActive) {
      history[i] = { ...history[i]!, isActive: false }
    }
  }
  if (existing) {
    // 既に履歴にあるが非アクティブ（再登板）→ アクティブに戻す
    const idx = history.indexOf(existing)
    history[idx] = { ...existing, isActive: true }
  } else {
    // 新規登板
    const teamHistory = history.filter((h) => h.team === team)
    history.push({
      name,
      number,
      team,
      order: teamHistory.length,
      isActive: true,
    })
  }
  return { pitcherHistory: history }
}

/** アウトプレー共通: outsToAdd 個アウト & 打者交代 & 投球数+1 & 打者成績更新 */
function applyOutPlay(s: GameState, outsToAdd: number): Partial<GameState> {
  const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
  const statPatch = updateBatterStats(s, {
    plateAppearances: 1,
    atBats: 1,
  })
  const pgsPatch = updatePitcherGameStatsPatch(s, { outsRecorded: outsToAdd })
  const newOuts = s.count.outs + outsToAdd
  const sWithPitch: GameState = { ...extractGameState(s), pitchCount: s.pitchCount + 1 }
  if (newOuts >= 3) {
    return { ...statPatch, ...advanceBatterPatch(s), ...advanceInningPatch(sWithPitch), ...pgsPatch }
  }
  const sWithOuts: GameState = { ...extractGameState(s), count: { ...s.count, outs: newOuts } }
  return { ...statPatch, ...advanceBatterPatch(sWithOuts), ...pgsPatch, pitchCount: s.pitchCount + 1, lastBatterIndex: currentBatterIdx }
}

/** 打者交代: 次の打者をセットし B/S カウントをリセット（アウト数は維持） */
function advanceBatterPatch(s: GameState): Partial<GameState> {
  const isAway = s.currentHalf === 'top'
  const key = isAway ? 'awayLineup' : 'homeLineup'
  const idxKey = isAway ? 'awayBatterIndex' : 'homeBatterIndex'
  const currentIdx = s[idxKey]
  const nextIdx = (currentIdx + 1) % 9
  const player = s[key][nextIdx]
  const countReset = { ...s.count, balls: 0, strikes: 0 }
  return {
    [idxKey]: nextIdx,
    batter: {
      name: player?.name || '',
      number: player?.number || '',
      stat: player?.name ? formatBatterStat(player, s.statDisplaySettings) : '',
      statLabel: '',
    },
    count: countReset,
  }
}

/** 四球・死球: 打者→一塁、フォースで走者押し出し、満塁なら得点 */
function applyWalk(s: GameState): Partial<GameState> & { _walkScoredPitcherKey?: string } {
  const { first, second, third } = s.runners
  const newRunners = { first: true, second, third }
  let runsScored = 0

  const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
  const currentPitcherKey = `${defTeam}-${s.pitcher.number}`

  // runnerIndices も押し出し路理で更新
  const currentBatterIdx = s.currentHalf === 'top' ? s.awayBatterIndex : s.homeBatterIndex
  const ri = s.runnerIndices ?? { first: null, second: null, third: null }
  const rrp = s.runnerResponsiblePitcher ?? { first: null, second: null, third: null }
  const newRI = { ...ri, first: currentBatterIdx }
  const newRRP = { ...rrp, first: currentPitcherKey }

  let walkScoredPitcherKey: string | undefined

  if (first) {
    newRunners.second = true
    newRI.second = ri.first
    newRRP.second = rrp.first ?? currentPitcherKey
    if (second) {
      newRunners.third = true
      newRI.third = ri.second
      newRRP.third = rrp.second ?? currentPitcherKey
      if (third) {
        // 満塁押し出し — 三塁走者が生還（ri.third は得点したので newRI には引き継がれない）
        runsScored = 1
        walkScoredPitcherKey = rrp.third ?? currentPitcherKey
      }
    }
  }

  const patch: Partial<GameState> & { _walkScoredPitcherKey?: string } = {
    count: { ...s.count, balls: 0, strikes: 0 },
    runners: newRunners,
    runnerIndices: newRI,
    runnerResponsiblePitcher: newRRP,
  }

  if (walkScoredPitcherKey) {
    patch._walkScoredPitcherKey = walkScoredPitcherKey
  }

  if (runsScored > 0) {
    const innings = [...s.innings]
    const idx = innings.findIndex((inn) => inn.inning === s.currentInning)
    if (idx !== -1) {
      const inn = { ...innings[idx]! }
      const half = s.currentHalf
      inn[half] = (inn[half] ?? 0) + runsScored
      innings[idx] = inn
      const totals = recalcTotals({ ...extractGameState(s), innings })
      patch.innings = totals.innings
      patch.awayTotal = totals.awayTotal
      patch.homeTotal = totals.homeTotal
    }
  }

  return patch
}

function advanceInningPatch(s: GameState): Partial<GameState> {
  // Bug#1: 投手の投球数を pitcherStats に保存し pitchCount をリセット
  const defTeam = s.currentHalf === 'top' ? 'home' : 'away'
  const pitcherKey = `${defTeam}-${s.pitcher.number}`
  const prevStats = s.pitcherStats ?? {}
  const pitcherStats = {
    ...prevStats,
    [pitcherKey]: s.pitchCount,
  }

  // Bug#2: 今終わったハーフのスコアが null なら 0 に確定
  const innings = [...s.innings]
  const currentIdx = innings.findIndex((inn) => inn.inning === s.currentInning)
  if (currentIdx !== -1) {
    const inn = { ...innings[currentIdx]! }
    if (s.currentHalf === 'top') {
      if (inn.top === null) inn.top = 0
    } else {
      if (inn.bottom === null) inn.bottom = 0
    }
    innings[currentIdx] = inn
  }

  // Bug#3: 攻守交代後の打者・投手を自動セット
  const newHalf = s.currentHalf === 'top' ? 'bottom' : 'top'
  const attackTeam = newHalf === 'top' ? 'away' : 'home'
  const newDefTeam  = newHalf === 'top' ? 'home' : 'away'

  const attackLineup = attackTeam === 'away' ? s.awayLineup : s.homeLineup
  const batterIdx    = attackTeam === 'away' ? s.awayBatterIndex : s.homeBatterIndex
  const batterPlayer = attackLineup[batterIdx]
  const newBatter: PlayerInfo = batterPlayer?.name
    ? {
        name: batterPlayer.name,
        number: batterPlayer.number,
        stat: formatBatterStat(batterPlayer),
        statLabel: '',
      }
    : { ...initialPlayerInfo }

  const defLineup = newDefTeam === 'away' ? s.awayLineup : s.homeLineup
  const pitcherPlayer = defLineup[9]
  const newPitcher: PlayerInfo = pitcherPlayer?.name
    ? {
        name: pitcherPlayer.name,
        number: pitcherPlayer.number,
        stat: pitcherPlayer.record || '',
        statLabel: pitcherPlayer.appearances ? `${pitcherPlayer.appearances}登板` : '',
      }
    : { ...initialPlayerInfo }

  // 新投手の累積投球数を pitcherStats から復元（未登場なら 0）
  const incomingKey = pitcherPlayer?.name ? `${newDefTeam}-${pitcherPlayer.number}` : null
  const restoredPitchCount = incomingKey ? (pitcherStats[incomingKey] ?? 0) : 0

  // 新投手を登板履歴に登録
  const historyPatch = pitcherPlayer?.name
    ? registerPitcherAppearance(s, newDefTeam, pitcherPlayer.name, pitcherPlayer.number)
    : {}

  const resetState: Partial<GameState> = {
    count: { balls: 0, strikes: 0, outs: 0 },
    runners: { first: false, second: false, third: false },
    runnerIndices: { first: null, second: null, third: null },
    runnerResponsiblePitcher: { first: null, second: null, third: null },
    lastBatterIndex: null,
    pitchCount: restoredPitchCount,
    pitcherStats,
    batter: newBatter,
    pitcher: newPitcher,
    lineupDisplayTeam: attackTeam, // Bug#4
    ...historyPatch,
  }

  if (s.autoChangeEffect) {
    resetState.activeEffect = 'change'
    resetState.effectTimestamp = Date.now()
    // 前回のタイマーをクリアして多重発火を防止
    if (_effectTimer) { clearTimeout(_effectTimer); _effectTimer = null }
    _effectTimer = setTimeout(() => {
      _effectTimer = null
      useGameStore.setState({ activeEffect: null, effectTimestamp: 0 })
    }, EFFECT_DURATION_MS)
  }

  if (s.currentHalf === 'top') {
    return { ...resetState, currentHalf: 'bottom' as const, innings }
  }

  const nextInning = s.currentInning + 1
  if (!innings.find((inn) => inn.inning === nextInning)) {
    innings.push({ inning: nextInning, top: null, bottom: null })
  }

  return {
    ...resetState,
    currentInning: nextInning,
    currentHalf: 'top' as const,
    innings,
  }
}
