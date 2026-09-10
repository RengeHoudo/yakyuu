import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchNpbScholarBatterStats, fetchNpbScholarPitcherStats } from '../../../lib/npbScholar'
import { clearUndoHistory, useGameStore } from '../../../store/useGameStore'
import { initialGameState, type LineupPlayer } from '../../../types'
import BatterStatsOverlay from '../BatterStatsOverlay'

vi.mock('../../../lib/npbScholar', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../lib/npbScholar')>(),
  fetchNpbScholarBatterStats: vi.fn(),
  fetchNpbScholarPitcherStats: vi.fn(),
}))
vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(), restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const first: LineupPlayer = { order: 1, name: '打者A', number: '1', position: '遊', batHand: 'R' }
const second: LineupPlayer = { order: 2, name: '打者B', number: '2', position: '捕', batHand: 'L' }
const pitcherStats = {
  era: '2.50', whip: '1.12',
  average: { average: '.240', atBats: 300, hits: 72 },
  byBatterHand: {
    R: { average: '.200', atBats: 100, hits: 20 },
    L: { average: '.260', atBats: 200, hits: 52 },
  },
  onBasePct: '.337', walks: 42, hitByPitch: 2,
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  clearUndoHistory()
  vi.mocked(fetchNpbScholarBatterStats).mockReset().mockResolvedValue(null)
  vi.mocked(fetchNpbScholarPitcherStats).mockReset().mockResolvedValue(pitcherStats)
  useGameStore.setState({
    ...initialGameState,
    awayTeam: { name: '打撃側', shortName: '攻', color: '#123456' },
    homeTeam: { name: '守備側', shortName: '守', color: '#654321' },
    awayLineup: [first, second],
    batter: { name: first.name, number: first.number, stat: '', statLabel: '' },
    pitcher: { name: '投手A', number: '18', stat: '', statLabel: '', throwHand: 'R' },
  })
})

afterEach(() => { cleanup(); vi.useRealTimers() })

async function mount() {
  await act(async () => { render(<BatterStatsOverlay />) })
}

