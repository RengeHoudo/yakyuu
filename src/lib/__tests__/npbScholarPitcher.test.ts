import { describe, expect, it } from 'vitest'
import { parseNpbScholarPitcherStats } from '../npbScholar'

// NPB Scholarの公開投手JSONと同じフィールド構造（値はテスト用）。
const payload = {
  snapshot: { era: 2.5, whip: 1.12 },
  pitcher_batted_summary: { AB: '300', H: '72', BB: '42', HBP: '2', SF: '0', BA: '.240', OBP: '.337' },
  table_tabs: {
    vs_hand: { rows: [
      { Group: '別区分', Split: '対右打者', BA: '.999', AB: '1', H: '1' },
      { Group: '対左右', Split: '対右打者', BA: '.200', AB: '100', H: '20' },
      { Group: '対左右', Split: '対左打者', BA: '.260', AB: '200', H: '52' },
    ] },
  },
}

describe('parseNpbScholarPitcherStats', () => {
  it('snapshot、被打撃サマリー、Group=対左右から必要な成績を抽出する', () => {
    expect(parseNpbScholarPitcherStats(payload)).toEqual({
      era: '2.50', whip: '1.12',
      average: { average: '.240', atBats: 300, hits: 72 },
      byBatterHand: {
        R: { average: '.200', atBats: 100, hits: 20 },
        L: { average: '.260', atBats: 200, hits: 52 },
      },
      onBasePct: '.337', walks: 42, hitByPitch: 2,
    })
  })

  it('率が省略されているときは生のカウントから算出し、犠飛を分母に含める', () => {
    const stats = parseNpbScholarPitcherStats({
      ...payload,
      pitcher_batted_summary: { AB: 100, H: 30, BB: 10, HBP: 2, SF: 3 },
    })
    expect(stats?.average).toEqual({ average: '.300', atBats: 100, hits: 30 })
    expect(stats?.onBasePct).toBe('.365')
  })

  it('欠損データをゼロに置き換えず、既知のゼロは保持する', () => {
    const stats = parseNpbScholarPitcherStats({
      snapshot: { era: null, whip: '-' },
      pitcher_batted_summary: { BB: '0', HBP: '-' },
    })
    expect(stats).toMatchObject({ era: null, whip: null, walks: 0, hitByPitch: null, onBasePct: null })
    expect(stats?.average).toBeUndefined()
    expect(stats?.byBatterHand).toEqual({})
  })

  it.each([null, {}, { table_tabs: {} }])('投手データがない %j はnullを返す', (value) => {
    expect(parseNpbScholarPitcherStats(value)).toBeNull()
  })

  it('打数ゼロでもNaNやInfinityを出さない', () => {
    const stats = parseNpbScholarPitcherStats({
      snapshot: { era: 0, whip: 0 },
      pitcher_batted_summary: { AB: '0', H: '0', BB: '0', HBP: '0', SF: '0' },
    })
    expect(stats?.average?.average).toBe('.000')
    expect(stats?.onBasePct).toBe('.000')
    expect(stats?.era).toBe('0.00')
  })
})
