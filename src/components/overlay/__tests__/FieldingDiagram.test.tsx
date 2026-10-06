import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { useGameStore } from '../../../store/useGameStore'
import { initialGameState } from '../../../types'
import { rosterPitcherToLineupFields } from '../../control/LineupControl'
import FieldingDiagram from '../FieldingDiagram'

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

beforeEach(() => {
  localStorage.clear()
  useGameStore.setState({ ...initialGameState, autoChangeEffect: false })
})
afterEach(cleanup)

describe('守備位置図の投手変更', () => {
  it.each(['home', 'away'] as const)('%sの投手を名簿から手動変更すると外国人投手の名前に更新する', (team) => {
    const key = team === 'home' ? 'homeLineup' : 'awayLineup'
    const lineup = [...initialGameState[key]]
    lineup[9] = { ...lineup[9]!, name: '大瀬良 大地', number: '14', npbDisplayName: '大瀬良' }
    useGameStore.setState({ [key]: lineup, currentHalf: team === 'home' ? 'top' : 'bottom' })
    render(<FieldingDiagram />)
    expect(screen.getByText('大瀬良')).toBeInTheDocument()

    act(() => useGameStore.getState().setLineupPlayer(team, 9, {
      ...lineup[9]!,
      ...rosterPitcherToLineupFields({ name: 'ハーン', number: '68', positionCategory: '投手' }),
    }))

    expect(screen.getByText('ハーン')).toBeInTheDocument()
    expect(screen.queryByText('大瀬良')).not.toBeInTheDocument()
    expect(useGameStore.getState()[key][9]!.npbDisplayName).toBeUndefined()
  })

  it('名前の直接入力でも前の投手のNPB表示名を残さない', () => {
    const lineup = [...initialGameState.homeLineup]
    lineup[9] = { ...lineup[9]!, name: 'ハーン', number: '68', npbDisplayName: 'ハーン' }
    useGameStore.setState({ homeLineup: lineup })
    render(<FieldingDiagram />)
    act(() => useGameStore.getState().setLineupPlayer('home', 9, { ...lineup[9]!, name: 'モンテロ' }))
    expect(screen.getByText('モンテロ')).toBeInTheDocument()
    expect(screen.queryByText('ハーン')).not.toBeInTheDocument()
  })

  it('同じ選手の編集ではNPB表示名を保持する', () => {
    const player = { ...initialGameState.homeLineup[9]!, name: 'ハーン', number: '68', npbDisplayName: 'ハーン' }
    useGameStore.getState().setLineupPlayer('home', 9, player)
    useGameStore.getState().setLineupPlayer('home', 9, { ...player, era: '1.00' })
    expect(useGameStore.getState().homeLineup[9]!.npbDisplayName).toBe('ハーン')
  })

  it('交代選手の新しいNPB表示名が渡された場合は保持する', () => {
    const player = { ...initialGameState.homeLineup[9]!, name: '大瀬良 大地', number: '14', npbDisplayName: '大瀬良' }
    useGameStore.getState().setLineupPlayer('home', 9, player)
    useGameStore.getState().setLineupPlayer('home', 9, { ...player, name: 'ハーン', number: '68', npbDisplayName: 'ハーン' })
    expect(useGameStore.getState().homeLineup[9]!.npbDisplayName).toBe('ハーン')
  })
})
