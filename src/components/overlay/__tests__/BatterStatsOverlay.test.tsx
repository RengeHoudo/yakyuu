import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatterSituationalStats } from '../../../lib/npbScholar'
import { fetchNpbScholarBatterStats } from '../../../lib/npbScholar'
import { clearUndoHistory, useGameStore } from '../../../store/useGameStore'
import { defaultBatterGameStats, initialGameState, type LineupPlayer } from '../../../types'
import CountControl from '../../control/CountControl'
import BatterStatsOverlay from '../BatterStatsOverlay'

vi.mock('../../../lib/npbScholar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/npbScholar')>()
  return { ...actual, fetchNpbScholarBatterStats: vi.fn(), fetchNpbScholarPitcherStats: vi.fn().mockResolvedValue(null) }
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
  walks: '20',
  hitByPitch: '5',
  sacrificeFlies: '3',
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
  clearUndoHistory()
  mockedFetch.mockReset()
  useGameStore.setState({
    ...initialGameState,
    currentHalf: 'top',
    awayTeam: { name: '広島東洋カープ', shortName: '広島', color: '#e60012' },
    awayLineup: [firstBatter, secondBatter],
    awayBatterIndex: 0,
    batterGameStats: {
      'away-51': { ...defaultBatterGameStats, gameAtBats: 2, gameSingles: 1 },
    },
    batter: { name: firstBatter.name, number: firstBatter.number, stat: '', statLabel: '' },
    pitcher: { name: '右投手', number: '18', stat: '', statLabel: '', throwHand: 'R' },
    count: { balls: 2, strikes: 1, outs: 0 },
    runners: { first: true, second: false, third: true },
  })
})

afterEach(cleanup)