async function advance(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

describe('打者・投手の成績切り替え', () => {
  it('打者15秒、投手15秒を繰り返し、投手の全項目を表示する', async () => {
    await mount()
    expect(screen.getByTestId('batter-name')).toHaveTextContent('打者A')
    await advance(14999)
    expect(screen.queryByTestId('pitcher-stats-panel')).not.toBeInTheDocument()
    await advance(1)
    expect(screen.queryByTestId('batter-stats-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('pitcher-name')).toHaveTextContent('投手A')
    expect(screen.getByTestId('pitcher-era')).toHaveTextContent('2.50')
    expect(screen.getByTestId('pitcher-whip')).toHaveTextContent('1.12')
    expect(screen.getByTestId('pitcher-average')).toHaveTextContent('.240 (300 - 72)')
    expect(screen.getByText('対右打者 被打率')).toBeInTheDocument()
    expect(screen.getByTestId('batter-hand-average')).toHaveTextContent('.200 (100 - 20)')
    expect(screen.getByTestId('pitcher-on-base-pct')).toHaveTextContent('.337 (四:42 - 死:2)')
    expect(screen.getByTestId('pitcher-stats-list')).toHaveClass('border-t')
    const panel = screen.getByTestId('pitcher-stats-panel')
    expect(Number.parseFloat(panel.style.width) * 2.2).toBeCloseTo(250)
    expect(Number.parseFloat(panel.style.height) * 2.2).toBeCloseTo(410)
    expect(fetchNpbScholarPitcherStats).toHaveBeenCalledWith('投手A', '守備側')
    await advance(14999)
    expect(screen.getByTestId('pitcher-stats-panel')).toBeInTheDocument()
    await advance(1)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
    await advance(15000)
    expect(screen.getByTestId('pitcher-stats-panel')).toBeInTheDocument()
  })

  it.each([5000, 20000])('%i ms後の打順変更で打者表示に戻り、15秒を数え直す', async (elapsed) => {
    await mount()
    await advance(elapsed)
    await act(async () => useGameStore.getState().selectBatter('away', 1))
    expect(screen.getByTestId('batter-name')).toHaveTextContent('打者B')
    await advance(14999)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
    await advance(1)
    expect(screen.getByText('対左打者 被打率')).toBeInTheDocument()
    expect(screen.getByTestId('batter-hand-average')).toHaveTextContent('.260 (200 - 52)')
  })

  it('同じ打順の代打でも即座に打者表示へ戻す', async () => {
    await mount()
    await advance(20000)
    await act(async () => useGameStore.getState().setLineupPlayer('away', 0, {
      ...second, order: 1, position: '代',
    }))
    expect(screen.getByTestId('batter-name')).toHaveTextContent('打者B')
    await advance(14999)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
    await advance(1)
    expect(screen.getByTestId('pitcher-stats-panel')).toBeInTheDocument()
  })

  it('同じ選手が別の打順へ移ってもタイマーをリセットする', async () => {
    await mount()
    await advance(20000)
    await act(async () => useGameStore.setState({
      awayLineup: [second, { ...first, order: 2 }], awayBatterIndex: 1,
    }))
    expect(screen.getByTestId('batter-name')).toHaveTextContent('打者A')
    await advance(14999)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
  })

  it('カウント・走者・成績更新でタイマーをリセットしない', async () => {
    await mount()
    await advance(10000)
    await act(async () => useGameStore.setState({
      count: { balls: 1, strikes: 1, outs: 1 },
      runners: { first: true, second: false, third: false },
      awayLineup: [{ ...first, gameAtBats: 1 }, second],
      batter: { ...useGameStore.getState().batter, stat: '.250' },
    }))
    await advance(5000)
    expect(screen.getByTestId('pitcher-stats-panel')).toBeInTheDocument()
  })

  it.each(['L', 'R', 'S', undefined] as const)('打席が%sの打者に対応する左右別成績を表示する', async (batHand) => {
    useGameStore.setState({ awayLineup: [{ ...first, batHand }] })
    await mount()
    await advance(15000)
    expect(screen.getByTestId('batter-hand-average')).toHaveTextContent(
      batHand === undefined ? '-- (-- - --)' : batHand === 'R' ? '.200 (100 - 20)' : '.260 (200 - 52)',
    )
  })

  it('スイッチ打者は左投手には右打席を使い、手動指定の打席を優先する', async () => {
    useGameStore.setState({
      awayLineup: [{ ...first, batHand: 'S', switchHitter: true }],
      pitcher: { ...useGameStore.getState().pitcher, throwHand: 'L' },
    })
    await mount()
    await advance(15000)
    expect(screen.getByText('対右打者 被打率')).toBeInTheDocument()
    await act(async () => useGameStore.setState({ awayLineup: [{ ...first, batHand: 'L', switchHitter: true }] }))
    expect(screen.getByText('対左打者 被打率')).toBeInTheDocument()
  })

  it('投手交代時に古い成績を消し、遅れて完了した前投手の取得を無視する', async () => {
    let resolveOld!: (value: typeof pitcherStats) => void
    vi.mocked(fetchNpbScholarPitcherStats)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ ...pitcherStats, era: '3.00' })
    await mount()
    await advance(15000)
    expect(screen.getByText('取得中')).toBeInTheDocument()
    await act(async () => useGameStore.getState().setPitcher({ name: '投手B', number: '19', stat: '', statLabel: '' }))
    expect(screen.getByTestId('pitcher-name')).toHaveTextContent('投手B')
    expect(screen.getByTestId('pitcher-era')).toHaveTextContent('3.00')
    await act(async () => resolveOld(pitcherStats))
    expect(screen.getByTestId('pitcher-era')).toHaveTextContent('3.00')
  })

  it.each(['該当なし', '通信失敗'])('投手成績が%sでもパネルと交互表示を維持する', async (reason) => {
    if (reason === '通信失敗') vi.mocked(fetchNpbScholarPitcherStats).mockRejectedValue(new Error('offline'))
    else vi.mocked(fetchNpbScholarPitcherStats).mockResolvedValue(null)
    await mount()
    await advance(15000)
    expect(screen.getByTestId('pitcher-name')).toHaveTextContent('投手A')
    expect(screen.getByText('データなし')).toBeInTheDocument()
    await advance(15000)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
  })

  it('投手未登録の場合は打者表示を維持し、アンマウント時にタイマーを破棄する', async () => {
    useGameStore.setState({ pitcher: initialGameState.pitcher })
    await mount()
    await advance(30000)
    expect(screen.getByTestId('batter-stats-panel')).toBeInTheDocument()
    expect(fetchNpbScholarPitcherStats).not.toHaveBeenCalled()
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})
