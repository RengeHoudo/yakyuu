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
