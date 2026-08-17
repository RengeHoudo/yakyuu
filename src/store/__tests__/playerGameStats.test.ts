/**
 * 選手の試合内成績編集機能テスト
 *
 * 仕様:
 * - 打者: LineupPlayer の game* フィールドで試合内成績を管理
 * - 投手: pitcherGameStats で試合内成績を管理 (既存)
 * - setLineupPlayerGameStats: 打者の試合内成績を直接セット
 * - setPitcherGameStats: 投手の試合内成績を直接セット
 * - 守備位置変更・打順変更をしても試合内成績が維持される
 * - 打率・OPS・出塁率・長打率は通算成績＋試合内成績を合算して再計算する
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialGameState } from '../../types'
import { useGameStore, clearUndoHistory } from '../useGameStore'
import type { LineupPlayer } from '../../types'
import { defaultPitcherGameStats } from '../../types'

vi.mock('../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const s = () => useGameStore.getState()

const BATTER: LineupPlayer = {
  order: 1,
  name: '山田 太郎',
  number: '3',
  position: '左',
  battingAvg: '.278',
  homeRuns: '10',
  rbi: '30',
  ops: '.800',
}

/** 通算成績（詳細フィールドあり）を持つ選手 */
const BATTER_WITH_DETAIL: LineupPlayer = {
  order: 1,
  name: '山田 太郎',
  number: '3',
  position: '左',
  // 基本表示用（NPBから取得した通算値）
  battingAvg: '.300',
  homeRuns: '5',
  rbi: '20',
  ops: '.823',
  onBasePct: '.373',
  sluggingPct: '.450',
  // 詳細成績（計算の元になる生数値）
  atBats:         '200',
  hits:           '60',
  doubles:        '10',
  triples:        '2',
  totalBases:     '90',  // 43×1 + 10×2 + 2×3 + 5×4 = 89 だが NPB 表記で 90
  walks:          '20',
  hitByPitch:     '5',
  sacrificeFlies: '3',
}

beforeEach(() => {
  localStorage.clear()
  clearUndoHistory()
  useGameStore.setState({
    ...initialGameState,
    autoChangeEffect: false,
    pitchCount: 0,
    awayLineup: [BATTER, ...initialGameState.awayLineup.slice(1)],
  })
})

afterEach(() => {
  vi.clearAllTimers()
})

// ─────────────────────────────────────────────
// 打者: setLineupPlayerGameStats
// ─────────────────────────────────────────────

describe('setLineupPlayerGameStats – 打撃成績の直接編集', () => {
  it('打者の試合内成績をセットできる', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    const player = s().awayLineup[0]!
    expect(player.gameAtBats).toBe(3)
    expect(player.gameWalks).toBe(1)
    expect(player.gameSingles).toBe(1)
    expect(player.gameDoubles).toBe(1)
  })

  it('全0の初期値から設定できる', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 0,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 0,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    const player = s().awayLineup[0]!
    expect(player.gameAtBats).toBe(0)
    expect(player.gameSingles).toBe(0)
  })

  it('homeチームの打者にも設定できる', () => {
    s().setLineupPlayerGameStats('home', 2, {
      gameAtBats: 4,
      gameWalks: 0,
      gameHitByPitch: 1,
      gameSacFlies: 0,
      gameSacBunts: 1,
      gameSingles: 2,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 1,
    })
    const player = s().homeLineup[2]!
    expect(player.gameAtBats).toBe(4)
    expect(player.gameHitByPitch).toBe(1)
    expect(player.gameHomeRuns).toBe(1)
  })

  it('他の打者の成績は変更されない', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    const player1 = s().awayLineup[1]!
    expect(player1.gameAtBats).toBeUndefined()
  })

  it('既存のシーズン成績（battingAvg等）は変更されない', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 4,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    const player = s().awayLineup[0]!
    // homeRuns・rbi は計算式で求まらないため変更されない
    expect(player.homeRuns).toBe('10')
    expect(player.rbi).toBe('30')
    // battingAvg・ops は通算＋試合内成績で再計算される（変更あり）
    // BATTER は atBats/hits 詳細なし → 試合内成績のみ: 4AB 1H → .250
    expect(player.battingAvg).toBe('.250')
  })
})

// ─────────────────────────────────────────────
// 打者: 守備位置変更しても試合内成績が維持される
// ─────────────────────────────────────────────

