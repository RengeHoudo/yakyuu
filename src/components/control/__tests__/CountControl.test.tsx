import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CARP_LINEUP, initialGameState } from '../../../types'
import { clearUndoHistory, extractGameState, useGameStore } from '../../../store/useGameStore'
import CountControl from '../CountControl'

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const state = () => useGameStore.getState()

beforeEach(() => {
  localStorage.clear()
  clearUndoHistory()
  useGameStore.setState({
    ...initialGameState,
    autoChangeEffect: false,
    awayLineup: [...CARP_LINEUP],
    homeLineup: [...CARP_LINEUP],
    currentHalf: 'top',
    awayBatterIndex: 3,
    count: { balls: 1, strikes: 2, outs: 0 },
    pitchCount: 10,
    runners: { first: true, second: true, third: true },
    runnerIndices: { first: 0, second: 1, third: 2 },
    runnerResponsiblePitcher: { first: 'home-18', second: 'home-19', third: 'home-20' },
    pitcher: { name: '投手', number: '21', stat: '', statLabel: '' },
  })
})

afterEach(cleanup)

describe('アウト・振逃ボタンの有効条件', () => {
  for (const outs of [0, 1, 2]) {
    for (const strikes of [0, 1, 2]) {
      for (let bases = 0; bases < 8; bases++) {
        it(`outs=${outs}, strikes=${strikes}, bases=${bases}`, () => {
          const first = Boolean(bases & 1)
          const second = Boolean(bases & 2)
          useGameStore.setState({
            count: { balls: 0, strikes, outs },
            runners: { first, second, third: Boolean(bases & 4) },
          })
          render(<CountControl />)
          expect(screen.getByRole('button', { name: 'インフィールドフライ' })).toHaveProperty('disabled', !(outs < 2 && first && second))
          expect(screen.getByRole('button', { name: '三塁封殺' })).toHaveProperty('disabled', !second)
          expect(screen.getByRole('button', { name: '本塁封殺' })).toHaveProperty('disabled', !Boolean(bases & 4))
          expect(screen.getByRole('button', { name: '振逃' })).toHaveProperty('disabled', !(strikes === 2 && (!first || outs === 2)))
        })
      }
    }
  }
})

it('インフィールドフライは走者を保持し、打者アウトと成績を記録する', () => {
  const before = state()
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: 'インフィールドフライ' }))
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 1 })
  expect(state().runners).toEqual(before.runners)
  expect(state().runnerIndices).toEqual(before.runnerIndices)
  expect(state().runnerResponsiblePitcher).toEqual(before.runnerResponsiblePitcher)
  expect(state().awayBatterIndex).toBe(4)
  expect(state().awayLineup[3]?.gameAtBats).toBe(1)
  expect(state().pitcherGameStats['home-21']?.outsRecorded).toBe(1)
  expect(state().pitchCount).toBe(11)
  expect(state().awayTotal).toBe(before.awayTotal)
})

it.each([false, true])('三塁封殺は二塁走者を除去し、一塁走者の有無=%sに応じて進塁する', (first) => {
  useGameStore.setState({
    runners: { first, second: true, third: true },
    runnerIndices: { first: first ? 0 : null, second: 1, third: 2 },
    runnerResponsiblePitcher: { first: first ? 'home-18' : null, second: 'home-19', third: 'home-20' },
  })
  const before = extractGameState(state())
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '三塁封殺' }))
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 1 })
  expect(state().runners).toEqual({ first: true, second: first, third: true })
  expect(state().runnerIndices).toEqual({ first: 3, second: first ? 0 : null, third: 2 })
  expect(state().runnerResponsiblePitcher).toEqual({ first: 'home-21', second: first ? 'home-18' : null, third: 'home-20' })
  expect(state().awayBatterIndex).toBe(4)
  expect(state().lastBatterIndex).toBe(3)
  expect(state().awayLineup[3]?.gameAtBats).toBe(1)
  expect(state().pitcherGameStats['home-21']?.outsRecorded).toBe(1)
  expect(state().pitchCount).toBe(11)
  expect(state().awayTotal).toBe(before.awayTotal)
  expect(state().awayHits).toBe(before.awayHits)
  act(() => state().undo())
  expect(extractGameState(state())).toEqual(before)
})

it('三塁封殺の3アウト目で得点せず攻守交代する', () => {
  useGameStore.setState({ count: { balls: 1, strikes: 2, outs: 2 } })
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '三塁封殺' }))
  expect(state().currentHalf).toBe('bottom')
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 0 })
  expect(state().runnerIndices).toEqual({ first: null, second: null, third: null })
  expect(state().runnerResponsiblePitcher).toEqual({ first: null, second: null, third: null })
  expect(state().awayBatterIndex).toBe(4)
  expect(state().awayTotal).toBe(0)
  expect(state().pitcherGameStats['home-21']?.outsRecorded).toBe(1)
})

