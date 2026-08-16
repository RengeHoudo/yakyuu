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
}

const secondStats: BatterSituationalStats = {
  risp: { average: '.200', atBats: 20, hits: 4 },
  nonRisp: { average: '.267', atBats: 30, hits: 8 },
  byBaseState: {
    '1st+3rd': { average: '.250', atBats: 8, hits: 2 },
  },
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
    runners: { first: true, second: false, third: true },
  })
})

afterEach(cleanup)

describe('BatterStatsOverlay', () => {
  it('名前、既存のライブ打率、得点圏打率、現在の走者別打率を表示する', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)

    expect(screen.getByText('小園 海斗')).toBeInTheDocument()
    expect(screen.getByText('.304 (102 - 31)')).toBeInTheDocument()
    expect(await screen.findByText('.333 (30 - 10)')).toBeInTheDocument()
    expect(screen.getByText('得点圏打率')).toBeInTheDocument()
    expect(screen.getByText('1-3塁')).toBeInTheDocument()
    expect(screen.getByTestId('base-state-average')).toHaveTextContent('.500 (10 - 5)')
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
    })

    render(<BatterStatsOverlay />)

    expect(await screen.findByText('.364 (33 - 12)')).toBeInTheDocument()
    expect(screen.getByTestId('base-state-average')).toHaveTextContent('.538 (13 - 7)')
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

  it('2.2倍時に315x340になる基準サイズを持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    const panel = screen.getByTestId('batter-stats-panel')
    expect(Number.parseFloat(panel.style.width) * 2.2).toBeCloseTo(315, 5)
    expect(Number.parseFloat(panel.style.height) * 2.2).toBeCloseTo(340, 5)
  })
})