describe('打順変更・守備位置変更後も試合内成績が維持される', () => {
  it('setLineupPlayer で守備位置変更しても gameAtBats が保持される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    // 守備位置だけ変更
    const current = s().awayLineup[0]!
    s().setLineupPlayer('away', 0, { ...current, position: '中' })

    const player = s().awayLineup[0]!
    expect(player.position).toBe('中')
    expect(player.gameAtBats).toBe(3)
    expect(player.gameSingles).toBe(1)
    expect(player.gameWalks).toBe(1)
  })
})

// ─────────────────────────────────────────────
// 選手交代時の試合内成績リセット
// ─────────────────────────────────────────────

describe('選手交代時の試合内成績リセット', () => {
  it('異なる選手に交代した場合、試合内成績がリセットされる', () => {
    // まず山田太郎(3番)の試合内成績をセット
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })

    // 山田太郎から鈴木花子(7番)に交代
    const newPlayer: LineupPlayer = {
      order: 1,
      name: '鈴木 花子',
      number: '7',
      position: '右',
      battingAvg: '.250',
    }
    s().setLineupPlayer('away', 0, newPlayer)

    const player = s().awayLineup[0]!
    expect(player.name).toBe('鈴木 花子')
    expect(player.number).toBe('7')
    // 交代後は前の選手の成績がリセットされる
    expect(player.gameAtBats).toBeUndefined()
    expect(player.gameWalks).toBeUndefined()
    expect(player.gameSingles).toBeUndefined()
    expect(player.gameDoubles).toBeUndefined()
  })

  it('選手交代後も通算成績（battingAvg等）は新選手のものが使われる', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 1,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })

    const newPlayer: LineupPlayer = {
      order: 1,
      name: '鈴木 花子',
      number: '7',
      position: '右',
      battingAvg: '.350',
      homeRuns: '5',
      rbi: '20',
    }
    s().setLineupPlayer('away', 0, newPlayer)

    const player = s().awayLineup[0]!
    // 新選手の通算成績が使われる
    expect(player.battingAvg).toBe('.350')
    expect(player.homeRuns).toBe('5')
    expect(player.rbi).toBe('20')
  })
})

// ─────────────────────────────────────────────
// 同一選手の打順変更時、試合内成績が引き継がれる（batterGameStats で管理）
// ─────────────────────────────────────────────

describe('同一選手の打順変更時、試合内成績が引き継がれる', () => {
  it('1番から3番へ打順変更した場合、試合内成績が3番に引き継がれる', () => {
    // 山田太郎(3番)が1番打者として試合内成績を持つ
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 2,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })

    // 山田太郎を3番打順(index 2)にセット（打順変更）
    // batterGameStats['away-3'] に成績が保存されているため、
    // setLineupPlayer が自動的に反映する
    const playerWithoutGameStats: LineupPlayer = {
      order: 3,
      name: '山田 太郎',
      number: '3',
      position: '左',
      battingAvg: '.278',
    }
    s().setLineupPlayer('away', 2, playerWithoutGameStats)

    // 3番打順の選手に batterGameStats の試合内成績が反映される
    const playerAt2 = s().awayLineup[2]!
    expect(playerAt2.name).toBe('山田 太郎')
    expect(playerAt2.gameAtBats).toBe(3)
    expect(playerAt2.gameWalks).toBe(1)
    expect(playerAt2.gameSingles).toBe(2)
  })

  it('別の打順に同一選手を配置しても batterGameStats の成績が引き継がれる', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 2, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 1,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })

    s().setLineupPlayer('away', 4, {
      order: 5,
      name: '山田 太郎',
      number: '3',
      position: '左',
      battingAvg: '.278',
    })

    // index 4 の山田太郎は batterGameStats['away-3'] の成績を持つ
    const playerAt4 = s().awayLineup[4]!
    expect(playerAt4.gameAtBats).toBe(2)
    expect(playerAt4.gameSingles).toBe(1)
  })
})

// ─────────────────────────────────────────────
// batterGameStats: 選手IDに紐づく成績管理
// ─────────────────────────────────────────────

