/**
 * useGameStore ユニットテスト — 回帰テストベースライン
 *
 * 方針: 現状の挙動をそのまま記録する。バグも含めて「今の動作通り」にアサートし、
 *       後のバグ修正フェーズでテストを通すことで正しさを担保する。
 *
 * [バグ記録] のコメントが付いたテストは、既知の不具合を現状通りにアサートしている。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CARP_LINEUP, initialGameState, initialPlayerInfo } from '../../types'
import { useGameStore } from '../useGameStore'

vi.mock('../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

/** 現在のストア状態を取得するショートハンド */
const s = () => useGameStore.getState()

beforeEach(() => {
  localStorage.clear()
  // autoChangeEffect=false にしてタイマー副作用を除去してからリセット
  useGameStore.setState({ ...initialGameState, autoChangeEffect: false, pitchCount: 0 })
})

afterEach(() => {
  vi.clearAllTimers()
})

// ─────────────────────────────────────────────
// カウント管理 (Ball)
// ─────────────────────────────────────────────

describe('addBall', () => {
  it('1球: balls が 1 増え pitchCount が 1 増える', () => {
    s().addBall()
    expect(s().count.balls).toBe(1)
    expect(s().pitchCount).toBe(1)
  })

  it('2球連続: balls=2, pitchCount=2', () => {
    s().addBall()
    s().addBall()
    expect(s().count.balls).toBe(2)
    expect(s().pitchCount).toBe(2)
  })

  it('3球: balls=3', () => {
    s().addBall()
    s().addBall()
    s().addBall()
    expect(s().count.balls).toBe(3)
  })

  it('4球目（四球）: balls=0 にリセット、一塁走者がつく', () => {
    s().addBall()
    s().addBall()
    s().addBall()
    s().addBall()
    expect(s().count.balls).toBe(0)
    expect(s().runners.first).toBe(true)
    expect(s().pitchCount).toBe(4)
  })

  it('四球後も strikes はそのまま 0 に戻る', () => {
    s().addStrike()
    s().addBall()
    s().addBall()
    s().addBall()
    s().addBall()
    expect(s().count.strikes).toBe(0)
  })
})

// ─────────────────────────────────────────────
// カウント管理 (Strike)
// ─────────────────────────────────────────────

describe('addStrike', () => {
  it('1球: strikes が 1 増え pitchCount が 1 増える', () => {
    s().addStrike()
    expect(s().count.strikes).toBe(1)
    expect(s().pitchCount).toBe(1)
  })

  it('2球: strikes=2', () => {
    s().addStrike()
    s().addStrike()
    expect(s().count.strikes).toBe(2)
  })

  it('3球目（三振・アウト<2）: outs が 1 増え balls=0, strikes=0 にリセット', () => {
    useGameStore.setState({ count: { balls: 1, strikes: 2, outs: 0 }, pitchCount: 3 })
    s().addStrike()
    expect(s().count.outs).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().pitchCount).toBe(4)
  })

  it('3球目（三振・アウト=2）: advanceInning が発生する（count全リセット）', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 2, outs: 2 },
      currentHalf: 'top',
    })
    s().addStrike()
    // アウトカウントが3になってイニング進行 → ours=0, half=bottom
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
  })
})

// ─────────────────────────────────────────────
// カウント管理 (Out)
// ─────────────────────────────────────────────

describe('addOut', () => {
  it('1アウト: outs=1, balls=0, strikes=0', () => {
    useGameStore.setState({ count: { balls: 2, strikes: 1, outs: 0 } })
    s().addOut()
    expect(s().count.outs).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('2アウト: outs=2', () => {
    s().addOut()
    s().addOut()
    expect(s().count.outs).toBe(2)
  })

  it('3アウト: advanceInning が発生する（count全リセット）', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 0, outs: 2 },
      currentHalf: 'top',
    })
    s().addOut()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
  })
})

// ─────────────────────────────────────────────
// カウント管理 (subtract/reset)
// ─────────────────────────────────────────────

describe('subtractBall', () => {
  it('balls が 1 減る', () => {
    useGameStore.setState({ count: { balls: 2, strikes: 0, outs: 0 } })
    s().subtractBall()
    expect(s().count.balls).toBe(1)
  })

  it('balls=0 のとき 0 未満にならない', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 0, outs: 0 } })
    s().subtractBall()
    expect(s().count.balls).toBe(0)
  })
})

describe('subtractStrike', () => {
  it('strikes が 1 減る', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 2, outs: 0 } })
    s().subtractStrike()
    expect(s().count.strikes).toBe(1)
  })

  it('strikes=0 のとき 0 未満にならない', () => {
    s().subtractStrike()
    expect(s().count.strikes).toBe(0)
  })
})

describe('subtractOut', () => {
  it('outs が 1 減る', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 0, outs: 2 } })
    s().subtractOut()
    expect(s().count.outs).toBe(1)
  })

  it('outs=0 のとき 0 未満にならない', () => {
    s().subtractOut()
    expect(s().count.outs).toBe(0)
  })
})

describe('resetCount', () => {
  it('balls と strikes が 0 になる', () => {
    useGameStore.setState({ count: { balls: 3, strikes: 2, outs: 1 } })
    s().resetCount()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('outs は変わらない', () => {
    useGameStore.setState({ count: { balls: 2, strikes: 1, outs: 2 } })
    s().resetCount()
    expect(s().count.outs).toBe(2)
  })
})

// ─────────────────────────────────────────────
// イニング進行 (advanceInning)
// ─────────────────────────────────────────────

describe('advanceInning', () => {
  it('1回表 → 1回裏: currentHalf=bottom, currentInning=1 のまま', () => {
    useGameStore.setState({ currentInning: 1, currentHalf: 'top' })
    s().advanceInning()
    expect(s().currentHalf).toBe('bottom')
    expect(s().currentInning).toBe(1)
  })

  it('1回裏 → 2回表: currentHalf=top, currentInning=2', () => {
    useGameStore.setState({ currentInning: 1, currentHalf: 'bottom' })
    s().advanceInning()
    expect(s().currentHalf).toBe('top')
    expect(s().currentInning).toBe(2)
  })

  it('9回裏 → 10回表（延長）: currentInning=10', () => {
    useGameStore.setState({ currentInning: 9, currentHalf: 'bottom' })
    s().advanceInning()
    expect(s().currentInning).toBe(10)
    expect(s().currentHalf).toBe('top')
  })

  it('2回裏→3回表: innings 配列に 3回エントリが追加される', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'bottom',
      innings: [
        { inning: 1, top: 0, bottom: 1 },
        { inning: 2, top: 2, bottom: null },
      ],
    })
    s().advanceInning()
    const inn3 = s().innings.find((i) => i.inning === 3)
    expect(inn3).toBeDefined()
    expect(inn3?.top).toBeNull()
    expect(inn3?.bottom).toBeNull()
  })

  it('カウントが全リセットされる', () => {
    useGameStore.setState({ count: { balls: 3, strikes: 2, outs: 2 } })
    s().advanceInning()
    expect(s().count).toEqual({ balls: 0, strikes: 0, outs: 0 })
  })

  it('走者が全クリアされる', () => {
    useGameStore.setState({ runners: { first: true, second: true, third: true } })
    s().advanceInning()
    expect(s().runners).toEqual({ first: false, second: false, third: false })
  })

  it('advanceInning で pitchCount が 0 にリセットされる', () => {
    useGameStore.setState({ pitchCount: 87 })
    s().advanceInning()
    expect(s().pitchCount).toBe(0)
  })

  it('advanceInning 後 batter に新しい攻撃チームの打者がセットされる', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      homeBatterIndex: 0,
      currentHalf: 'top',
    })
    s().advanceInning() // top → bottom (home が攻撃)
    expect(s().batter.name).toBe(CARP_LINEUP[0]!.name)
  })

  it('advanceInning 後 lineupDisplayTeam が攻撃チームに更新される（top→bottom）', () => {
    useGameStore.setState({ currentHalf: 'top', lineupDisplayTeam: 'away' })
    s().advanceInning() // top → bottom (ホームが攻撃側になる)
    expect(s().lineupDisplayTeam).toBe('home')
  })

  it('無得点で表→裏に進むと top が 0 に確定される', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: null, bottom: null }],
    })
    s().advanceInning() // 無得点で表→裏
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(0)
  })

  it('無得点で裏→次イニング表に進むと bottom が 0 に確定される', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'bottom',
      innings: [{ inning: 1, top: 1, bottom: null }],
    })
    s().advanceInning() // 無得点で裏→次イニング表
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.bottom).toBe(0)
  })

  it('autoChangeEffect=true のとき activeEffect が "change" にセットされる', () => {
    useGameStore.setState({ autoChangeEffect: true })
    s().advanceInning()
    expect(s().activeEffect).toBe('change')
  })
})

// ─────────────────────────────────────────────
// イニング戻し (rewindInning)
// ─────────────────────────────────────────────

describe('rewindInning', () => {
  it('bottom → top（同イニング）', () => {
    useGameStore.setState({ currentInning: 3, currentHalf: 'bottom' })
    s().rewindInning()
    expect(s().currentHalf).toBe('top')
    expect(s().currentInning).toBe(3)
  })

  it('top（inning>1） → 前イニング bottom', () => {
    useGameStore.setState({ currentInning: 4, currentHalf: 'top' })
    s().rewindInning()
    expect(s().currentHalf).toBe('bottom')
    expect(s().currentInning).toBe(3)
  })

  it('1回表: 変化なし', () => {
    useGameStore.setState({ currentInning: 1, currentHalf: 'top' })
    s().rewindInning()
    expect(s().currentInning).toBe(1)
    expect(s().currentHalf).toBe('top')
  })

  it('rewindInning でカウント・走者がリセットされる', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'bottom',
      count: { balls: 2, strikes: 1, outs: 1 },
      runners: { first: true, second: false, third: false },
    })
    s().rewindInning()
    expect(s().count).toEqual({ balls: 0, strikes: 0, outs: 0 })
    expect(s().runners).toEqual({ first: false, second: false, third: false })
  })
})

// ─────────────────────────────────────────────
// 四球 (applyWalk) — addBall x4 経由
// ─────────────────────────────────────────────

