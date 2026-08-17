import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatterSituationalStats } from '../../../lib/npbScholar'
import { fetchNpbScholarBatterStats } from '../../../lib/npbScholar'
import { useGameStore } from '../../../store/useGameStore'
import { initialGameState, type LineupPlayer } from '../../../types'
import BatterStatsOverlay from '../BatterStatsOverlay'

vi.mock('../../../lib/npbScholar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/npbScholar')>()
  return { ...actual, fetchNpbScholarBatterStats: vi.fn() }
})

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const firstBatter: LineupPlayer = {
  order: 1,
  name: '小園 海斗',
  number: '51',
  position: '遊',
  battingAvg: '.300',
  atBats: '100',
  hits: '30',
  gameAtBats: 2,
  gameSingles: 1,
}

const secondBatter: LineupPlayer = {
  order: 2,
  name: '坂倉 将吾',
  number: '31',
  position: '捕',
  battingAvg: '.250',
  atBats: '40',
  hits: '10',
}

const firstStats: BatterSituationalStats = {
  risp: { average: '.333', atBats: 30, hits: 10 },
  nonRisp: { average: '.286', atBats: 70, hits: 20 },
  byBaseState: {
    '1st+3rd': { average: '.500', atBats: 10, hits: 5 },
  },
  byPitcherHand: {
    R: { average: '.256', atBats: 234, hits: 60 },
    L: { average: '.259', atBats: 135, hits: 35 },
  },
  byCount: {
    '2-1': { average: '.526', atBats: 19, hits: 10 },
  },
}

const secondStats: BatterSituationalStats = {
  risp: { average: '.200', atBats: 20, hits: 4 },
  nonRisp: { average: '.267', atBats: 30, hits: 8 },
  byBaseState: {
    '1st+3rd': { average: '.250', atBats: 8, hits: 2 },
  },
  byPitcherHand: {},
  byCount: {},
}

const mockedFetch = vi.mocked(fetchNpbScholarBatterStats)

beforeEach(() => {
  localStorage.clear()
  mockedFetch.mockReset()
  useGameStore.setState({
    ...initialGameState,
    currentHalf: 'top',
    awayTeam: { name: '広島東洋カープ', shortName: '広島', color: '#e60012' },
    awayLineup: [firstBatter, secondBatter],
    awayBatterIndex: 0,
    batter: { name: firstBatter.name, number: firstBatter.number, stat: '', statLabel: '' },
    pitcher: { name: '右投手', number: '18', stat: '', statLabel: '', throwHand: 'R' },
    count: { balls: 2, strikes: 1, outs: 0 },
    runners: { first: true, second: false, third: true },
  })
})

afterEach(cleanup)

describe('BatterStatsOverlay', () => {
  it('名前、ライブ打率、得点圏、走者別、投手左右別、正確なカウント別を常時表示する', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)

    expect(screen.getByText('小園 海斗')).toBeInTheDocument()
    expect(screen.getByText('.304 (102 - 31)')).toBeInTheDocument()
    expect(await screen.findByText('.333 (30 - 10)')).toBeInTheDocument()
    expect(screen.getByText('得点圏打率')).toBeInTheDocument()
    expect(screen.getByText('1-3塁')).toBeInTheDocument()
    expect(screen.getByTestId('base-state-average')).toHaveTextContent('.500 (10 - 5)')
    expect(screen.getByText('対右投手')).toBeInTheDocument()
    expect(screen.getByTestId('pitcher-hand-average')).toHaveTextContent('.256 (234 - 60)')
    expect(screen.getByText('カウント 2-1')).toBeInTheDocument()
    expect(screen.getByTestId('count-average')).toHaveTextContent('.526 (19 - 10)')
  })

  it('非得点圏では非得点圏打率だけを表示する', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    useGameStore.setState({ runners: { first: true, second: false, third: false } })

    render(<BatterStatsOverlay />)

    expect(await screen.findByText('.286 (70 - 20)')).toBeInTheDocument()
    expect(screen.getByText('非得点圏打率')).toBeInTheDocument()
    expect(screen.queryByText('得点圏打率')).not.toBeInTheDocument()
  })

  it('その試合の走者別打数・安打数を得点圏と走者別の両方へ反映する', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    useGameStore.setState({
      batterSituationalGameStats: {
        'away-51': {
          '1st+3rd': { atBats: 3, hits: 2 },
        },
      },
      batterPitcherHandGameStats: {
        'away-51': { R: { atBats: 2, hits: 1 } },
      },
      batterCountGameStats: {
        'away-51': { '2-1': { atBats: 1, hits: 1 } },
      },
    })

    render(<BatterStatsOverlay />)

    expect(await screen.findByText('.364 (33 - 12)')).toBeInTheDocument()
    expect(screen.getByTestId('base-state-average')).toHaveTextContent('.538 (13 - 7)')
    expect(screen.getByTestId('pitcher-hand-average')).toHaveTextContent('.258 (236 - 61)')
    expect(screen.getByTestId('count-average')).toHaveTextContent('.550 (20 - 11)')
  })

  it('打者が変わると名前と打率を即時更新し、前打者の詳細を残さない', async () => {
    let resolveSecond!: (stats: BatterSituationalStats) => void
    mockedFetch
      .mockResolvedValueOnce(firstStats)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    render(<BatterStatsOverlay />)
    expect(await screen.findByText('.333 (30 - 10)')).toBeInTheDocument()

    act(() => useGameStore.getState().selectBatter('away', 1))

    expect(screen.getByText('坂倉 将吾')).toBeInTheDocument()
    expect(screen.getByText('.250 (40 - 10)')).toBeInTheDocument()
    expect(screen.queryByText('.333 (30 - 10)')).not.toBeInTheDocument()
    expect(screen.getByText('取得中')).toBeInTheDocument()

    await act(async () => resolveSecond(secondStats))
    await waitFor(() => expect(screen.getByText('.200 (20 - 4)')).toBeInTheDocument())
  })

  it('2.2倍時に250x390になる基準サイズを持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    const panel = screen.getByTestId('batter-stats-panel')
    expect(Number.parseFloat(panel.style.width) * 2.2).toBeCloseTo(250, 5)
    expect(Number.parseFloat(panel.style.height) * 2.2).toBeCloseTo(390, 5)
  })

  it('通常打率を詳細打率より大きくし、詳細項目間に余白を持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByTestId('live-batter-average')).toHaveClass('text-[11px]', 'leading-tight')
    expect(screen.getByTestId('situational-stats-list')).toHaveClass('space-y-[3px]')
  })

  it('打者名を小さくし、各成績ブロックに上下paddingを持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByTestId('batter-name')).toHaveClass('text-[10px]')
    expect(screen.getByTestId('live-average-block')).toHaveClass('py-px')
    expect(screen.getAllByTestId('situational-stat-item')).toHaveLength(4)
    for (const item of screen.getAllByTestId('situational-stat-item')) {
      expect(item).toHaveClass('py-[2px]')
    }
  })

  it('得点圏以下のラベルと打率を拡大する', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByText('得点圏打率')).toHaveClass('text-[8px]')
    expect(screen.getByTestId('base-state-average')).toHaveClass('text-[10px]')
    expect(screen.getByTestId('pitcher-hand-average')).toHaveClass('text-[10px]')
    expect(screen.getByTestId('count-average')).toHaveClass('text-[10px]')
  })
})