describe('batterGameStats – 選手IDに紐づく成績管理', () => {
  it('setLineupPlayerGameStats で batterGameStats["away-3"] が更新される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 1,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 2,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })

    const bgs = s().batterGameStats?.['away-3']
    expect(bgs).toBeDefined()
    expect(bgs!.gameAtBats).toBe(3)
    expect(bgs!.gameWalks).toBe(1)
    expect(bgs!.gameSingles).toBe(2)
  })

  it('setLineupPlayer で batterGameStats の成績が lineup player に反映される', () => {
    // まず batterGameStats に成績をセット
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 4, gameWalks: 2, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 1,
      gameDoubles: 1, gameTriples: 0, gameHomeRuns: 0,
    })

    // 同じ選手を別位置にセットすると batterGameStats が自動反映
    s().setLineupPlayer('away', 5, {
      order: 6,
      name: '山田 太郎',
      number: '3',
      position: '中',
      battingAvg: '.278',
    })

    const player = s().awayLineup[5]!
    expect(player.gameAtBats).toBe(4)
    expect(player.gameWalks).toBe(2)
    expect(player.gameSingles).toBe(1)
    expect(player.gameDoubles).toBe(1)
  })

  it('batterGameStats に成績がない選手を配置すると game* は undefined になる', () => {
    // 先に山田太郎に成績をセット
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3, gameWalks: 1, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 1,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })

    // 鈴木花子(7番)は batterGameStats に成績なし
    s().setLineupPlayer('away', 0, {
      order: 1,
      name: '鈴木 花子',
      number: '7',
      position: '右',
      battingAvg: '.300',
    })

    const player = s().awayLineup[0]!
    expect(player.name).toBe('鈴木 花子')
    expect(player.gameAtBats).toBeUndefined()
    expect(player.gameSingles).toBeUndefined()
    expect(player.gameWalks).toBeUndefined()
  })

  it('異なるチームの同一背番号は別々に管理される', () => {
    // away-3 と home-3 は別の選手
    useGameStore.setState({
      ...initialGameState,
      autoChangeEffect: false,
      pitchCount: 0,
      awayLineup: [{ ...BATTER, order: 1 }, ...initialGameState.awayLineup.slice(1)],
      homeLineup: [{ ...BATTER, order: 1 }, ...initialGameState.homeLineup.slice(1)],
    })

    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 1,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })
    s().setLineupPlayerGameStats('home', 0, {
      gameAtBats: 5, gameWalks: 1, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 2,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })

    expect(s().batterGameStats?.['away-3']?.gameAtBats).toBe(3)
    expect(s().batterGameStats?.['home-3']?.gameAtBats).toBe(5)
  })
})

// ─────────────────────────────────────────────
// batterSituationalGameStats: 走者状況別の試合内打数・安打数
// ─────────────────────────────────────────────

describe('batterSituationalGameStats – 走者状況別の試合内成績', () => {
  function setCurrentBatter(runners: { first: boolean; second: boolean; third: boolean }) {
    useGameStore.setState({
      currentHalf: 'top',
      awayBatterIndex: 0,
      batter: { name: BATTER.name, number: BATTER.number, stat: '', statLabel: '' },
      runners,
    })
  }

  it('1-3塁で単打を記録すると、打席前の1st+3rdへ打数1・安打1を加算する', () => {
    setCurrentBatter({ first: true, second: false, third: true })

    s().recordSingle()

    expect(s().batterSituationalGameStats['away-3']?.['1st+3rd']).toEqual({ atBats: 1, hits: 1 })
  })

  it('2塁でゴロアウトを記録すると、2ndへ打数だけを加算する', () => {
    setCurrentBatter({ first: false, second: true, third: false })

    s().recordGroundout()

    expect(s().batterSituationalGameStats['away-3']?.['2nd']).toEqual({ atBats: 1, hits: 0 })
  })

  it('同じ打者の同じ状況で単打とアウトを記録すると累積する', () => {
    setCurrentBatter({ first: false, second: true, third: true })
    s().recordSingle()
    setCurrentBatter({ first: false, second: true, third: true })
    s().recordFlyout()

    expect(s().batterSituationalGameStats['away-3']?.['2nd+3rd']).toEqual({ atBats: 2, hits: 1 })
  })

  it('四球と犠打は打数にならないため状況別打率を変更しない', () => {
    setCurrentBatter({ first: false, second: true, third: false })
    s().recordWalk()
    setCurrentBatter({ first: false, second: true, third: false })
    s().recordSacrificeBunt()

    expect(s().batterSituationalGameStats['away-3']).toBeUndefined()
  })

  it('Undoで直前の状況別成績も戻る', () => {
    setCurrentBatter({ first: true, second: true, third: false })
    clearUndoHistory()
    s().recordDouble()
    expect(s().batterSituationalGameStats['away-3']?.['1st+2nd']).toEqual({ atBats: 1, hits: 1 })

    s().undo()

    expect(s().batterSituationalGameStats['away-3']).toBeUndefined()
  })

  it('新しい試合を開始すると状況別成績をリセットする', () => {
    setCurrentBatter({ first: false, second: false, third: false })
    s().recordHomeRun()
    expect(s().batterSituationalGameStats['away-3']?.Empty).toEqual({ atBats: 1, hits: 1 })

    s().newGame()

    expect(s().batterSituationalGameStats).toEqual({})
  })
})