describe('四球 (applyWalk via addBall x4)', () => {
  const walk = () => {
    s().addBall()
    s().addBall()
    s().addBall()
    s().addBall()
  }

  it('走者なし → 一塁走者がつく', () => {
    useGameStore.setState({ runners: { first: false, second: false, third: false } })
    walk()
    expect(s().runners).toEqual({ first: true, second: false, third: false })
  })

  it('一塁走者あり → 一・二塁走者がつく', () => {
    useGameStore.setState({ runners: { first: true, second: false, third: false } })
    walk()
    expect(s().runners).toEqual({ first: true, second: true, third: false })
  })

  it('一二塁走者あり → 一・二・三塁走者がつく', () => {
    useGameStore.setState({ runners: { first: true, second: true, third: false } })
    walk()
    expect(s().runners).toEqual({ first: true, second: true, third: true })
  })

  it('満塁 → 三塁走者が生還して得点が 1 増える', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: true },
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
    })
    walk()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
  })

  it('四球後: balls=0, strikes=0 にリセット', () => {
    walk()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('四球後: 次の打者に移行する', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
    })
    walk()
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })

  it('四球後: ラインアップ未設定でもクラッシュしない', () => {
    useGameStore.setState({ awayLineup: makeEmptyLineup() })
    expect(() => walk()).not.toThrow()
    expect(s().runners.first).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 得点管理
// ─────────────────────────────────────────────

describe('addRun', () => {
  it("addRun('away'): 現在イニングの top が +1 される", () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
    })
    s().addRun('away')
    expect(s().innings[0]?.top).toBe(1)
  })

  it("addRun('home'): 現在イニングの bottom が +1 される", () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'bottom',
      innings: [{ inning: 1, top: 0, bottom: 0 }],
    })
    s().addRun('home')
    expect(s().innings[0]?.bottom).toBe(1)
  })

  it('awayTotal が全イニングの合計と一致する', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'top',
      innings: [
        { inning: 1, top: 2, bottom: 1 },
        { inning: 2, top: 0, bottom: null },
      ],
      awayTotal: 2,
      homeTotal: 1,
    })
    s().addRun('away')
    expect(s().awayTotal).toBe(3)
    expect(s().homeTotal).toBe(1)
  })

  it('null のイニング top がある場合: null+1=1 になる', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: null, bottom: null }],
    })
    s().addRun('away')
    expect(s().innings[0]?.top).toBe(1)
  })
})

describe('subtractRun', () => {
  it("subtractRun('away'): 現在イニングの top が -1 される", () => {
    useGameStore.setState({
      currentInning: 1,
      innings: [{ inning: 1, top: 3, bottom: null }],
      awayTotal: 3,
    })
    s().subtractRun('away')
    expect(s().innings[0]?.top).toBe(2)
    expect(s().awayTotal).toBe(2)
  })

  it("subtractRun('home'): 現在イニングの bottom が -1 される", () => {
    useGameStore.setState({
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: 2 }],
      homeTotal: 2,
    })
    s().subtractRun('home')
    expect(s().innings[0]?.bottom).toBe(1)
    expect(s().homeTotal).toBe(1)
  })

  it('top=0 のとき変化なし（0未満にならない）', () => {
    useGameStore.setState({
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
    })
    s().subtractRun('away')
    expect(s().innings[0]?.top).toBe(0)
  })

  it('top=null のとき変化なし', () => {
    useGameStore.setState({
      currentInning: 1,
      innings: [{ inning: 1, top: null, bottom: null }],
    })
    s().subtractRun('away')
    expect(s().innings[0]?.top).toBeNull()
  })
})

describe('setInningScore', () => {
  it('指定イニング・halfのスコアを直接セットできる（top）', () => {
    useGameStore.setState({
      innings: [
        { inning: 1, top: 0, bottom: 0 },
        { inning: 2, top: null, bottom: null },
      ],
      awayTotal: 0,
      homeTotal: 0,
    })
    s().setInningScore(2, 'top', 5)
    expect(s().innings[1]?.top).toBe(5)
  })

  it('指定イニング・halfのスコアを直接セットできる（bottom）', () => {
    useGameStore.setState({
      innings: [{ inning: 1, top: 0, bottom: null }],
      homeTotal: 0,
    })
    s().setInningScore(1, 'bottom', 3)
    expect(s().innings[0]?.bottom).toBe(3)
  })

  it('セット後に awayTotal が再計算される', () => {
    useGameStore.setState({
      innings: [
        { inning: 1, top: 1, bottom: 0 },
        { inning: 2, top: 0, bottom: 0 },
      ],
      awayTotal: 1,
      homeTotal: 0,
    })
    s().setInningScore(2, 'top', 3)
    expect(s().awayTotal).toBe(4)
  })

  it('存在しないイニング番号のとき変化なし', () => {
    useGameStore.setState({
      innings: [{ inning: 1, top: 0, bottom: 0 }],
      awayTotal: 0,
    })
    s().setInningScore(99, 'top', 5)
    expect(s().awayTotal).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 安打・失策
// ─────────────────────────────────────────────

describe('addHit / setHits', () => {
  it("addHit('away'): awayHits が +1", () => {
    useGameStore.setState({ awayHits: 2 })
    s().addHit('away')
    expect(s().awayHits).toBe(3)
  })

  it("addHit('home'): homeHits が +1", () => {
    useGameStore.setState({ homeHits: 5 })
    s().addHit('home')
    expect(s().homeHits).toBe(6)
  })

  it('setHits: 直接セット', () => {
    s().setHits('away', 10)
    expect(s().awayHits).toBe(10)
  })
})

describe('addError / setErrors', () => {
  it("addError('away'): awayErrors が +1", () => {
    useGameStore.setState({ awayErrors: 0 })
    s().addError('away')
    expect(s().awayErrors).toBe(1)
  })

  it('setErrors: 直接セット', () => {
    s().setErrors('home', 3)
    expect(s().homeErrors).toBe(3)
  })
})

// ─────────────────────────────────────────────
// 打順管理
// ─────────────────────────────────────────────

describe('selectBatter', () => {
  it('1番打者（index=0）を選択: batter に選手情報がセットされ awayBatterIndex=0', () => {
    useGameStore.setState({ awayLineup: [...CARP_LINEUP] })
    s().selectBatter('away', 0)
    const batter = s().batter
    expect(batter.name).toBe('秋山 翔吾')
    expect(batter.number).toBe('55')
    expect(s().awayBatterIndex).toBe(0)
  })

  it('3番打者（index=2）を選択: batter に 3番の選手情報がセットされる', () => {
    useGameStore.setState({ awayLineup: [...CARP_LINEUP] })
    s().selectBatter('away', 2)
    expect(s().batter.name).toBe('小園 海斗')
    expect(s().awayBatterIndex).toBe(2)
  })

  it('10番目（index=9）は投手として登録される（batter は変わらない）', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      batter: { name: '秋山 翔吾', number: '55', stat: '', statLabel: '' },
    })
    s().selectBatter('away', 9)
    expect(s().pitcher.name).toBe('森下 暢仁')
    expect(s().pitcher.number).toBe('18')
    // batter は変わらない
    expect(s().batter.name).toBe('秋山 翔吾')
  })

  it('homeチームの打者を選択できる', () => {
    useGameStore.setState({ homeLineup: [...CARP_LINEUP] })
    s().selectBatter('home', 3)
    expect(s().batter.name).toBe('坂倉 将吾')
    expect(s().homeBatterIndex).toBe(3)
  })
})

describe('nextBatter', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      homeBatterIndex: 0,
      currentHalf: 'top', // away が攻撃中
    })
  })

  it('次の打者（index+1）になる', () => {
    s().nextBatter()
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe('野間 峻祥')
  })

  it('次の打者に変わると balls=0, strikes=0 にリセット', () => {
    useGameStore.setState({ count: { balls: 2, strikes: 1, outs: 1 } })
    s().nextBatter()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().count.outs).toBe(1) // outs はリセットされない
  })

  it('9番打者（index=8）から次に行くと 1番（index=0）に戻る', () => {
    useGameStore.setState({ awayBatterIndex: 8 })
    s().nextBatter()
    expect(s().awayBatterIndex).toBe(0)
  })

  it('bottom（home攻撃中）のとき homeBatterIndex が進む', () => {
    useGameStore.setState({ currentHalf: 'bottom', homeBatterIndex: 3 })
    s().nextBatter()
    expect(s().homeBatterIndex).toBe(4)
  })
})

describe('prevBatter', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 3,
      currentHalf: 'top',
    })
  })

  it('前の打者（index-1）になる', () => {
    s().prevBatter()
    expect(s().awayBatterIndex).toBe(2)
    expect(s().batter.name).toBe('小園 海斗')
  })

  it('1番打者（index=0）から前に行くと 9番（index=8）になる', () => {
    useGameStore.setState({ awayBatterIndex: 0 })
    s().prevBatter()
    expect(s().awayBatterIndex).toBe(8)
  })
})

// ─────────────────────────────────────────────
// 投手・打者の直接セット
// ─────────────────────────────────────────────

describe('setBatter / setPitcher', () => {
  it('setBatter: batter 情報が更新される', () => {
    const info = { name: 'テスト打者', number: '99', stat: '.300', statLabel: '' }
    s().setBatter(info)
    expect(s().batter).toEqual(info)
  })

  it('setPitcher: pitcher 情報が更新される', () => {
    const info = { name: 'テスト投手', number: '1', stat: '5勝3敗', statLabel: '15登板' }
    s().setPitcher(info)
    expect(s().pitcher).toEqual(info)
  })
})

// ─────────────────────────────────────────────
// 投球数
// ─────────────────────────────────────────────

describe('投球数', () => {
  it('addBall は pitchCount をインクリメントする', () => {
    useGameStore.setState({ pitchCount: 10 })
    s().addBall()
    expect(s().pitchCount).toBe(11)
  })

  it('addStrike は pitchCount をインクリメントする', () => {
    useGameStore.setState({ pitchCount: 20 })
    s().addStrike()
    expect(s().pitchCount).toBe(21)
  })

  it('addPitch は pitchCount をインクリメントする', () => {
    useGameStore.setState({ pitchCount: 5 })
    s().addPitch()
    expect(s().pitchCount).toBe(6)
  })

  it('setPitchCount: 直接セットできる', () => {
    s().setPitchCount(100)
    expect(s().pitchCount).toBe(100)
  })

  it('advanceInning で pitchCount が 0 にリセットされる（再掲: Bug#1-1）', () => {
    useGameStore.setState({ pitchCount: 87, currentHalf: 'top' })
    s().advanceInning()
    expect(s().pitchCount).toBe(0)
  })
})

