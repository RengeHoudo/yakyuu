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
  vi.unstubAllEnvs()
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

it('名簿取得の422では中継タイムアウトと回避手段を表示し、既存名簿を保持する', async () => {
  vi.stubEnv('PROD', true)
  const roster = [{ positionCategory: '投手' as const, number: '1', name: '登録済み 選手' }]
  useRosterStore.setState({ awayRoster: roster })
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    message: 'Request failed: Timeout was reached',
  }), { status: 422 }))
  render(<GameControl />)

  fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'DeNA' } })

  expect(await screen.findByText(/NPB取得プロキシ（r.jina.ai）でタイムアウトしました/)).toHaveTextContent('手動でCSVをインポート')
  expect(useRosterStore.getState().awayRoster).toEqual(roster)
  expect(screen.getAllByRole('combobox')[0]).toBeEnabled()
})