// ─────────────────────────────────────────────
// 左右別・カウント別の試合内打数・安打数
// ─────────────────────────────────────────────

describe('batter split game stats – 投手左右別・カウント別', () => {
  function setPlateAppearance(
    count: { balls: number; strikes: number },
    throwHand?: 'L' | 'R',
  ) {
    useGameStore.setState({
      currentHalf: 'top',
      awayBatterIndex: 0,
      batter: { name: BATTER.name, number: BATTER.number, stat: '', statLabel: '' },
      pitcher: { name: '相手投手', number: '18', stat: '', statLabel: '', throwHand },
      count: { ...count, outs: 0 },
    })
  }

  it('2-1で右投手から単打を記録すると、対右と2-1へ打数1・安打1を加算する', () => {
    setPlateAppearance({ balls: 2, strikes: 1 }, 'R')

    s().recordSingle()

    expect(s().batterPitcherHandGameStats['away-3']?.R).toEqual({ atBats: 1, hits: 1 })
    expect(s().batterCountGameStats['away-3']?.['2-1']).toEqual({ atBats: 1, hits: 1 })
  })

  it('ラインナップから登板させた投手の利き腕を現在投手へ引き継ぐ', () => {
    const homeLineup = [...initialGameState.homeLineup]
    homeLineup[9] = {
      ...homeLineup[9]!,
      name: '左投手',
      number: '21',
      position: '投',
      throwHand: 'L',
    }
    useGameStore.setState({ currentHalf: 'top', homeLineup })

    s().selectBatter('home', 9)

    expect(s().pitcher).toMatchObject({ name: '左投手', number: '21', throwHand: 'L' })
  })

  it('3-2で左投手からゴロを記録すると、対左と3-2へ打数だけを加算する', () => {
    setPlateAppearance({ balls: 3, strikes: 2 }, 'L')

    s().recordGroundout()

    expect(s().batterPitcherHandGameStats['away-3']?.L).toEqual({ atBats: 1, hits: 0 })
    expect(s().batterCountGameStats['away-3']?.['3-2']).toEqual({ atBats: 1, hits: 0 })
  })

  it('投手の利き腕が不明でもカウント別だけは更新する', () => {
    setPlateAppearance({ balls: 3, strikes: 0 })

    s().recordDouble()

    expect(s().batterPitcherHandGameStats['away-3']).toBeUndefined()
    expect(s().batterCountGameStats['away-3']?.['3-0']).toEqual({ atBats: 1, hits: 1 })
  })

  it('四球は左右別・カウント別の打率を変更しない', () => {
    setPlateAppearance({ balls: 3, strikes: 2 }, 'R')

    s().recordWalk()

    expect(s().batterPitcherHandGameStats['away-3']).toBeUndefined()
    expect(s().batterCountGameStats['away-3']).toBeUndefined()
  })

  it('Undoと新しい試合で左右別・カウント別成績も戻る', () => {
    setPlateAppearance({ balls: 0, strikes: 2 }, 'R')
    clearUndoHistory()
    s().addStrike()
    expect(s().batterPitcherHandGameStats['away-3']?.R).toEqual({ atBats: 1, hits: 0 })
    expect(s().batterCountGameStats['away-3']?.['0-2']).toEqual({ atBats: 1, hits: 0 })

    s().undo()
    expect(s().batterPitcherHandGameStats['away-3']).toBeUndefined()
    expect(s().batterCountGameStats['away-3']).toBeUndefined()

    setPlateAppearance({ balls: 1, strikes: 1 }, 'L')
    s().recordSingle()
    s().newGame()
    expect(s().batterPitcherHandGameStats).toEqual({})
    expect(s().batterCountGameStats).toEqual({})
  })
})