// ─────────────────────────────────────────────
// プレーログ
// ─────────────────────────────────────────────

describe('playLog', () => {
  it('addPlayLog: エントリが先頭に追加される', () => {
    useGameStore.setState({ playLog: [], currentInning: 1, currentHalf: 'top' })
    s().addPlayLog('ヒット')
    expect(s().playLog).toHaveLength(1)
    expect(s().playLog[0]?.text).toBe('ヒット')
    expect(s().playLog[0]?.inning).toBe(1)
    expect(s().playLog[0]?.half).toBe('top')
  })

  it('2件追加すると新しいものが先頭に来る', () => {
    s().addPlayLog('1つ目')
    s().addPlayLog('2つ目')
    expect(s().playLog[0]?.text).toBe('2つ目')
  })

  it('clearPlayLog: 全件削除', () => {
    s().addPlayLog('a')
    s().addPlayLog('b')
    s().clearPlayLog()
    expect(s().playLog).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────
// チーム情報
// ─────────────────────────────────────────────

describe('setTeamName / setTeamColor', () => {
  it('setTeamName: awayTeam の name と shortName が更新される', () => {
    s().setTeamName('away', '読売ジャイアンツ', '巨人')
    expect(s().awayTeam.name).toBe('読売ジャイアンツ')
    expect(s().awayTeam.shortName).toBe('巨人')
    expect(s().awayTeam.color).toBe(initialGameState.awayTeam.color) // color は変わらない
  })

  it('setTeamColor: homeTeam の color が更新される', () => {
    s().setTeamColor('home', '#FF0000')
    expect(s().homeTeam.color).toBe('#FF0000')
  })
})

// ─────────────────────────────────────────────
// ゲーム管理
// ─────────────────────────────────────────────

describe('setGameOver', () => {
  it('isGameOver を true にできる', () => {
    s().setGameOver(true)
    expect(s().isGameOver).toBe(true)
  })

  it('isGameOver を false に戻せる', () => {
    useGameStore.setState({ isGameOver: true })
    s().setGameOver(false)
    expect(s().isGameOver).toBe(false)
  })
})

describe('newGame', () => {
  it('状態が初期状態にリセットされる', () => {
    useGameStore.setState({
      currentInning: 5,
      awayTotal: 3,
      homeTotal: 2,
      awayHits: 7,
    })
    s().newGame()
    expect(s().currentInning).toBe(1)
    expect(s().awayTotal).toBe(0)
    expect(s().homeTotal).toBe(0)
    expect(s().awayHits).toBe(0)
  })
})

// ─────────────────────────────────────────────
// オーバーレイスケール
// ─────────────────────────────────────────────

describe('setOverlayScale', () => {
  it('0.5 以上 3 以下の値を設定できる', () => {
    s().setOverlayScale(2.0)
    expect(s().overlayScale).toBe(2.0)
  })

  it('0.5 未満は 0.5 にクランプされる', () => {
    s().setOverlayScale(0.1)
    expect(s().overlayScale).toBe(0.5)
  })

  it('3 超は 3 にクランプされる', () => {
    s().setOverlayScale(5)
    expect(s().overlayScale).toBe(3)
  })
})

// ─────────────────────────────────────────────
// lineupDisplayTeam
// ─────────────────────────────────────────────

describe('setLineupDisplayTeam', () => {
  it("'home' に設定できる", () => {
    s().setLineupDisplayTeam('home')
    expect(s().lineupDisplayTeam).toBe('home')
  })

  it("'away' に設定できる", () => {
    useGameStore.setState({ lineupDisplayTeam: 'home' })
    s().setLineupDisplayTeam('away')
    expect(s().lineupDisplayTeam).toBe('away')
  })
})

// ─────────────────────────────────────────────
// ティッカー
// ─────────────────────────────────────────────

describe('setTicker', () => {
  it('テキストを設定できる', () => {
    s().setTicker('本日の試合結果')
    expect(s().ticker).toBe('本日の試合結果')
  })

  it('空文字列で消去できる', () => {
    useGameStore.setState({ ticker: 'some text' })
    s().setTicker('')
    expect(s().ticker).toBe('')
  })
})

// ─────────────────────────────────────────────
// 走者状態
// ─────────────────────────────────────────────

describe('setRunner', () => {
  it('一塁走者をセットできる', () => {
    s().setRunner('first', true)
    expect(s().runners.first).toBe(true)
  })

  it('二塁走者をセットできる', () => {
    s().setRunner('second', true)
    expect(s().runners.second).toBe(true)
  })

  it('三塁走者をセットできる', () => {
    s().setRunner('third', true)
    expect(s().runners.third).toBe(true)
  })

  it('走者を外せる（false にできる）', () => {
    useGameStore.setState({ runners: { first: true, second: true, third: true } })
    s().setRunner('second', false)
    expect(s().runners.second).toBe(false)
    expect(s().runners.first).toBe(true)  // 他は変わらない
    expect(s().runners.third).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 打順設定
// ─────────────────────────────────────────────

describe('setLineup', () => {
  it("away チームの打順を設定できる", () => {
    s().setLineup('away', [...CARP_LINEUP])
    expect(s().awayLineup).toHaveLength(10)
    expect(s().awayLineup[0]?.name).toBe('秋山 翔吾')
  })

  it("home チームの打順を設定できる", () => {
    s().setLineup('home', [...CARP_LINEUP])
    expect(s().homeLineup[3]?.name).toBe('坂倉 将吾')
  })
})

describe('setLineupPlayer', () => {
  beforeEach(() => {
    useGameStore.setState({ awayLineup: [...CARP_LINEUP] })
  })

  it('指定 index の選手を更新できる', () => {
    const newPlayer = { order: 1, name: '新選手', number: '10', position: '左' as const }
    s().setLineupPlayer('away', 0, newPlayer)
    expect(s().awayLineup[0]?.name).toBe('新選手')
  })

  it('他の選手は変わらない', () => {
    const newPlayer = { order: 3, name: '代打選手', number: '99', position: '右' as const }
    s().setLineupPlayer('away', 2, newPlayer)
    expect(s().awayLineup[0]?.name).toBe('秋山 翔吾')
    expect(s().awayLineup[1]?.name).toBe('野間 峻祥')
  })
})

// ─────────────────────────────────────────────
// replaceState
// ─────────────────────────────────────────────

describe('replaceState', () => {
  it('渡したステートでストアが完全に上書きされる', () => {
    const partial = {
      ...initialGameState,
      currentInning: 7,
      awayTotal: 5,
      homeTotal: 3,
    }
    s().replaceState(partial)
    expect(s().currentInning).toBe(7)
    expect(s().awayTotal).toBe(5)
    expect(s().homeTotal).toBe(3)
  })
})

// ─────────────────────────────────────────────
// ゲームタイマー
// ─────────────────────────────────────────────

describe('startGameTimer / stopGameTimer', () => {
  it('startGameTimer: gameStartTime が現在時刻付近にセットされ showWaitingScreen=false になる', () => {
    const before = Date.now()
    s().startGameTimer()
    const after = Date.now()
    expect(s().gameStartTime).toBeGreaterThanOrEqual(before)
    expect(s().gameStartTime).toBeLessThanOrEqual(after)
    expect(s().showWaitingScreen).toBe(false)
  })

  it('stopGameTimer: gameStartTime が null になる', () => {
    s().startGameTimer()
    s().stopGameTimer()
    expect(s().gameStartTime).toBeNull()
  })
})

// ─────────────────────────────────────────────
// エフェクト
// ─────────────────────────────────────────────

describe('triggerEffect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('type を渡すと activeEffect と effectTimestamp がセットされる', () => {
    s().triggerEffect('homerun')
    expect(s().activeEffect).toBe('homerun')
    expect(s().effectTimestamp).toBeGreaterThan(0)
  })

  it('6秒後に activeEffect が自動クリアされる', () => {
    s().triggerEffect('strikeout')
    vi.advanceTimersByTime(6000)
    expect(s().activeEffect).toBeNull()
    expect(s().effectTimestamp).toBe(0)
  })

  it('null を渡すと即座にクリアされる', () => {
    s().triggerEffect('homerun')
    s().triggerEffect(null)
    expect(s().activeEffect).toBeNull()
  })

  it('連続して呼んでも最後の type が有効になる', () => {
    s().triggerEffect('homerun')
    s().triggerEffect('strikeout')
    expect(s().activeEffect).toBe('strikeout')
  })

  it('前のタイマーより先に 6秒が来ても activeEffect がクリアされる', () => {
    s().triggerEffect('homerun')
    s().triggerEffect('double')
    vi.advanceTimersByTime(6000)
    expect(s().activeEffect).toBeNull()
  })
})

describe('setAutoChangeEffect', () => {
  it('true に設定できる', () => {
    useGameStore.setState({ autoChangeEffect: false })
    s().setAutoChangeEffect(true)
    expect(s().autoChangeEffect).toBe(true)
  })

  it('false に設定できる', () => {
    useGameStore.setState({ autoChangeEffect: true })
    s().setAutoChangeEffect(false)
    expect(s().autoChangeEffect).toBe(false)
  })
})

// ─────────────────────────────────────────────
// マスコット
// ─────────────────────────────────────────────

describe('setShowMascot', () => {
  it('true に設定できる', () => {
    s().setShowMascot(true)
    expect(s().showMascot).toBe(true)
  })

  it('false に設定できる', () => {
    useGameStore.setState({ showMascot: true })
    s().setShowMascot(false)
    expect(s().showMascot).toBe(false)
  })
})

describe('setMascotMode', () => {
  it('"celebration" に設定できる', () => {
    s().setMascotMode('celebration')
    expect(s().mascotMode).toBe('celebration')
  })

  it('"hidden" に設定できる', () => {
    s().setMascotMode('hidden')
    expect(s().mascotMode).toBe('hidden')
  })
})

describe('setMascotImage', () => {
  it('data URL を設定できる', () => {
    s().setMascotImage('celebration', 'data:image/png;base64,abc')
    expect(s().mascotImages['celebration']).toBe('data:image/png;base64,abc')
  })

  it('null を渡すとそのキーが削除される', () => {
    useGameStore.setState({ mascotImages: { celebration: 'data:image/png;base64,abc' } })
    s().setMascotImage('celebration', null)
    expect(s().mascotImages['celebration']).toBeUndefined()
  })

  it('他のキーは影響を受けない', () => {
    useGameStore.setState({ mascotImages: { idle: 'data:image/png;base64,xyz' } })
    s().setMascotImage('celebration', 'data:image/png;base64,abc')
    expect(s().mascotImages['idle']).toBe('data:image/png;base64,xyz')
  })
})

// ─────────────────────────────────────────────
// 待機画面
// ─────────────────────────────────────────────

describe('setShowWaitingScreen', () => {
  it('true に設定できる', () => {
    s().setShowWaitingScreen(true)
    expect(s().showWaitingScreen).toBe(true)
  })

  it('false に設定できる', () => {
    useGameStore.setState({ showWaitingScreen: true })
    s().setShowWaitingScreen(false)
    expect(s().showWaitingScreen).toBe(false)
  })
})

// ─────────────────────────────────────────────
// Bug#1 投球数の投手ごと管理
// ─────────────────────────────────────────────

/** テスト用ヘルパー: 名前なし打順を生成 */
const makeEmptyLineup = () =>
  Array.from({ length: 10 }, (_, i) => ({
    order: i + 1,
    name: '',
    number: '',
    position: (i === 9 ? '投' : '') as '投' | '',
  }))

describe('Bug#1 投球数の投手ごと管理', () => {
  it('B1-1: advanceInning で pitchCount が 0 にリセットされる', () => {
    useGameStore.setState({ pitchCount: 87, currentHalf: 'top' })
    s().advanceInning()
    expect(s().pitchCount).toBe(0)
  })

  it('B1-1b: addStrike による3アウトでも pitchCount が新投手用にリセットされる', () => {
    useGameStore.setState({
      pitchCount: 49,
      currentHalf: 'top',
      count: { balls: 0, strikes: 2, outs: 2 },
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      pitcherStats: {},
    })
    s().addStrike() // 3振目・3アウト → advanceInning
    // 新投手は初登封0球のはず
    expect(s().pitchCount).toBe(0)
  })

  it('B1-1c: addStrike3アウト時、最後の1球分が旧投手の pitcherStats に保存される', () => {
    useGameStore.setState({
      pitchCount: 49,
      pitcher: { name: '森下', number: '18', stat: '', statLabel: '' },
      currentHalf: 'top', // homeが投球中
      count: { balls: 0, strikes: 2, outs: 2 },
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      pitcherStats: {},
    })
    s().addStrike() // イニング進行
    // home-18 に 50球（49球 + 最後の1球）が保存される
    expect(s().pitcherStats['home-18']).toBe(50)
  })

  it('B1-2: advanceInning で前の投手の投球数が pitcherStats に保存される（表: home 投手）', () => {
    // currentHalf='top' のとき home チームが守備（投球）中
    useGameStore.setState({
      pitchCount: 87,
      pitcher: { name: '森下', number: '18', stat: '', statLabel: '' },
      currentHalf: 'top',
      pitcherStats: {},
    })
    s().advanceInning()
    expect(s().pitcherStats['home-18']).toBe(87)
  })

  it('B1-3: setPitcher で pitchCount が 0 にリセットされる', () => {
    useGameStore.setState({ pitchCount: 50, currentHalf: 'top' })
    s().setPitcher({ name: '新投手', number: '20', stat: '', statLabel: '' })
    expect(s().pitchCount).toBe(0)
  })

  it('B1-4: setPitcher で以前の投手の投球数が pitcherStats に保存される（裏: away 投手）', () => {
    // currentHalf='bottom' のとき away チームが守備（投球）中
    useGameStore.setState({
      pitchCount: 50,
      pitcher: { name: '旧投手', number: '14', stat: '', statLabel: '' },
      currentHalf: 'bottom',
      pitcherStats: {},
    })
    s().setPitcher({ name: '新投手', number: '20', stat: '', statLabel: '' })
    expect(s().pitcherStats['away-14']).toBe(50)
  })

  it('B1-5: 同一投手が複数イニング登板した場合 pitcherStats に累積される', () => {
    // currentHalf='bottom' → away が投球中、背番号 '18' の away 投手
    useGameStore.setState({
      pitcherStats: { 'away-18': 80 },
      pitchCount: 30,
      pitcher: { name: '先発', number: '18', stat: '', statLabel: '' },
      currentHalf: 'bottom',
    })
    s().advanceInning()
    expect(s().pitcherStats['away-18']).toBe(110)
  })

  it('B1-6: 中継ぎ交代後に投球数が 0 から積算される', () => {
    useGameStore.setState({ pitchCount: 0 })
    s().addPitch()
    s().addPitch()
    s().addPitch()
    s().addPitch()
    s().addPitch()
    expect(s().pitchCount).toBe(5)
  })

  it('B1-7: setPitcher 後の pitcher 情報が正しくセットされる', () => {
    const newPitcher = { name: '新投手', number: '20', stat: '3勝2敗', statLabel: '10登板' }
    s().setPitcher(newPitcher)
    expect(s().pitcher).toEqual(newPitcher)
  })

  it('B1-8: advanceInning 後、新しい投手の累積投球数が pitchCount に復元される', () => {
    // inning 1 top: home が投球中 (away batting)
    // 先に home-18 の保存済み投球数があるとする
    useGameStore.setState({
      currentHalf: 'top',
      pitchCount: 30,
      pitcher: { name: '旧投手', number: '99', stat: '', statLabel: '' },
      pitcherStats: { 'away-18': 80 }, // 次回投球予定の投手がすでに80球分記録済み
      awayLineup: [...CARP_LINEUP],   // away が守備側に回る (bottom に進む)
      homeLineup: [...CARP_LINEUP],
    })
    // inning 1 top → bottom: home が攻撃、away が投球
    // awayLineup[9] = 森下 #18 が新投手
    s().advanceInning()
    // 森下 #18 の保存済み80球が pitchCount に復元される
    expect(s().pitchCount).toBe(80)
  })

  it('B1-9: setPitcher で同じ番号のとき pitchCount は変わらない（フォーム編集対策）', () => {
    useGameStore.setState({
      pitcher: { name: '森下 暢仁', number: '18', stat: '', statLabel: '' },
      pitchCount: 55,
    })
    // 番号が同じ → 投手交代ではないのでリセットしない
    s().setPitcher({ name: '森下 暢仁（更新）', number: '18', stat: '', statLabel: '' })
    expect(s().pitchCount).toBe(55)
  })

  it('B1-10: setPitcher で番号が変わったとき新投手の累積投球数が復元される', () => {
    useGameStore.setState({
      pitcher: { name: '旧投手', number: '99', stat: '', statLabel: '' },
      pitchCount: 40,
      currentHalf: 'top',
      pitcherStats: { 'home-20': 60 }, // 新投手の保存済み60球
    })
    s().setPitcher({ name: '新投手', number: '20', stat: '', statLabel: '' })
    // 新投手の保存済み60球が復元される
    expect(s().pitchCount).toBe(60)
    // 旧投手の投球数が保存される: home-99 = 40
    expect(s().pitcherStats['home-99']).toBe(40)
  })

  it('B1-11: addStrike→3アウト後、新投手の累積投球数が復元される', () => {
    // inning 2 top: home が投球中（currentHalf='top'）
    // away pitcher(森下 #18) はすでに inning 1 bottom で60球投げている
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'top',
      count: { balls: 0, strikes: 2, outs: 2 },
      pitchCount: 49,
      pitcher: { name: 'ホーム投手', number: '99', stat: '', statLabel: '' },
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      pitcherStats: { 'away-18': 60 }, // awayLineup[9] = 森下 #18 の蓄積
      innings: [
        { inning: 1, top: 0, bottom: 0 },
        { inning: 2, top: null, bottom: null },
      ],
    })
    s().addStrike() // 3振目・3アウト → top→bottom
    // away pitcher (森下 #18) の60球が復元される
    expect(s().pitchCount).toBe(60)
  })

  it('B1-12: addOut→3アウト後、新投手の累積投球数が復元される', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      pitchCount: 49,
      pitcher: { name: 'ホーム投手', number: '99', stat: '', statLabel: '' },
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      pitcherStats: { 'away-18': 60 },
      innings: [
        { inning: 1, top: 0, bottom: 0 },
        { inning: 2, top: null, bottom: null },
      ],
    })
    s().addOut() // 3アウト → top→bottom
    // away pitcher (森下 #18) の60球が復元される
    expect(s().pitchCount).toBe(60)
  })

  it('B1-13: 多イニング統合テスト（同一投手が複数イニング登板）', () => {
    // 初期状態: inning 1 top, home が投球
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      pitchCount: 0,
      pitcher: CARP_LINEUP[9]
        ? {
            name: CARP_LINEUP[9].name,
            number: CARP_LINEUP[9].number,
            stat: '',
            statLabel: '',
          }
        : { name: '', number: '18', stat: '', statLabel: '' },
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      innings: [{ inning: 1, top: null, bottom: null }],
      pitcherStats: {},
    })

    // inning 1 top: home pitcher(#18) が50球投げる
    useGameStore.setState({ pitchCount: 50 })
    s().advanceInning() // top → bottom

    // bottom では away pitcher(#18) が初登板 → 0球
    expect(s().pitchCount).toBe(0)
    expect(s().currentHalf).toBe('bottom')

    // inning 1 bottom: away pitcher(#18) が30球投げる
    useGameStore.setState({ pitchCount: 30 })
    s().advanceInning() // bottom → inning 2 top

    // inning 2 top: home pitcher(#18) が戻ってくる → 50球が復元されるべき
    expect(s().currentHalf).toBe('top')
    expect(s().pitchCount).toBe(50)

    // inning 2 top でさらに20球
    useGameStore.setState({ pitchCount: 70 }) // 50 + 20
    s().advanceInning() // top → bottom

    // inning 2 bottom: away pitcher(#18) が戻ってくる → 30球が復元されるべき
    expect(s().pitchCount).toBe(30)
  })
})