describe('BatterStatsOverlay', () => {
  it('名前、ライブ打率、得点圏、走者別、投手左右別、出塁率を表示する', async () => {
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
    expect(screen.getByText('出塁率')).toBeInTheDocument()
    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.431 (四:20 - 死:5)')
    expect(screen.queryByText('カウント 2-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('count-average')).not.toBeInTheDocument()
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
    })

    render(<BatterStatsOverlay />)

    expect(await screen.findByText('.364 (33 - 12)')).toBeInTheDocument()
    expect(screen.getByTestId('base-state-average')).toHaveTextContent('.538 (13 - 7)')
    expect(screen.getByTestId('pitcher-hand-average')).toHaveTextContent('.258 (236 - 61)')
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
    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.250 (四:0 - 死:0)')
    expect(screen.queryByText('.333 (30 - 10)')).not.toBeInTheDocument()
    expect(screen.getByText('取得中')).toBeInTheDocument()

    await act(async () => resolveSecond(secondStats))
    await waitFor(() => expect(screen.getByText('.200 (20 - 4)')).toBeInTheDocument())
  })

  it('2.2倍時に250x410になる基準サイズを持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    const panel = screen.getByTestId('batter-stats-panel')
    expect(Number.parseFloat(panel.style.width) * 2.2).toBeCloseTo(250, 5)
    expect(Number.parseFloat(panel.style.height) * 2.2).toBeCloseTo(410, 5)
  })

  it('通常打率を詳細打率より大きくし、詳細項目間に余白を持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByTestId('live-batter-average')).toHaveClass('text-[13px]', 'leading-none')
    expect(screen.getByTestId('situational-stats-list')).toHaveClass('space-y-[3px]')
  })

  it('打者名を小さくし、各成績ブロックに上下paddingを持つ', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByTestId('batter-name')).toHaveClass('text-[12px]', 'leading-none')
    expect(screen.getByTestId('live-average-block')).toHaveClass('py-px')
    expect(screen.getAllByTestId('situational-stat-item')).toHaveLength(4)
    for (const item of screen.getAllByTestId('situational-stat-item')) {
      expect(item).toHaveClass('py-[2.25px]')
    }
  })

  it('得点圏以下のラベルと打率を拡大する', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByText('得点圏打率')).toHaveClass('text-[9px]')
    expect(screen.getByTestId('base-state-average')).toHaveClass('text-[11px]')
    expect(screen.getByTestId('pitcher-hand-average')).toHaveClass('text-[11px]')
    expect(screen.getByTestId('live-on-base-pct')).toHaveClass('text-[11px]')
  })

  it('左右別、得点圏、走者別、出塁率の順で表示する', async () => {
    mockedFetch.mockResolvedValue(firstStats)

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    const labels = Array.from(screen.getByTestId('situational-stats-list').children)
      .map((item) => item.firstElementChild?.textContent)
    expect(labels).toEqual(['対右投手', '得点圏打率', '1-3塁', '出塁率'])
  })

  it('指定の形式でシーズン成績の出塁率と四死球数を表示する', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    useGameStore.setState({
      awayLineup: [{
        ...firstBatter,
        atBats: '200', hits: '60', walks: '40', hitByPitch: '10', sacrificeFlies: '0',
        gameAtBats: 0, gameSingles: 0,
      }],
    })

    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.440 (四:40 - 死:10)')
  })

  it.each([
    ['単打', '.435 (四:20 - 死:5)'],
    ['二塁打', '.435 (四:20 - 死:5)'],
    ['三塁打', '.435 (四:20 - 死:5)'],
    ['HR', '.435 (四:20 - 死:5)'],
    ['四球', '.435 (四:21 - 死:5)'],
    ['故意四球', '.435 (四:21 - 死:5)'],
    ['死球', '.435 (四:20 - 死:6)'],
    ['ゴロ/飛/直', '.427 (四:20 - 死:5)'],
    ['エラー', '.427 (四:20 - 死:5)'],
    ['犠飛', '.427 (四:20 - 死:5)'],
    ['犠打', '.431 (四:20 - 死:5)'],
  ])('%sボタンの結果をライブ出塁率へ反映する', async (button, expected) => {
    mockedFetch.mockResolvedValue(firstStats)
    render(<><CountControl /><BatterStatsOverlay /></>)
    await screen.findByText('.333 (30 - 10)')

    fireEvent.click(screen.getByRole('button', { name: button }))
    // 打席結果の記録で次打者へ進むので、記録した選手を再選択する。
    act(() => useGameStore.getState().selectBatter('away', 0))

    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent(expected)
    await screen.findByText('対右投手')
  })

  it('四球ボタンを押すたびに四球数を加算し、出塁率を再計算する', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    render(<><CountControl /><BatterStatsOverlay /></>)
    await screen.findByText('.333 (30 - 10)')

    for (const expected of ['.435 (四:21 - 死:5)', '.439 (四:22 - 死:5)']) {
      fireEvent.click(screen.getByRole('button', { name: '四球' }))
      act(() => useGameStore.getState().selectBatter('away', 0))
      expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent(expected)
      await screen.findByText('対右投手')
    }
  })

  it('Undoで打者と出塁率・四死球数が記録前に戻る', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    render(<><CountControl /><BatterStatsOverlay /></>)
    await screen.findByText('.333 (30 - 10)')

    fireEvent.click(screen.getByRole('button', { name: '死球' }))
    expect(screen.getByText(secondBatter.name)).toBeInTheDocument()
    act(() => useGameStore.getState().undo())

    expect(screen.getByText(firstBatter.name)).toBeInTheDocument()
    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.431 (四:20 - 死:5)')
    await screen.findByText('対右投手')
  })

  it('試合内成績の手動編集を四死球数と出塁率へ反映する', async () => {
    mockedFetch.mockResolvedValue(firstStats)
    render(<BatterStatsOverlay />)
    await screen.findByText('.333 (30 - 10)')

    act(() => useGameStore.getState().setLineupPlayerGameStats('away', 0, {
      ...defaultBatterGameStats,
      gameAtBats: 2, gameSingles: 1, gameWalks: 2, gameHitByPitch: 1,
    }))

    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.444 (四:22 - 死:6)')
  })

  it.each(['データなし', '取得失敗'])('状況別成績が%sでも出塁率を表示する', async (status) => {
    if (status === '取得失敗') mockedFetch.mockRejectedValue(new Error('offline'))
    else mockedFetch.mockResolvedValue(null)

    render(<BatterStatsOverlay />)

    expect(screen.getByText('取得中')).toBeInTheDocument()
    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.431 (四:20 - 死:5)')
    await screen.findByText('データなし')
    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.431 (四:20 - 死:5)')
  })

  it('打撃成績が未登録でもゼロの出塁率と四死球数を表示する', async () => {
    mockedFetch.mockResolvedValue(null)
    useGameStore.setState({
      awayLineup: [{ order: 1, name: firstBatter.name, number: firstBatter.number, position: '遊' }],
    })

    render(<BatterStatsOverlay />)
    await screen.findByText('データなし')

    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('.000 (四:0 - 死:0)')
  })

  it('打者が打順表にいない場合は出塁率を未取得表示にする', async () => {
    mockedFetch.mockResolvedValue(null)
    useGameStore.setState({ batter: { name: '手入力の打者', number: '', stat: '', statLabel: '' } })

    render(<BatterStatsOverlay />)
    await screen.findByText('データなし')

    expect(screen.getByTestId('live-on-base-pct')).toHaveTextContent('-- (四:-- - 死:--)')
  })
})
