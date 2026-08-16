import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../../store/useGameStore'
import { CARP_LINEUP, initialGameState } from '../../../types'
import BoxScoreOverlay from '../BoxScoreOverlay'

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

beforeEach(() => {
  localStorage.clear()
  useGameStore.setState({
    ...initialGameState,
    autoChangeEffect: false,
    currentHalf: 'top',
    awayLineup: [...CARP_LINEUP],
    awayBatterIndex: 0,
    batter: { name: '秋山 翔吾', number: '55', stat: '', statLabel: '' },
    boxScoreData: {
      away: [
        { order: 1, name: '秋山', results: [{ text: '右安', type: 'hit' }] },
      ],
      home: [],
      fetchedAt: 1,
    },
  })
})

afterEach(cleanup)

describe('BoxScoreOverlay', () => {
  it('現在打者を打席結果のない代打へ変更すると古い打席結果を消す', () => {
    render(<BoxScoreOverlay />)
    expect(screen.getByText('右安')).toBeInTheDocument()

    act(() => {
      useGameStore.getState().setLineupPlayer('away', 0, {
        ...CARP_LINEUP[0]!,
        name: '代打 太郎',
        number: '99',
      })
    })

    expect(screen.queryByText('右安')).not.toBeInTheDocument()
  })
})