// ─────────────────────────────────────────────
// Bug#2 無得点イニングのスコア null → 0 変換
// ─────────────────────────────────────────────

describe('Bug#2 無得点イニングのスコア null → 0 変換', () => {
  it('B2-1: 表→裏: top=null が 0 になる', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: null, bottom: null }],
    })
    s().advanceInning()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(0)
  })

  it('B2-2: 表→裏: top=2（得点あり）はそのまま', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 2, bottom: null }],
    })
    s().advanceInning()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(2)
  })

  it('B2-3: 裏→次の表: bottom=null が 0 になる', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'bottom',
      innings: [{ inning: 1, top: 1, bottom: null }],
    })
    s().advanceInning()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.bottom).toBe(0)
  })

  it('B2-4: 裏→次の表: bottom=3（得点あり）はそのまま', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'bottom',
      innings: [{ inning: 1, top: 0, bottom: 3 }],
    })
    s().advanceInning()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.bottom).toBe(3)
  })

  it('B2-5: 3アウトによる自動 advanceInning でも無得点 top が 0 になる', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings: [
        { inning: 1, top: 0, bottom: 0 },
        { inning: 2, top: null, bottom: null },
      ],
    })
    s().addOut() // 3アウト目
    const inn2 = s().innings.find((i) => i.inning === 2)
    expect(inn2?.top).toBe(0)
  })
})