// ─────────────────────────────────────────────
// 投手: setPitcherGameStats
// ─────────────────────────────────────────────

describe('setPitcherGameStats – 投手試合内成績の直接編集', () => {
  it('投手の試合内成績をキーで直接セットできる', () => {
    const key = 'home-18'
    s().setPitcherGameStats(key, {
      ...defaultPitcherGameStats,
      pitchCount: 72,
      outsRecorded: 15,
      hitsAllowed: 5,
      walksAllowed: 2,
      earnedRunsAllowed: 1,
    })
    const gs = s().pitcherGameStats[key]
    expect(gs).toBeDefined()
    expect(gs!.pitchCount).toBe(72)
    expect(gs!.outsRecorded).toBe(15)
    expect(gs!.hitsAllowed).toBe(5)
    expect(gs!.earnedRunsAllowed).toBe(1)
  })

  it('既存の他の投手成績は上書きされない', () => {
    const key1 = 'home-18'
    const key2 = 'home-21'
    s().setPitcherGameStats(key1, { ...defaultPitcherGameStats, pitchCount: 50 })
    s().setPitcherGameStats(key2, { ...defaultPitcherGameStats, pitchCount: 30 })

    expect(s().pitcherGameStats[key1]!.pitchCount).toBe(50)
    expect(s().pitcherGameStats[key2]!.pitchCount).toBe(30)
  })
})

// ─────────────────────────────────────────────
// 打率・OPS・出塁率・長打率の合算再計算
// ─────────────────────────────────────────────

describe('setLineupPlayerGameStats – 通算＋試合内成績の合算再計算', () => {
  // 期待値の根拠:
  //   combined AB=203, H=62, TB=93, BB=20, HBP=5, SF=3
  //   battingAvg = 62/203 = 0.30541... → ".305"
  //   OBP        = (62+20+5)/(203+20+5+3) = 87/231 = 0.37662... → ".377"
  //   SLG        = 93/203 = 0.45812... → ".458"
  //   OPS        = 0.37662 + 0.45812 = 0.83474... → ".835"

  beforeEach(() => {
    useGameStore.setState({
      ...initialGameState,
      autoChangeEffect: false,
      pitchCount: 0,
      awayLineup: [BATTER_WITH_DETAIL, ...initialGameState.awayLineup.slice(1)],
    })
  })

  it('通算成績＋試合内成績(3打数2安打-単打1二塁打1)で打率が再計算される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.battingAvg).toBe('.305')
  })

  it('出塁率が合算再計算される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.onBasePct).toBe('.377')
  })

  it('長打率が合算再計算される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.sluggingPct).toBe('.458')
  })

  it('OPSが合算再計算される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 3,
      gameWalks: 0,
      gameHitByPitch: 0,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 1,
      gameDoubles: 1,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.ops).toBe('.835')
  })

  it('試合内成績が全て0のとき、通算成績のみで再計算される', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 0, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 0,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })
    // 200AB, 60H → .300
    expect(s().awayLineup[0]!.battingAvg).toBe('.300')
  })

  it('四球・死球も合算して出塁率に反映される', () => {
    // combined: AB=204, H=62, BB=21, HBP=6, SF=3
    // OBP = (62+21+6)/(204+21+6+3) = 89/234 = 0.38034... → ".380"
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 4,
      gameWalks: 1,
      gameHitByPitch: 1,
      gameSacFlies: 0,
      gameSacBunts: 0,
      gameSingles: 2,
      gameDoubles: 0,
      gameTriples: 0,
      gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.onBasePct).toBe('.380')
  })
})

describe('setLineupPlayerGameStats – シーズン詳細成績なし', () => {
  it('atBats等なし: 試合成績のみで打率を計算（4打数2安打 → .500）', () => {
    // BATTER は battingAvg='.278' のみで atBats/hits なし
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 4, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 2,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.battingAvg).toBe('.500')
  })

  it('atBats等なし: 試合成績が全0のとき元の battingAvg を保持', () => {
    s().setLineupPlayerGameStats('away', 0, {
      gameAtBats: 0, gameWalks: 0, gameHitByPitch: 0,
      gameSacFlies: 0, gameSacBunts: 0, gameSingles: 0,
      gameDoubles: 0, gameTriples: 0, gameHomeRuns: 0,
    })
    expect(s().awayLineup[0]!.battingAvg).toBe('.278')
  })
})
