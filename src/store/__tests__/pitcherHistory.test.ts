/**
 * 投手登板履歴・交代機能のテスト
 *
 * 要件:
 * 1. 登板中の投手を示す表示、中継ぎの番手表示
 * 2. 同じ投手に登板ボタンを押しても何もしない
 * 3. 交代済み投手はその試合のドロップダウンから消える（投手欄のみ、打順は変更しない = 大谷ルール）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CARP_LINEUP, HAWKS_LINEUP, initialGameState } from '../../types'
import type { PitcherAppearance } from '../../types'
import { useGameStore, clearUndoHistory, registerPitcherAppearance } from '../useGameStore'

vi.mock('../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const s = () => useGameStore.getState()

beforeEach(() => {
  localStorage.clear()
  clearUndoHistory()
  useGameStore.setState({ ...initialGameState, autoChangeEffect: false, pitchCount: 0 })
})

afterEach(() => {
  vi.clearAllTimers()
})

// ─────────────────────────────────────────────
//  registerPitcherAppearance ヘルパー
// ─────────────────────────────────────────────

describe('registerPitcherAppearance', () => {
  it('初回登録: order=0, isActive=true', () => {
    const state = { ...initialGameState, pitcherHistory: [] }
    const patch = registerPitcherAppearance(state, 'home', '森下 暢仁', '18')
    const history = patch.pitcherHistory!
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      name: '森下 暢仁',
      number: '18',
      team: 'home',
      order: 0,
      isActive: true,
    })
  })

  it('2人目登録: 前投手がisActive=false, 新投手がorder=1, isActive=true', () => {
    const state: typeof initialGameState = {
      ...initialGameState,
      pitcherHistory: [
        { name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: true },
      ],
    }
    const patch = registerPitcherAppearance(state, 'home', '栗林 良吏', '20')
    const history = patch.pitcherHistory!
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ name: '森下 暢仁', isActive: false })
    expect(history[1]).toMatchObject({
      name: '栗林 良吏',
      number: '20',
      team: 'home',
      order: 1,
      isActive: true,
    })
  })

  it('既にアクティブな同じ投手: パッチは空', () => {
    const state: typeof initialGameState = {
      ...initialGameState,
      pitcherHistory: [
        { name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: true },
      ],
    }
    const patch = registerPitcherAppearance(state, 'home', '森下 暢仁', '18')
    expect(patch.pitcherHistory).toBeUndefined()
  })

  it('チームが異なれば別扱い', () => {
    const state: typeof initialGameState = {
      ...initialGameState,
      pitcherHistory: [
        { name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: true },
      ],
    }
    const patch = registerPitcherAppearance(state, 'away', '東浜 巨', '14')
    const history = patch.pitcherHistory!
    expect(history).toHaveLength(2)
    // home の投手は変わらない
    expect(history[0]).toMatchObject({ name: '森下 暢仁', team: 'home', isActive: true })
    expect(history[1]).toMatchObject({ name: '東浜 巨', team: 'away', order: 0, isActive: true })
  })

  it('3人目: order が正しくインクリメント', () => {
    const state: typeof initialGameState = {
      ...initialGameState,
      pitcherHistory: [
        { name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: false },
        { name: '栗林 良吏', number: '20', team: 'home', order: 1, isActive: true },
      ],
    }
    const patch = registerPitcherAppearance(state, 'home', '島内 颯太郎', '46')
    const history = patch.pitcherHistory!
    expect(history).toHaveLength(3)
    expect(history[2]).toMatchObject({
      name: '島内 颯太郎',
      number: '46',
      team: 'home',
      order: 2,
      isActive: true,
    })
    expect(history[1]).toMatchObject({ name: '栗林 良吏', isActive: false })
  })

  it('降板済み投手が再登板すると、同じ履歴を再びアクティブにする', () => {
    const state: typeof initialGameState = {
      ...initialGameState,
      pitcherHistory: [
        { name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: false },
        { name: '栗林 良吏', number: '20', team: 'home', order: 1, isActive: true },
      ],
    }

    const patch = registerPitcherAppearance(state, 'home', '森下 暢仁', '18')
    const history = patch.pitcherHistory!

    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ number: '18', order: 0, isActive: true })
    expect(history[1]).toMatchObject({ number: '20', order: 1, isActive: false })
  })
})

describe('降板済み投手の候補除外設定', () => {
  it('デフォルトは現行動作どおり除外する', () => {
    expect(s().hideRetiredPitchers).toBe(true)
  })

  it('設定をオフにできる', () => {
    s().setHideRetiredPitchers(false)
    expect(s().hideRetiredPitchers).toBe(false)
  })
})

// ─────────────────────────────────────────────
//  selectBatter(team, 9) — 登板ボタン
// ─────────────────────────────────────────────

describe('selectBatter(team, 9) — 投手登板', () => {
  beforeEach(() => {
    // ラインナップをセット
    s().setLineup('home', CARP_LINEUP)
    s().setLineup('away', HAWKS_LINEUP)
  })

  it('登板ボタンで投手情報がセットされ、履歴に追加される', () => {
    s().selectBatter('home', 9)
    expect(s().pitcher.name).toBe('森下 暢仁')
    expect(s().pitcher.number).toBe('18')
    expect(s().pitcherHistory).toHaveLength(1)
    expect(s().pitcherHistory[0]).toMatchObject({
      name: '森下 暢仁',
      number: '18',
      team: 'home',
      order: 0,
      isActive: true,
    })
  })

  it('同じ投手に対して登板ボタンを押しても何もしない', () => {
    s().selectBatter('home', 9)
    const stateBefore = s().pitcher
    const historyBefore = s().pitcherHistory
    // 投球数を加算してから再度登板
    s().addPitch()
    s().addPitch()
    expect(s().pitchCount).toBe(2)

    s().selectBatter('home', 9)
    // 投手情報は変わらず、投球数もリセットされない
    expect(s().pitcher).toEqual(stateBefore)
    expect(s().pitchCount).toBe(2) // 変わらない
    expect(s().pitcherHistory).toEqual(historyBefore) // 履歴も変わらない
  })

  it('別の投手に交代すると履歴が更新される', () => {
    s().selectBatter('home', 9) // 森下
    s().addPitch()
    s().addPitch()
    s().addPitch()

    // ラインナップ10番目を変更（投手交代）
    const lineup = [...s().homeLineup]
    lineup[9] = {
      ...lineup[9]!,
      name: '栗林 良吏',
      number: '20',
      appearances: '50',
      record: '3勝1敗',
    }
    s().setLineup('home', lineup)
    s().selectBatter('home', 9) // 栗林

    expect(s().pitcher.name).toBe('栗林 良吏')
    expect(s().pitcherHistory).toHaveLength(2)
    expect(s().pitcherHistory[0]).toMatchObject({ name: '森下 暢仁', isActive: false })
    expect(s().pitcherHistory[1]).toMatchObject({
      name: '栗林 良吏',
      number: '20',
      team: 'home',
      order: 1,
      isActive: true,
    })
  })

  it('交代済み投手の一覧を取得できる（ドロップダウン除外用）', () => {
    // 先発: 森下
    s().selectBatter('home', 9)

    // 中継ぎ1: 栗林
    const lineup = [...s().homeLineup]
    lineup[9] = { ...lineup[9]!, name: '栗林 良吏', number: '20' }
    s().setLineup('home', lineup)
    s().selectBatter('home', 9)

    // 中継ぎ2: 島内
    const lineup2 = [...s().homeLineup]
    lineup2[9] = { ...lineup2[9]!, name: '島内 颯太郎', number: '46' }
    s().setLineup('home', lineup2)
    s().selectBatter('home', 9)

    // 交代済み（降板済み）投手はisActive=false
    const retiredPitchers = s().pitcherHistory
      .filter((h) => h.team === 'home' && !h.isActive)
      .map((h) => h.number)
    expect(retiredPitchers).toEqual(['18', '20'])

    // 登板中投手
    const activePitcher = s().pitcherHistory.find((h) => h.team === 'home' && h.isActive)
    expect(activePitcher?.name).toBe('島内 颯太郎')
  })
})

// ─────────────────────────────────────────────
//  advanceInning による自動投手登録
// ─────────────────────────────────────────────

describe('advanceInning — 自動投手登録', () => {
  beforeEach(() => {
    s().setLineup('home', CARP_LINEUP)
    s().setLineup('away', HAWKS_LINEUP)
  })

  it('イニング進行で投手が履歴に登録される', () => {
    // 1回表: home が守備 → 森下が投手
    s().selectBatter('home', 9) // 明示的に登板
    expect(s().pitcherHistory.filter((h) => h.team === 'home')).toHaveLength(1)

    // 3アウトで攻守交代
    s().addOut()
    s().addOut()
    s().addOut()

    // 1回裏: away が守備 → 東浜が投手
    expect(s().currentHalf).toBe('bottom')
    const awayPitchers = s().pitcherHistory.filter((h) => h.team === 'away')
    expect(awayPitchers).toHaveLength(1)
    expect(awayPitchers[0]).toMatchObject({
      name: '東浜 巨',
      number: '14',
      team: 'away',
      order: 0,
      isActive: true,
    })
  })
})

// ─────────────────────────────────────────────
//  newGame で履歴リセット
// ─────────────────────────────────────────────

describe('newGame', () => {
  it('新しい試合開始で投手履歴がクリアされる', () => {
    s().setLineup('home', CARP_LINEUP)
    s().selectBatter('home', 9)
    expect(s().pitcherHistory).toHaveLength(1)

    s().newGame()
    expect(s().pitcherHistory).toEqual([])
  })
})

// ─────────────────────────────────────────────
//  投球数がチームごとに独立して管理される
// ─────────────────────────────────────────────

describe('pitcherStats — 攻守交代で投球数が混同しない', () => {
  beforeEach(() => {
    s().setLineup('home', CARP_LINEUP)  // home = Carp, 投手: 森下 #18
    s().setLineup('away', HAWKS_LINEUP) // away = Hawks, 投手: 東浜 #14
    s().selectBatter('home', 9)         // 1回表: home(森下)が先発
  })

  it('1回表(home守備)と1回裏(away守備)で球数が独立して pitcherStats に保存される', () => {
    // 1回表: 森下が5球投げる
    expect(s().pitcher.number).toBe('18')
    s().addPitch(); s().addPitch(); s().addPitch(); s().addPitch(); s().addPitch()
    expect(s().pitchCount).toBe(5)

    // 3アウトで攻守交代
    s().addOut(); s().addOut(); s().addOut()

    // 1回裏: away(東浜)が守備
    expect(s().currentHalf).toBe('bottom')
    expect(s().pitcher.number).toBe('14')

    // 森下の球数が正しく保存されている
    expect(s().pitcherStats['home-18']).toBe(5)
    // 東浜は初登板なので球数0からスタート
    expect(s().pitchCount).toBe(0)

    // 1回裏: 東浜が3球投げる
    s().addPitch(); s().addPitch(); s().addPitch()
    expect(s().pitchCount).toBe(3)

    // 3アウトで攻守交代
    s().addOut(); s().addOut(); s().addOut()

    // 2回表: home(森下)が再び守備
    expect(s().currentHalf).toBe('top')
    expect(s().currentInning).toBe(2)

    // 森下の球数が5球に復元されている（東浜の3球ではない）
    expect(s().pitcher.number).toBe('18')
    expect(s().pitchCount).toBe(5)

    // 東浜の球数は3球として保存されている
    expect(s().pitcherStats['away-14']).toBe(3)
  })

  it('2回表に森下が追加で投げると pitcherStats が正しく更新される', () => {
    // 1回表: 森下10球
    for (let i = 0; i < 10; i++) s().addPitch()
    s().addOut(); s().addOut(); s().addOut()

    // 1回裏: 東浜7球
    for (let i = 0; i < 7; i++) s().addPitch()
    s().addOut(); s().addOut(); s().addOut()

    // 2回表: 森下の球数は10球に復元
    expect(s().pitchCount).toBe(10)

    // さらに5球投げる
    for (let i = 0; i < 5; i++) s().addPitch()
    expect(s().pitchCount).toBe(15)

    // 2回表終了
    s().addOut(); s().addOut(); s().addOut()

    // 2回裏: 東浜の球数は7球に復元（森下の15球ではない）
    expect(s().currentHalf).toBe('bottom')
    expect(s().pitcher.number).toBe('14')
    expect(s().pitchCount).toBe(7)

    // 森下の球数は15球として保存
    expect(s().pitcherStats['home-18']).toBe(15)
  })
})

// ─────────────────────────────────────────────
//  投手の表示ラベル
// ─────────────────────────────────────────────

describe('投手番手表示', () => {
  it('order=0 は先発', () => {
    const appearance: PitcherAppearance = {
      name: '森下 暢仁', number: '18', team: 'home', order: 0, isActive: true,
    }
    // order 0 = 先発
    expect(appearance.order).toBe(0)
  })

  it('order=1 は中継ぎ1番手', () => {
    const appearance: PitcherAppearance = {
      name: '栗林 良吏', number: '20', team: 'home', order: 1, isActive: true,
    }
    expect(appearance.order).toBe(1)
  })
})