// ─────────────────────────────────────────────
// Bug#3 攻守交代時の打者・投手自動セット
// ─────────────────────────────────────────────

describe('Bug#3 攻守交代時の打者・投手自動セット', () => {
  it('B3-1: 表→裏: homeLineup の現在打者が batter にセットされる', () => {
    useGameStore.setState({
      currentHalf: 'top',
      homeLineup: [...CARP_LINEUP],
      homeBatterIndex: 2,
    })
    s().advanceInning()
    expect(s().batter.name).toBe(CARP_LINEUP[2]!.name)
    expect(s().batter.number).toBe(CARP_LINEUP[2]!.number)
  })

  it('B3-2: 表→裏: awayLineup の投手（index 9）が pitcher にセットされる', () => {
    useGameStore.setState({
      currentHalf: 'top',
      awayLineup: [...CARP_LINEUP],
    })
    s().advanceInning()
    expect(s().pitcher.name).toBe(CARP_LINEUP[9]!.name)
    expect(s().pitcher.number).toBe(CARP_LINEUP[9]!.number)
  })

  it('B3-3: 裏→次の表: awayLineup の現在打者が batter にセットされる', () => {
    useGameStore.setState({
      currentHalf: 'bottom',
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 4,
    })
    s().advanceInning()
    expect(s().batter.name).toBe(CARP_LINEUP[4]!.name)
  })

  it('B3-4: 裏→次の表: homeLineup の投手（index 9）が pitcher にセットされる', () => {
    useGameStore.setState({
      currentHalf: 'bottom',
      homeLineup: [...CARP_LINEUP],
    })
    s().advanceInning()
    expect(s().pitcher.name).toBe(CARP_LINEUP[9]!.name)
  })

  it('B3-5: 打順が空の場合 batter は空のまま（クラッシュしない）', () => {
    useGameStore.setState({
      currentHalf: 'top',
      homeLineup: makeEmptyLineup() as any,
      homeBatterIndex: 0,
    })
    expect(() => s().advanceInning()).not.toThrow()
    expect(s().batter.name).toBe('')
  })

  it('B3-6: 3アウトによる自動 advanceInning でも打者が自動セットされる', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings: [{ inning: 1, top: null, bottom: null }],
      homeLineup: [...CARP_LINEUP],
      homeBatterIndex: 1,
    })
    s().addOut() // 3アウト → advanceInning
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })
})

// ─────────────────────────────────────────────
// Bug#4 攻守交代時の lineupDisplayTeam 自動更新
// ─────────────────────────────────────────────

describe('Bug#4 攻守交代時の lineupDisplayTeam 自動更新', () => {
  it('B4-1: 表→裏: lineupDisplayTeam が "home" になる', () => {
    useGameStore.setState({ currentHalf: 'top', lineupDisplayTeam: 'away' })
    s().advanceInning()
    expect(s().lineupDisplayTeam).toBe('home')
  })

  it('B4-2: 裏→次の表: lineupDisplayTeam が "away" になる', () => {
    useGameStore.setState({ currentHalf: 'bottom', lineupDisplayTeam: 'home' })
    s().advanceInning()
    expect(s().lineupDisplayTeam).toBe('away')
  })

  it('B4-3: 3アウトによる自動 advanceInning でも lineupDisplayTeam が更新される', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings: [{ inning: 1, top: null, bottom: null }],
      lineupDisplayTeam: 'away',
    })
    s().addOut() // 3アウト → advanceInning
    expect(s().lineupDisplayTeam).toBe('home')
  })
})

// ─────────────────────────────────────────────
// オーバーレイ位置
// ─────────────────────────────────────────────

describe('setOverlayPosition', () => {
  it('指定 id の位置を更新できる', () => {
    s().setOverlayPosition('scoreboard', { x: 100, y: 200 })
    expect(s().overlayPositions['scoreboard']).toEqual({ x: 100, y: 200 })
  })

  it('他の要素の位置は変わらない', () => {
    const timerBefore = s().overlayPositions['timer']
    s().setOverlayPosition('scoreboard', { x: 50, y: 50 })
    expect(s().overlayPositions['timer']).toEqual(timerBefore)
  })
})

describe('resetOverlayPositions', () => {
  it('全ての位置がデフォルト値に戻る', () => {
    s().setOverlayPosition('scoreboard', { x: 999, y: 999 })
    s().resetOverlayPositions()
    expect(s().overlayPositions['scoreboard']).toEqual({ x: 24, y: 24 })
  })
})

// ─────────────────────────────────────────────
// Bug#5 アウト時・三振時の次打者自動移行
// ─────────────────────────────────────────────

describe('Bug#5 アウト時の次打者自動移行 (addOut)', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
    })
  })

  it('B5-1: 1アウト時、out+1になる（打者は進まない）', () => {
    s().addOut()
    expect(s().count.outs).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(0) // 変わらない
  })

  it('B5-2: 2アウト連続で outs=2 になる（打者は進まない）', () => {
    useGameStore.setState({ awayBatterIndex: 3 })
    s().addOut()
    s().addOut()
    expect(s().count.outs).toBe(2)
    expect(s().awayBatterIndex).toBe(3) // 変わらない
  })

  it('B5-3: ラインアップ未設定でもクラッシュしない（countのみリセット）', () => {
    useGameStore.setState({ awayLineup: makeEmptyLineup() })
    expect(() => s().addOut()).not.toThrow()
    expect(s().count.outs).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('B5-4: 3アウト時はイニング進行（既存動作）', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 0, outs: 2 }, currentHalf: 'top' })
    s().addOut()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
  })

  it('B5-5: 3アウト時、攻撕側の打者インデックスが進む（次イニングの先頭打者になる）', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 3,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
    })
    s().addOut()
    // 攻守交代後、awayのインデックスが 3→ 4 に進んでいることを確認
    expect(s().awayBatterIndex).toBe(4)
  })
})

describe('Bug#5 三振時の次打者自動移行 (addStrike)', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
    })
  })

  it('B5S-1: 三振（outs=0→1）、次の打者にセットされる', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 2, outs: 0 } })
    s().addStrike()
    expect(s().count.outs).toBe(1)
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })

  it('B5S-2: 三振（outs=1→2）、次の打者にセットされる', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 2, outs: 1 }, awayBatterIndex: 3 })
    s().addStrike()
    expect(s().count.outs).toBe(2)
    expect(s().awayBatterIndex).toBe(4)
  })

  it('B5S-3: 3ストライク3アウト → advanceInning（既存動作）', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 2, outs: 2 }, currentHalf: 'top' })
    s().addStrike()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
  })

  it('B5S-4: 三振3アウト時、攻撕側の打者インデックスが進む', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 2, outs: 2 },
      awayBatterIndex: 5,
      currentHalf: 'top',
    })
    s().addStrike()
    expect(s().awayBatterIndex).toBe(6)
  })
})

// ─────────────────────────────────────────────
// recordGroundout / recordDoublePlay / recordTriplePlay
// ─────────────────────────────────────────────

describe('recordGroundout ゴロ/牲打', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      count: { balls: 1, strikes: 2, outs: 0 },
      pitchCount: 10,
    })
  })

  it('GO-1: out+1、打者が次に進む', () => {
    s().recordGroundout()
    expect(s().count.outs).toBe(1)
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })

  it('GO-2: balls=0, strikes=0 にリセット', () => {
    s().recordGroundout()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('GO-3: pitchCount が +1', () => {
    s().recordGroundout()
    expect(s().pitchCount).toBe(11)
  })

  it('GO-4: 3アウト → advanceInning、打者インデックスも進む', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 0, outs: 2 },
      awayBatterIndex: 4,
      currentHalf: 'top',
    })
    s().recordGroundout()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
    expect(s().awayBatterIndex).toBe(5)
  })
})

describe('recordDoublePlay 併殺', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      pitchCount: 10,
    })
  })

  it('DP-1: out+2になり打者が次に進む', () => {
    s().recordDoublePlay()
    expect(s().count.outs).toBe(2)
    expect(s().awayBatterIndex).toBe(1)
  })

  it('DP-2: pitchCount が +1', () => {
    s().recordDoublePlay()
    expect(s().pitchCount).toBe(11)
  })

  it('DP-3: outs=1 から out+2 → 3アウトで advanceInning', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 0, outs: 1 },
      awayBatterIndex: 2,
      currentHalf: 'top',
    })
    s().recordDoublePlay()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
    expect(s().awayBatterIndex).toBe(3)
  })
})

describe('recordTriplePlay 三重殺', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      pitchCount: 10,
    })
  })

  it('TP-1: 常に advanceInning', () => {
    s().recordTriplePlay()
    expect(s().count.outs).toBe(0)
    expect(s().currentHalf).toBe('bottom')
  })

  it('TP-2: 打者が次に進む', () => {
    s().recordTriplePlay()
    expect(s().awayBatterIndex).toBe(1)
  })

  it('TP-3: 投球数+1 が旧投手の pitcherStats に保存され、新投手の pitchCount は 0', () => {
    useGameStore.setState({
      pitcher: { name: '先発', number: '18', stat: '', statLabel: '' },
    })
    s().recordTriplePlay()
    // home-18 に 11球（10+1）が保存される
    expect(s().pitcherStats['home-18']).toBe(11)
    // 攻守交代後の新投手は 0 球スタート
    expect(s().pitchCount).toBe(0)
  })
})

// ─────────────────────────────────────────────
// recordSingle 単打記録
// ─────────────────────────────────────────────

