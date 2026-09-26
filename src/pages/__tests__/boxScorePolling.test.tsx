import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useBoxScorePolling } from '../ControlPage'
import { useGameStore } from '../../store/useGameStore'
import { initialGameState } from '../../types'
import { fetchBoxScorePage } from '../../lib/fetchProxy'

vi.mock('../../lib/fetchProxy', () => ({ fetchBoxScorePage: vi.fn() }))
vi.mock('../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../lib/idbBackup', () => ({ backupToIDB: vi.fn(), restoreFromIDB: vi.fn().mockResolvedValue(null) }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(fetchBoxScorePage).mockReset()
  useGameStore.setState({ ...structuredClone(initialGameState), scoreUrl: 'https://npb.jp/scores/2026/0925/c-g-24/' })
})
afterEach(() => { vi.useRealTimers() })

it('直ちに取得し、その後5分ごとに再取得する。失敗時も次回再試行する', async () => {
  vi.mocked(fetchBoxScorePage).mockResolvedValue({ ok: true, text: async () => '<html></html>' } as Response)
  const hook = renderHook(() => useBoxScorePolling())
  await act(async () => { await Promise.resolve() })
  expect(fetchBoxScorePage).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(299999) })
  expect(fetchBoxScorePage).toHaveBeenCalledTimes(1)
  vi.mocked(fetchBoxScorePage).mockRejectedValueOnce(new Error('offline'))
  const saved = useGameStore.getState().boxScoreData
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(useGameStore.getState().boxScoreData).toEqual(saved)
  await act(async () => { await vi.advanceTimersByTimeAsync(300000) })
  expect(fetchBoxScorePage).toHaveBeenCalledTimes(3)
  hook.unmount()
  await vi.advanceTimersByTimeAsync(300000)
  expect(fetchBoxScorePage).toHaveBeenCalledTimes(3)
})

it('URL切り替え後に届いた旧試合の応答を破棄する', async () => {
  let resolve!: (r: Response) => void
  vi.mocked(fetchBoxScorePage).mockReturnValueOnce(new Promise(r => { resolve = r }))
  const hook = renderHook(() => useBoxScorePolling())
  act(() => useGameStore.getState().setScoreUrl(''))
  await act(async () => { resolve({ ok: true, text: async () => '<html></html>' } as Response) })
  expect(useGameStore.getState().boxScoreData).toBeNull()
  hook.unmount()
})
