import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LineupPlayer, Runners } from '../../types'
import {
  clearNpbScholarCache,
  fetchNpbScholarBatterStats,
  getBaseState,
  getLiveBatterAverage,
  parseNpbScholarBatterStats,
} from '../npbScholar'

const BASE_STATE_PAYLOAD = {
  table_tabs: {
    base_state: {
      rows: [
        { Split: 'Empty', AVG: '.200', AB: '100', H: '20' },
        { Split: '1st', AVG: '.400', AB: '20', H: '8' },
        { Split: 'RISP', AVG: '.300', AB: '40', H: '12' },
        { Split: '1st+2nd', AVG: '.250', AB: '12', H: '3' },
        { Split: '1st+3rd', AVG: '.500', AB: '10', H: '5' },
        { Split: '2nd+3rd', AVG: '.333', AB: '9', H: '3' },
        { Split: 'Loaded', AVG: '.125', AB: '8', H: '1' },
      ],
    },
  },
}

describe('parseNpbScholarBatterStats', () => {
  it('得点圏と現在の走者別成績を抽出する', () => {
    const stats = parseNpbScholarBatterStats(BASE_STATE_PAYLOAD)

    expect(stats.risp).toEqual({ average: '.300', atBats: 40, hits: 12 })
    expect(stats.byBaseState['1st+3rd']).toEqual({ average: '.500', atBats: 10, hits: 5 })
    expect(stats.byBaseState.Loaded).toEqual({ average: '.125', atBats: 8, hits: 1 })
  })

  it('非得点圏打率は Empty と 1st の打数・安打数を合算して計算する', () => {
    const stats = parseNpbScholarBatterStats(BASE_STATE_PAYLOAD)

    expect(stats.nonRisp).toEqual({ average: '.233', atBats: 120, hits: 28 })
  })
})

describe('getBaseState', () => {
  it.each<[Runners, string, string]>([
    [{ first: false, second: false, third: false }, 'Empty', '走者なし'],
    [{ first: true, second: false, third: false }, '1st', '1塁'],
    [{ first: false, second: true, third: false }, '2nd', '2塁'],
    [{ first: false, second: false, third: true }, '3rd', '3塁'],
    [{ first: true, second: true, third: false }, '1st+2nd', '1-2塁'],
    [{ first: true, second: false, third: true }, '1st+3rd', '1-3塁'],
    [{ first: false, second: true, third: true }, '2nd+3rd', '2-3塁'],
    [{ first: true, second: true, third: true }, 'Loaded', '満塁'],
  ])('%o を %s / %s に対応付ける', (runners, split, label) => {
    expect(getBaseState(runners)).toEqual({ split, label })
  })
})

describe('getLiveBatterAverage', () => {
  it('既存のシーズン成績に試合内成績を加えた打率・打数・安打数を返す', () => {
    const player: LineupPlayer = {
      order: 1,
      name: '小園 海斗',
      number: '51',
      position: '遊',
      atBats: '100',
      hits: '30',
      battingAvg: '.300',
      gameAtBats: 2,
      gameSingles: 1,
    }

    expect(getLiveBatterAverage(player)).toEqual({ average: '.304', atBats: 102, hits: 31 })
  })
})

describe('fetchNpbScholarBatterStats', () => {
  beforeEach(() => clearNpbScholarCache())

  it('空白を除いた選手名とチーム名でslugを解決して走者別JSONを取得する', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        players: [
          {
            slug: 'hb-5715ca9602',
            player_type: 'batter',
            player_name: '小園海斗',
            team_name: '広島東洋カープ',
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(BASE_STATE_PAYLOAD), { status: 200 }))

    const stats = await fetchNpbScholarBatterStats('小園 海斗', '広島東洋カープ', fetcher)

    expect(stats?.risp.average).toBe('.300')
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://npbscholar.com/data/players/hb-5715ca9602.json',
      { cache: 'no-store' },
    )
  })
})