describe('recordSingle 単打記録', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      homeBatterIndex: 0,
      currentHalf: 'top',
      awayHits: 0,
      homeHits: 0,
      pitchCount: 10,
      count: { balls: 2, strikes: 1, outs: 1 },
    })
  })

  it('RS-1: top（away batting）→ awayHits が +1', () => {
    s().recordSingle()
    expect(s().awayHits).toBe(1)
  })

  it('RS-2: bottom（home batting）→ homeHits が +1', () => {
    useGameStore.setState({ currentHalf: 'bottom', homeBatterIndex: 0 })
    s().recordSingle()
    expect(s().homeHits).toBe(1)
  })

  it('RS-3: balls=0, strikes=0 にリセット', () => {
    s().recordSingle()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('RS-4: outs は変わらない', () => {
    s().recordSingle()
    expect(s().count.outs).toBe(1)
  })

  it('RS-5: 打者が次に進む', () => {
    s().recordSingle()
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })

  it('RS-6: pitchCount が +1', () => {
    s().recordSingle()
    expect(s().pitchCount).toBe(11)
  })

  it('RS-7: ラインアップ未設定でもクラッシュしない', () => {
    useGameStore.setState({ awayLineup: makeEmptyLineup() })
    expect(() => s().recordSingle()).not.toThrow()
    expect(s().awayHits).toBe(1)
  })
})

// ─────────────────────────────────────────────
// recordHitByPitch 死球打者記録
// ─────────────────────────────────────────────

describe('recordHitByPitch 死球打者記録', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      pitchCount: 10,
      count: { balls: 3, strikes: 1, outs: 0 },
      runners: { first: false, second: false, third: false },
    })
  })

  it('RBP-1: 打者が一塩に出塔する（フォアボールと同じ）', () => {
    s().recordHitByPitch()
    expect(s().runners.first).toBe(true)
  })

  it('RBP-2: balls=0, strikes=0 にリセット', () => {
    s().recordHitByPitch()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
  })

  it('RBP-3: outs は変わらない', () => {
    s().recordHitByPitch()
    expect(s().count.outs).toBe(0)
  })

  it('RBP-4: 打者が次に進む', () => {
    s().recordHitByPitch()
    expect(s().awayBatterIndex).toBe(1)
    expect(s().batter.name).toBe(CARP_LINEUP[1]!.name)
  })

  it('RBP-5: pitchCount が +1', () => {
    s().recordHitByPitch()
    expect(s().pitchCount).toBe(11)
  })

  it('RBP-6: 満塔時は押し出し得点（applyWalkと同じ）', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: true },
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
    })
    s().recordHitByPitch()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
  })

  it('RBP-7: 一塁走者あり→一・二塁になる', () => {
    useGameStore.setState({ runners: { first: true, second: false, third: false } })
    s().recordHitByPitch()
    expect(s().runners).toEqual({ first: true, second: true, third: false })
  })
})

// ─────────────────────────────────────────────
// setRunnerAtBase
// ─────────────────────────────────────────────

describe('setRunnerAtBase', () => {
  beforeEach(() => {
    useGameStore.setState({
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('一塁にインデックス 2 をセットすると runners.first=true, runnerIndices.first=2', () => {
    s().setRunnerAtBase('first', 2)
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(2)
  })

  it('二塁にインデックス 5 をセットすると runners.second=true, runnerIndices.second=5', () => {
    s().setRunnerAtBase('second', 5)
    expect(s().runners.second).toBe(true)
    expect(s().runnerIndices.second).toBe(5)
  })

  it('三塁にインデックス 7 をセットすると runners.third=true, runnerIndices.third=7', () => {
    s().setRunnerAtBase('third', 7)
    expect(s().runners.third).toBe(true)
    expect(s().runnerIndices.third).toBe(7)
  })

  it('null をセットすると runners.first=false, runnerIndices.first=null になる', () => {
    useGameStore.setState({
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 3, second: null, third: null },
    })
    s().setRunnerAtBase('first', null)
    expect(s().runners.first).toBe(false)
    expect(s().runnerIndices.first).toBeNull()
  })

  it('他の塁は影響を受けない', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: false },
      runnerIndices: { first: 1, second: 4, third: null },
    })
    s().setRunnerAtBase('third', 6)
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(1)
    expect(s().runners.second).toBe(true)
    expect(s().runnerIndices.second).toBe(4)
  })
})

// ─────────────────────────────────────────────
// scoreRunnerWithRBI / scoreRunnerNoRBI
// ─────────────────────────────────────────────

describe('scoreRunnerWithRBI', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 2, second: null, third: null },
    })
  })

  it('一塁走者(index=2)をスコアすると得点+1、runners.first=false、runnerIndices.first=null', () => {
    s().scoreRunnerWithRBI(2)
    expect(s().runners.first).toBe(false)
    expect(s().runnerIndices.first).toBeNull()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
  })

  it('二塁走者(index=4)をスコアすると得点+1、runners.second=false', () => {
    useGameStore.setState({
      runners: { first: false, second: true, third: false },
      runnerIndices: { first: null, second: 4, third: null },
    })
    s().scoreRunnerWithRBI(4)
    expect(s().runners.second).toBe(false)
    expect(s().runnerIndices.second).toBeNull()
    expect(s().innings[0]?.top).toBe(1)
  })

  it('三塁走者(index=7)をスコアすると得点+1、runners.third=false', () => {
    useGameStore.setState({
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 7 },
    })
    s().scoreRunnerWithRBI(7)
    expect(s().runners.third).toBe(false)
    expect(s().runnerIndices.third).toBeNull()
    expect(s().innings[0]?.top).toBe(1)
  })

  it('走者に存在しないインデックスをスコアしても状態が変わらない', () => {
    s().scoreRunnerWithRBI(9)
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(2)
    expect(s().innings[0]?.top).toBe(0)
  })
})

describe('scoreRunnerNoRBI', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 5 },
    })
  })

  it('三塁走者(index=5)をスコアすると得点+1、runners.third=false (RBI なし)', () => {
    s().scoreRunnerNoRBI(5)
    expect(s().runners.third).toBe(false)
    expect(s().runnerIndices.third).toBeNull()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
  })
})

// ─────────────────────────────────────────────
// 四球時 runnerIndices 更新
// ─────────────────────────────────────────────

describe('四球時 runnerIndices 更新 (applyWalk via addBall x4)', () => {
  const walk = () => {
    s().addBall()
    s().addBall()
    s().addBall()
    s().addBall()
  }

  it('走者なし四球: runnerIndices.first に打者インデックス(0)がセットされる', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
    walk()
    expect(s().runnerIndices.first).toBe(0)
    expect(s().runnerIndices.second).toBeNull()
    expect(s().runnerIndices.third).toBeNull()
  })

  it('一塁走者あり四球: 一塁走者が二塁に押し出され、runnerIndices が正しく移動する', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 3,
      currentHalf: 'top',
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 1, second: null, third: null },
    })
    walk()
    expect(s().runnerIndices.first).toBe(3)  // 打者(3)が一塁へ
    expect(s().runnerIndices.second).toBe(1) // 元一塁走者(1)が二塁へ
    expect(s().runnerIndices.third).toBeNull()
  })

  it('一二塁走者あり四球: 一・二塁走者が押し出され、runnerIndices が全てセットされる', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 5,
      currentHalf: 'top',
      runners: { first: true, second: true, third: false },
      runnerIndices: { first: 2, second: 0, third: null },
    })
    walk()
    expect(s().runnerIndices.first).toBe(5)  // 打者(5)が一塁へ
    expect(s().runnerIndices.second).toBe(2) // 元一塁走者(2)が二塁へ
    expect(s().runnerIndices.third).toBe(0)  // 元二塁走者(0)が三塁へ
  })

  it('満塁四球: 三塁走者が生還し runnerIndices が正しく移動する', () => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 6,
      currentHalf: 'top',
      runners: { first: true, second: true, third: true },
      runnerIndices: { first: 3, second: 1, third: 0 },
      innings: [{ inning: 1, top: 0, bottom: null }],
      awayTotal: 0,
    })
    walk()
    expect(s().runnerIndices.first).toBe(6)  // 打者(6)が一塁へ
    expect(s().runnerIndices.second).toBe(3) // 元一塁走者(3)が二塁へ
    expect(s().runnerIndices.third).toBe(1)  // 元二塁走者(1)が三塁へ
    // 元三塁走者(0)は生還 → 得点+1
    expect(s().innings[0]?.top).toBe(1)
  })
})

// ─────────────────────────────────────────────
// advanceInning clears runnerIndices
// ─────────────────────────────────────────────

describe('advanceInning で runnerIndices がリセットされる', () => {
  it('攻守交代後 runnerIndices が全て null になる', () => {
    useGameStore.setState({
      currentHalf: 'top',
      runners: { first: true, second: true, third: false },
      runnerIndices: { first: 2, second: 5, third: null },
    })
    s().advanceInning()
    expect(s().runnerIndices).toEqual({ first: null, second: null, third: null })
  })

  it('3アウトによる自動 advanceInning でも runnerIndices がリセットされる', () => {
    useGameStore.setState({
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings: [{ inning: 1, top: null, bottom: null }],
      runners: { first: false, second: true, third: true },
      runnerIndices: { first: null, second: 3, third: 7 },
    })
    s().addOut()
    expect(s().runnerIndices).toEqual({ first: null, second: null, third: null })
  })
})

// ─────────────────────────────────────────────
// rewindInning clears runnerIndices
// ─────────────────────────────────────────────

describe('rewindInning で runnerIndices がリセットされる', () => {
  it('イニング戻し後 runnerIndices が全て null になる', () => {
    useGameStore.setState({
      currentInning: 3,
      currentHalf: 'bottom',
      runners: { first: true, second: false, third: true },
      runnerIndices: { first: 4, second: null, third: 8 },
    })
    s().rewindInning()
    expect(s().runnerIndices).toEqual({ first: null, second: null, third: null })
  })
})

// ─────────────────────────────────────────────
// recordHomeRun ホームラン
// ─────────────────────────────────────────────

