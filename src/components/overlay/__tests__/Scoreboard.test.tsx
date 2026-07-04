/**
 * Scoreboard コンポーネントテスト
 *
 * 試合終了時のスコアボード表示に関するテスト:
 * - 9回表で試合終了 → ホームチームの9回に "x" が表示される
 * - 9回裏で試合終了 → "x" は表示されない
 * - 9回完了後(10回表)で試合終了 → 10回カラムは表示されない
 * - 延長12回表(アウトあり)で試合終了 → 12回に "x" が表示される
 * - 延長12回完了後(13回表)で試合終了 → 13回カラムは表示されない
 * - 通常プレー中 → "x" は表示されない
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useGameStore } from '../../../store/useGameStore'
import { initialGameState } from '../../../types'
import Scoreboard from '../Scoreboard'

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
    pitchCount: 0,
  })
})

afterEach(() => {
  cleanup()
})

// 9イニング分のイニングデータ（全て 0-0）
const nineInnings = Array.from({ length: 9 }, (_, i) => ({
  inning: i + 1,
  top: 0,
  bottom: 0,
}))

describe('Scoreboard - 試合終了時のイニング表示 (x マーク)', () => {
  it('9回表で試合終了したとき、ホームチームの9回に "x" が表示される', () => {
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 9,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      innings: nineInnings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('9回裏で試合終了したとき、"x" は表示されない', () => {
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 9,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 0 },
      innings: nineInnings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })

  it('雨天コールド: 5回表で試合終了したとき、ホームチームの5回に "x" が表示される', () => {
    const innings = Array.from({ length: 9 }, (_, i) => ({
      inning: i + 1,
      top: i < 4 ? 0 : null,
      bottom: i < 4 ? 0 : null,
    }))
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 5,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('雨天コールド: 5回裏で試合終了したとき、"x" は表示されない', () => {
    const innings = Array.from({ length: 9 }, (_, i) => ({
      inning: i + 1,
      top: i < 5 ? 0 : null,
      bottom: i < 4 ? 0 : null,
    }))
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 5,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 1 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })
})

describe('Scoreboard - 試合終了時のイニング数制限', () => {
  it('9回完了後(10回表・未プレー)で試合終了したとき、10回カラムは表示されない', () => {
    const innings = [
      ...nineInnings,
      { inning: 10, top: null, bottom: null },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 10,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    // 10回のカラムヘッダーが存在しないこと
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).not.toContain('10')
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })

  it('延長12回完了後(13回表・未プレー)で試合終了したとき、13回カラムは表示されない', () => {
    const innings = [
      ...Array.from({ length: 12 }, (_, i) => ({ inning: i + 1, top: 0, bottom: 0 })),
      { inning: 13, top: null, bottom: null },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 13,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 0 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).not.toContain('13')
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })

  it('延長12回表(アウトあり)で試合終了したとき、12回カラムが表示されホームに "x" が表示される', () => {
    const innings = [
      ...Array.from({ length: 11 }, (_, i) => ({ inning: i + 1, top: 0, bottom: 0 })),
      { inning: 12, top: null, bottom: null },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 12,
      currentHalf: 'top',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('12')
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('通常プレー中(isGameOver=false)は、9回を超えてもカラムが表示され "x" は出ない', () => {
    const innings = [
      ...nineInnings,
      { inning: 10, top: 0, bottom: null },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: false,
      currentInning: 10,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 1 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('10')
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })
})

describe('Scoreboard - サヨナラ時の "Nx" 表記', () => {
  it('9回裏サヨナラで試合終了(1点)したとき、ホームの9回に "1x" が表示される', () => {
    const innings = [
      ...Array.from({ length: 8 }, (_, i) => ({ inning: i + 1, top: 0, bottom: 0 })),
      { inning: 9, top: 0, bottom: 1 },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 9,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 2 },
      innings,
      awayTotal: 0,
      homeTotal: 1,
    })
    render(<Scoreboard />)
    expect(screen.getByText('1x')).toBeInTheDocument()
  })

  it('10回裏サヨナラで試合終了(2点)したとき、ホームの10回に "2x" が表示される', () => {
    const innings = [
      ...nineInnings,
      { inning: 10, top: 0, bottom: 2 },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 10,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 1 },
      innings,
      awayTotal: 0,
      homeTotal: 2,
    })
    render(<Scoreboard />)
    expect(screen.getByText('2x')).toBeInTheDocument()
  })

  it('9回裏で得点なし(0点)で試合終了したとき、"x" サフィックスは付かない', () => {
    const innings = [
      ...Array.from({ length: 8 }, (_, i) => ({ inning: i + 1, top: 0, bottom: 0 })),
      { inning: 9, top: 0, bottom: 0 },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 9,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 3 },
      innings,
      awayTotal: 0,
      homeTotal: 0,
    })
    render(<Scoreboard />)
    expect(screen.queryByText('0x')).not.toBeInTheDocument()
  })

  it('12回裏サヨナラ(1点)で試合終了したとき、ホームの12回に "1x" が表示される', () => {
    const innings = [
      ...Array.from({ length: 11 }, (_, i) => ({ inning: i + 1, top: 0, bottom: 0 })),
      { inning: 12, top: 0, bottom: 1 },
    ]
    useGameStore.setState({
      ...initialGameState,
      isGameOver: true,
      currentInning: 12,
      currentHalf: 'bottom',
      count: { balls: 0, strikes: 0, outs: 1 },
      innings,
      awayTotal: 0,
      homeTotal: 1,
    })
    render(<Scoreboard />)
    expect(screen.getByText('1x')).toBeInTheDocument()
  })
})
