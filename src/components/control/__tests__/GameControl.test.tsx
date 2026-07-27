import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { initialGameState } from '../../../types'
import { useGameStore } from '../../../store/useGameStore'
import { useRosterStore } from '../../../store/useRosterStore'
import GameControl from '../GameControl'

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

beforeEach(() => {
  localStorage.clear()
  useGameStore.setState({ ...initialGameState })
  useRosterStore.setState({ awayRoster: [], homeRoster: [] })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GameControl - オールスターURL適用', () => {
  it('cl-pl の先頭をホーム、2番目をアウェイとして名前と色を設定する', async () => {
    render(<GameControl />)

    fireEvent.change(
      screen.getByPlaceholderText('https://npb.jp/scores/2026/0405/c-t-03/'),
      { target: { value: 'https://npb.jp/scores/2026/0727/cl-pl-01/' } },
    )
    fireEvent.click(screen.getByRole('button', { name: '適用' }))

    await waitFor(() => {
      const state = useGameStore.getState()
      expect(state.awayTeam).toMatchObject({
        name: 'Pacific',
        shortName: 'Pacific',
        color: '#61AFE0',
      })
      expect(state.homeTeam).toMatchObject({
        name: 'Central',
        shortName: 'Central',
        color: '#0F8F2C',
      })
      expect(state.scoreUrl).toBe('https://npb.jp/scores/2026/0727/cl-pl-01/')
    })
  })
})