describe('recordHomeRun ホームラン', () => {
  it('ソロHR: 1点加算・走者なし・投球数+1・打者交代・B/Sリセット', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      pitchCount: 5,
      count: { balls: 2, strikes: 1, outs: 1 },
      awayHits: 0,
      awayTotal: 0,
    })
    s().recordHomeRun()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
    expect(s().runners).toEqual({ first: false, second: false, third: false })
    expect(s().runnerIndices).toEqual({ first: null, second: null, third: null })
    expect(s().pitchCount).toBe(6)
    expect(s().awayBatterIndex).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().count.outs).toBe(1)  // アウト数は変わらない
  })

  it('満塁HR: 4点加算・走者全クリア', () => {
    useGameStore.setState({
      currentInning: 2,
      currentHalf: 'top',
      innings: [
        { inning: 1, top: 0, bottom: 0 },
        { inning: 2, top: 0, bottom: null },
      ],
      runners: { first: true, second: true, third: true },
      runnerIndices: { first: 1, second: 2, third: 3 },
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      pitchCount: 0,
      awayTotal: 0,
    })
    s().recordHomeRun()
    const inn2 = s().innings.find((i) => i.inning === 2)
    expect(inn2?.top).toBe(4)
    expect(s().awayTotal).toBe(4)
    expect(s().runners).toEqual({ first: false, second: false, third: false })
    expect(s().runnerIndices).toEqual({ first: null, second: null, third: null })
  })

  it('1塁走者ありHR: 2点加算', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'bottom',
      innings: [{ inning: 1, top: 0, bottom: 0 }],
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 1, second: null, third: null },
      homeLineup: [...CARP_LINEUP],
      homeBatterIndex: 3,
      pitchCount: 10,
      homeTotal: 0,
    })
    s().recordHomeRun()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.bottom).toBe(2)
    expect(s().homeTotal).toBe(2)
    expect(s().pitchCount).toBe(11)
  })

  it('2・3塁走者ありHR: 3点加算', () => {
    useGameStore.setState({
      currentInning: 1,
      currentHalf: 'top',
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: true, third: true },
      runnerIndices: { first: null, second: 2, third: 5 },
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 7,
      pitchCount: 0,
      awayTotal: 0,
    })
    s().recordHomeRun()
    const inn1 = s().innings.find((i) => i.inning === 1)
    expect(inn1?.top).toBe(3)
    expect(s().awayTotal).toBe(3)
  })

  it('安打数が1増える（表の場合はaway）', () => {
    useGameStore.setState({
      currentHalf: 'top',
      awayHits: 3,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
      awayLineup: [...CARP_LINEUP],
    })
    s().recordHomeRun()
    expect(s().awayHits).toBe(4)
  })

  it('安打数が1増える（裏の場合はhome）', () => {
    useGameStore.setState({
      currentHalf: 'bottom',
      homeHits: 1,
      innings: [{ inning: 1, top: 0, bottom: 0 }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
      homeLineup: [...CARP_LINEUP],
    })
    s().recordHomeRun()
    expect(s().homeHits).toBe(2)
  })
})

// ─────────────────────────────────────────────
// statDisplaySettings（オーバーレイ表示設定）
// ─────────────────────────────────────────────

describe('statDisplaySettings – 初期状態', () => {
  it('statDisplaySettings が存在する', () => {
    expect(s().statDisplaySettings).toBeDefined()
  })

  it('showBattingAvg がデフォルト true', () => {
    expect(s().statDisplaySettings.showBattingAvg).toBe(true)
  })

  it('showHomeRuns がデフォルト false', () => {
    expect(s().statDisplaySettings.showHomeRuns).toBe(false)
  })

  it('showRbi がデフォルト false', () => {
    expect(s().statDisplaySettings.showRbi).toBe(false)
  })

  it('showOps がデフォルト false', () => {
    expect(s().statDisplaySettings.showOps).toBe(false)
  })

  it('showAppearances がデフォルト false', () => {
    expect(s().statDisplaySettings.showAppearances).toBe(false)
  })

  it('showRecord がデフォルト false', () => {
    expect(s().statDisplaySettings.showRecord).toBe(false)
  })
})

describe('setStatDisplaySettings', () => {
  it('showHomeRuns を true に変更できる', () => {
    s().setStatDisplaySettings({ showHomeRuns: true })
    expect(s().statDisplaySettings.showHomeRuns).toBe(true)
  })

  it('部分更新で他の設定に影響しない', () => {
    s().setStatDisplaySettings({ showHomeRuns: true })
    expect(s().statDisplaySettings.showBattingAvg).toBe(true)
    expect(s().statDisplaySettings.showRbi).toBe(false)
    expect(s().statDisplaySettings.showOps).toBe(false)
    expect(s().statDisplaySettings.showAppearances).toBe(false)
    expect(s().statDisplaySettings.showRecord).toBe(false)
  })

  it('全フィールドを一度に更新できる', () => {
    s().setStatDisplaySettings({
      showBattingAvg: false,
      showHomeRuns: true,
      showRbi: true,
      showOps: true,
      showAppearances: true,
      showRecord: true,
    })
    const settings = s().statDisplaySettings
    expect(settings.showBattingAvg).toBe(false)
    expect(settings.showHomeRuns).toBe(true)
    expect(settings.showRbi).toBe(true)
    expect(settings.showOps).toBe(true)
    expect(settings.showAppearances).toBe(true)
    expect(settings.showRecord).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 新アクション: recordSingle 走者移動テスト
// ─────────────────────────────────────────────

describe('recordSingle 走者移動', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      homeLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayHits: 0,
      awayTotal: 0,
      pitchCount: 0,
      count: { balls: 1, strikes: 1, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('走者なし: 打者→一塁', () => {
    s().recordSingle()
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(0)
    expect(s().runners.second).toBe(false)
    expect(s().runners.third).toBe(false)
  })

  it('一塁走者あり: 打者→一塁, 一塁→二塁', () => {
    useGameStore.setState({
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 8, second: null, third: null },
    })
    s().recordSingle()
    expect(s().runnerIndices.first).toBe(0)
    expect(s().runnerIndices.second).toBe(8)
  })

  it('一・二塁: 打者→一塁, 一塁→二塁, 二塁→三塁', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: false },
      runnerIndices: { first: 7, second: 6, third: null },
    })
    s().recordSingle()
    expect(s().runnerIndices.first).toBe(0)
    expect(s().runnerIndices.second).toBe(7)
    expect(s().runnerIndices.third).toBe(6)
  })

  it('満塁: 三塁走者生還 → 得点+1, rbi+1', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: true },
      runnerIndices: { first: 7, second: 6, third: 5 },
    })
    s().recordSingle()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().awayTotal).toBe(1)
    expect(s().runnerIndices.third).toBe(6)
  })

  it('二塁走者のみ (一塁空き): 二塁走者はそのまま (フォースなし)', () => {
    useGameStore.setState({
      runners: { first: false, second: true, third: false },
      runnerIndices: { first: null, second: 3, third: null },
    })
    s().recordSingle()
    expect(s().runnerIndices.first).toBe(0)
    expect(s().runnerIndices.second).toBe(3)
    expect(s().runners.third).toBe(false)
  })

  it('lastBatterIndex が現在の打者インデックスにセットされる', () => {
    useGameStore.setState({ awayBatterIndex: 3 })
    s().recordSingle()
    expect(s().lastBatterIndex).toBe(3)
  })
})

// ─────────────────────────────────────────────
// recordDouble 走者移動テスト
// ─────────────────────────────────────────────

describe('recordDouble 走者移動', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayHits: 0,
      awayTotal: 0,
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('走者なし: 打者→二塁', () => {
    s().recordDouble()
    expect(s().runners.second).toBe(true)
    expect(s().runnerIndices.second).toBe(0)
    expect(s().awayHits).toBe(1)
  })

  it('三塁走者あり: 三塁走者生還', () => {
    useGameStore.setState({
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 5 },
    })
    s().recordDouble()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().runners.third).toBe(false)
  })

  it('一塁走者あり: 一塁→三塁, 打者→二塁', () => {
    useGameStore.setState({
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 3, second: null, third: null },
    })
    s().recordDouble()
    expect(s().runnerIndices.second).toBe(0)
    expect(s().runnerIndices.third).toBe(3)
  })

  it('一・二塁: 二塁走者生還, 一塁→三塁', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: false },
      runnerIndices: { first: 3, second: 4, third: null },
    })
    s().recordDouble()
    expect(s().innings[0]?.top).toBe(1) // 二塁走者生還
    expect(s().runnerIndices.third).toBe(3) // 一塁走者→三塁
    expect(s().runnerIndices.second).toBe(0) // 打者→二塁
  })
})

// ─────────────────────────────────────────────
// recordTriple 走者移動テスト
// ─────────────────────────────────────────────

describe('recordTriple 走者移動', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayHits: 0,
      awayTotal: 0,
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('走者なし: 打者→三塁', () => {
    s().recordTriple()
    expect(s().runners.third).toBe(true)
    expect(s().runnerIndices.third).toBe(0)
    expect(s().awayHits).toBe(1)
  })

  it('満塁: 全走者生還 → 3点', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: true },
      runnerIndices: { first: 3, second: 4, third: 5 },
    })
    s().recordTriple()
    expect(s().innings[0]?.top).toBe(3)
    expect(s().awayTotal).toBe(3)
    expect(s().runners).toEqual({ first: false, second: false, third: true })
    expect(s().runnerIndices.third).toBe(0) // 打者が三塁に
  })
})

// ─────────────────────────────────────────────
// recordWalk 四球
// ─────────────────────────────────────────────

describe('recordWalk', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      pitchCount: 5,
      count: { balls: 0, strikes: 1, outs: 1 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('走者なし: 打者→一塁, 投球数+1', () => {
    s().recordWalk()
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(0)
    expect(s().pitchCount).toBe(6)
  })

  it('カウント B/S リセット, 打者交代', () => {
    s().recordWalk()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(1)
  })

  it('満塁: 三塁走者生還 → 得点+1', () => {
    useGameStore.setState({
      runners: { first: true, second: true, third: true },
      runnerIndices: { first: 3, second: 4, third: 5 },
    })
    s().recordWalk()
    expect(s().innings[0]?.top).toBe(1)
  })

  it('lastBatterIndex がセットされる', () => {
    useGameStore.setState({ awayBatterIndex: 2 })
    s().recordWalk()
    expect(s().lastBatterIndex).toBe(2)
  })
})

// ─────────────────────────────────────────────
// recordIntentionalWalk 故意四球
// ─────────────────────────────────────────────

describe('recordIntentionalWalk', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      pitchCount: 5,
      count: { balls: 2, strikes: 1, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('投球数は加算しない', () => {
    s().recordIntentionalWalk()
    expect(s().pitchCount).toBe(5)
  })

  it('走者移動: 打者→一塁', () => {
    s().recordIntentionalWalk()
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(0)
  })

  it('B/Sリセット, 打者交代', () => {
    s().recordIntentionalWalk()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(1)
  })
})