it.each(['top', 'bottom'] as const)('本塁封殺は得点せず走者を入れ替え、取り消せる (%s)', (currentHalf) => {
  useGameStore.setState({ currentHalf, homeBatterIndex: 3 })
  const before = extractGameState(state())
  const lineupKey = currentHalf === 'top' ? 'awayLineup' : 'homeLineup'
  const batterKey = currentHalf === 'top' ? 'awayBatterIndex' : 'homeBatterIndex'
  const pitcherKey = currentHalf === 'top' ? 'home-21' : 'away-21'
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '本塁封殺' }))
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 1 })
  expect(state().runners).toEqual({ first: true, second: true, third: true })
  expect(state().runnerIndices).toEqual({ first: 3, second: 0, third: 1 })
  expect(state().runnerResponsiblePitcher).toEqual({ first: pitcherKey, second: 'home-18', third: 'home-19' })
  expect(state()[batterKey]).toBe(4)
  expect(state().lastBatterIndex).toBe(3)
  expect(state()[lineupKey][3]?.gameAtBats).toBe(1)
  expect(state().pitcherGameStats[pitcherKey]?.outsRecorded).toBe(1)
  expect(state().pitchCount).toBe(11)
  expect([state().awayTotal, state().homeTotal, state().awayHits, state().homeHits]).toEqual([0, 0, 0, 0])
  act(() => state().undo())
  expect(extractGameState(state())).toEqual(before)
})

it('本塁封殺の3アウト目で得点せず攻守交代する', () => {
  useGameStore.setState({ count: { balls: 1, strikes: 2, outs: 2 } })
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '本塁封殺' }))
  expect(state().currentHalf).toBe('bottom')
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 0 })
  expect(state().runners).toEqual({ first: false, second: false, third: false })
  expect(state().runnerIndices).toEqual({ first: null, second: null, third: null })
  expect(state().runnerResponsiblePitcher).toEqual({ first: null, second: null, third: null })
  expect(state().awayBatterIndex).toBe(4)
  expect(state().awayTotal).toBe(0)
  expect(state().pitcherGameStats['home-21']?.outsRecorded).toBe(1)
})

it.each([0, 1, 2, 3])('本塁封殺は三塁走者なしでは状態も履歴も変更しない (bases=%s)', (bases) => {
  useGameStore.setState({ runners: { first: Boolean(bases & 1), second: Boolean(bases & 2), third: Boolean(bases & 4) } })
  const before = extractGameState(state())
  const undoCount = state().undoCount
  state().recordHomeForceOut()
  expect(extractGameState(state())).toEqual(before)
  expect(state().undoCount).toBe(undoCount)
})

it.each([0, 1, 2, 3])('本塁封殺は三塁走者がいれば記録できる (otherBases=%s)', (bases) => {
  const first = Boolean(bases & 1)
  const second = Boolean(bases & 2)
  useGameStore.setState({
    runners: { first, second, third: true },
    runnerIndices: { first: first ? 0 : null, second: second ? 1 : null, third: 2 },
    runnerResponsiblePitcher: { first: first ? 'home-18' : null, second: second ? 'home-19' : null, third: 'home-20' },
  })
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '本塁封殺' }))
  expect(state().count.outs).toBe(1)
  expect(state().runners).toEqual({ first: true, second: first, third: second })
  expect(state().runnerIndices).toEqual({ first: 3, second: first ? 0 : null, third: second ? 1 : null })
  expect(state().runnerResponsiblePitcher).toEqual({ first: 'home-21', second: first ? 'home-18' : null, third: second ? 'home-19' : null })
  expect(state().awayTotal).toBe(0)
})

it('2アウト一塁走者ありの振逃はアウトを増やさず打者を出塁させる', () => {
  useGameStore.setState({ count: { balls: 1, strikes: 2, outs: 2 } })
  render(<CountControl />)
  fireEvent.click(screen.getByRole('button', { name: '振逃' }))
  expect(state().count).toEqual({ balls: 0, strikes: 0, outs: 2 })
  expect(state().runnerIndices.first).toBe(3)
  expect(state().awayBatterIndex).toBe(4)
  expect(state().pitchCount).toBe(11)
})

it.each([
  ['recordInfieldFly', 2, 2, true, true],
  ['recordInfieldFly', 0, 2, false, true],
  ['recordInfieldFly', 0, 2, true, false],
  ['recordThirdBaseForceOut', 0, 2, true, false],
  ['recordUncaughtThirdStrike', 0, 2, true, true],
  ['recordUncaughtThirdStrike', 1, 2, true, false],
  ['recordUncaughtThirdStrike', 2, 1, false, false],
] as const)('%sは条件外で直接呼んでも状態を変更しない (%s/%s/%s/%s)', (action, outs, strikes, first, second) => {
  useGameStore.setState({ count: { balls: 1, strikes, outs }, runners: { first, second, third: false } })
  const before = extractGameState(state())
  state()[action]()
  expect(extractGameState(state())).toEqual(before)
})