// ─────────────────────────────────────────────
// recordSacrificeBunt 犠打
// ─────────────────────────────────────────────

describe('recordSacrificeBunt', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 8, second: null, third: null },
    })
  })

  it('アウト+1, 一塁走者が二塁へ進塁', () => {
    s().recordSacrificeBunt()
    expect(s().count.outs).toBe(1)
    expect(s().runners.second).toBe(true)
    expect(s().runnerIndices.second).toBe(8)
    expect(s().runners.first).toBe(false)
  })

  it('三塁走者あり: 三塁走者生還 → 得点+1', () => {
    useGameStore.setState({
      runners: { first: true, second: false, third: true },
      runnerIndices: { first: 8, second: null, third: 5 },
    })
    s().recordSacrificeBunt()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().runners.third).toBe(false)
  })

  it('投球数+1, B/Sリセット, 打者交代', () => {
    s().recordSacrificeBunt()
    expect(s().pitchCount).toBe(1)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(1)
  })

  it('3アウト時はイニング進行', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 0, outs: 2 } })
    s().recordSacrificeBunt()
    expect(s().count.outs).toBe(0) // 次のハーフへリセット
    expect(s().currentHalf).toBe('bottom')
  })
})

// ─────────────────────────────────────────────
// recordSacrificeFly 犠飛
// ─────────────────────────────────────────────

describe('recordSacrificeFly', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 5 },
    })
  })

  it('アウト+1, 三塁走者生還, 得点+1', () => {
    s().recordSacrificeFly()
    expect(s().count.outs).toBe(1)
    expect(s().innings[0]?.top).toBe(1)
    expect(s().runners.third).toBe(false)
    expect(s().runnerIndices.third).toBeNull()
  })

  it('三塁走者なし: エラーなく動作（得点なし）', () => {
    useGameStore.setState({
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 3, second: null, third: null },
    })
    s().recordSacrificeFly()
    expect(s().count.outs).toBe(1)
    expect(s().innings[0]?.top).toBe(0)
  })
})

// ─────────────────────────────────────────────
// recordFlyout フライアウト
// ─────────────────────────────────────────────

describe('recordFlyout', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      pitchCount: 5,
      count: { balls: 1, strikes: 2, outs: 1 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('アウト+1, 投球数+1, B/Sリセット, 打者交代', () => {
    s().recordFlyout()
    expect(s().count.outs).toBe(2)
    expect(s().pitchCount).toBe(6)
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(1)
  })

  it('3アウト目: イニング進行', () => {
    useGameStore.setState({ count: { balls: 0, strikes: 0, outs: 2 } })
    s().recordFlyout()
    expect(s().currentHalf).toBe('bottom')
  })
})

// ─────────────────────────────────────────────
// recordUncaughtThirdStrike 振り逃げ
// ─────────────────────────────────────────────

describe('recordUncaughtThirdStrike', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      pitchCount: 5,
      count: { balls: 1, strikes: 2, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('アウトなし, 打者→一塁, 投球数+1', () => {
    s().recordUncaughtThirdStrike()
    expect(s().count.outs).toBe(0)
    expect(s().runners.first).toBe(true)
    expect(s().runnerIndices.first).toBe(0)
    expect(s().pitchCount).toBe(6)
  })

  it('B/Sリセット, 打者交代', () => {
    s().recordUncaughtThirdStrike()
    expect(s().count.balls).toBe(0)
    expect(s().count.strikes).toBe(0)
    expect(s().awayBatterIndex).toBe(1)
  })

  it('ヒット数は加算しない', () => {
    useGameStore.setState({ awayHits: 3 })
    s().recordUncaughtThirdStrike()
    expect(s().awayHits).toBe(3)
  })
})

// ─────────────────────────────────────────────
// advanceRunnersOnWildPitch WP/PB進塁
// ─────────────────────────────────────────────

describe('advanceRunnersOnWildPitch', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      pitchCount: 5,
      count: { balls: 1, strikes: 1, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: true, second: false, third: false },
      runnerIndices: { first: 3, second: null, third: null },
    })
  })

  it('一塁走者→二塁', () => {
    s().advanceRunnersOnWildPitch()
    expect(s().runners.second).toBe(true)
    expect(s().runnerIndices.second).toBe(3)
    expect(s().runners.first).toBe(false)
  })

  it('三塁走者→生還 (得点+1, 打点なし)', () => {
    useGameStore.setState({
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 5 },
    })
    s().advanceRunnersOnWildPitch()
    expect(s().innings[0]?.top).toBe(1)
    expect(s().runners.third).toBe(false)
  })

  it('投球数・打者・カウントは変更しない', () => {
    s().advanceRunnersOnWildPitch()
    expect(s().pitchCount).toBe(5)
    expect(s().awayBatterIndex).toBe(0)
    expect(s().count.balls).toBe(1)
    expect(s().count.strikes).toBe(1)
  })
})

// ─────────────────────────────────────────────
// 打者成績自動更新テスト
// ─────────────────────────────────────────────

describe('打者成績自動更新', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 0,
      currentHalf: 'top',
      awayTotal: 0,
      awayHits: 0,
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
    })
  })

  it('recordSingle: PA+1, AB+1, hits+1, totalBases+1', () => {
    s().recordSingle()
    const batter = s().awayLineup[0]!
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats)).toBe(1)
    expect(Number(batter.hits)).toBe(1)
    expect(Number(batter.totalBases)).toBe(1)
    expect(batter.battingAvg).toBe('1.000')
  })

  it('recordDouble: doubles+1, totalBases+2', () => {
    s().recordDouble()
    const batter = s().awayLineup[0]!
    expect(Number(batter.doubles)).toBe(1)
    expect(Number(batter.totalBases)).toBe(2)
  })

  it('recordTriple: triples+1, totalBases+3', () => {
    s().recordTriple()
    const batter = s().awayLineup[0]!
    expect(Number(batter.triples)).toBe(1)
    expect(Number(batter.totalBases)).toBe(3)
  })

  it('recordHomeRun: homeRuns+1, totalBases+4', () => {
    const prevHR = Number(s().awayLineup[0]!.homeRuns) || 0
    const prevRBI = Number(s().awayLineup[0]!.rbi) || 0
    s().recordHomeRun()
    const batter = s().awayLineup[0]!
    expect(Number(batter.homeRuns)).toBe(prevHR + 1)
    expect(Number(batter.totalBases)).toBe(4)
    expect(Number(batter.rbi)).toBe(prevRBI + 1) // solo HR = 1 RBI
  })

  it('recordWalk: PA+1, walks+1, AB NOT incremented', () => {
    const prevAB = Number(s().awayLineup[0]!.atBats) || 0
    s().recordWalk()
    const batter = s().awayLineup[0]!
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.walks)).toBe(1)
    expect(Number(batter.atBats) || 0).toBe(prevAB)
  })

  it('recordIntentionalWalk: intentionalWalks+1, walks+1', () => {
    s().recordIntentionalWalk()
    const batter = s().awayLineup[0]!
    expect(Number(batter.intentionalWalks)).toBe(1)
    expect(Number(batter.walks)).toBe(1)
  })

  it('recordGroundout: PA+1, AB+1', () => {
    s().recordGroundout()
    const batter = s().awayLineup[0]!
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats)).toBe(1)
    expect(batter.battingAvg).toBe('.000')
  })

  it('addStrike x3 (三振): strikeouts+1, PA+1, AB+1', () => {
    s().addStrike()
    s().addStrike()
    s().addStrike()
    const batter = s().awayLineup[0]!
    expect(Number(batter.strikeouts)).toBe(1)
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats)).toBe(1)
  })

  it('recordSacrificeBunt: sacrificeHits+1, PA+1, AB NOT incremented', () => {
    const prevAB = Number(s().awayLineup[0]!.atBats) || 0
    s().recordSacrificeBunt()
    const batter = s().awayLineup[0]!
    expect(Number(batter.sacrificeHits)).toBe(1)
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats) || 0).toBe(prevAB)
  })

  it('recordSacrificeFly: sacrificeFlies+1, PA+1, AB NOT incremented', () => {
    const prevAB = Number(s().awayLineup[0]!.atBats) || 0
    useGameStore.setState({
      runners: { first: false, second: false, third: true },
      runnerIndices: { first: null, second: null, third: 5 },
    })
    s().recordSacrificeFly()
    const batter = s().awayLineup[0]!
    expect(Number(batter.sacrificeFlies)).toBe(1)
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats) || 0).toBe(prevAB)
  })

  it('recordUncaughtThirdStrike: strikeouts+1, PA+1, AB+1', () => {
    s().recordUncaughtThirdStrike()
    const batter = s().awayLineup[0]!
    expect(Number(batter.strikeouts)).toBe(1)
    expect(Number(batter.plateAppearances)).toBe(1)
    expect(Number(batter.atBats)).toBe(1)
  })
})

// ─────────────────────────────────────────────
// lastBatterIndex 管理
// ─────────────────────────────────────────────

describe('lastBatterIndex 管理', () => {
  beforeEach(() => {
    useGameStore.setState({
      awayLineup: [...CARP_LINEUP],
      awayBatterIndex: 2,
      currentHalf: 'top',
      pitchCount: 0,
      count: { balls: 0, strikes: 0, outs: 0 },
      currentInning: 1,
      innings: [{ inning: 1, top: 0, bottom: null }],
      runners: { first: false, second: false, third: false },
      runnerIndices: { first: null, second: null, third: null },
      lastBatterIndex: null,
    })
  })

  it('recordSingle で lastBatterIndex がセットされる', () => {
    s().recordSingle()
    expect(s().lastBatterIndex).toBe(2)
  })

  it('recordGroundout で lastBatterIndex がセットされる', () => {
    s().recordGroundout()
    expect(s().lastBatterIndex).toBe(2)
  })

  it('advanceInning で lastBatterIndex が null にリセットされる', () => {
    useGameStore.setState({ lastBatterIndex: 5 })
    s().advanceInning()
    expect(s().lastBatterIndex).toBeNull()
  })

  it('3アウトによる自動イニング進行で lastBatterIndex が null にリセットされる', () => {
    useGameStore.setState({
      count: { balls: 0, strikes: 0, outs: 2 },
      lastBatterIndex: 3,
    })
    s().recordGroundout()
    expect(s().lastBatterIndex).toBeNull()
  })
})
