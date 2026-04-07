/**
 * LineupCard コンポーネントテスト
 *
 * 投手欄に相手チーム名をカラー付きヘッダーで表示する機能のテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useGameStore } from '../../../store/useGameStore'
import { initialGameState } from '../../../types'
import type { Team, LineupPlayer, PlayerInfo, Position } from '../../../types'
import LineupCard from '../LineupCard'

vi.mock('../../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../../lib/idbBackup', () => ({
  backupToIDB: vi.fn(),
  restoreFromIDB: vi.fn().mockResolvedValue(null),
}))

const awayTeam: Team = { name: '広島東洋カープ', shortName: 'カープ', color: '#e4002b' }
const homeTeam: Team = { name: '福岡ソフトバンクホークス', shortName: 'ホークス', color: '#f5a800' }

const makeLineup = (): LineupPlayer[] => {
  const lineup: LineupPlayer[] = Array.from({ length: 10 }, (_, i) => ({
    order: i + 1,
    name: `選手${i + 1}`,
    number: `${i + 1}`,
    position: (['投', '捕', '一', '二', '三', '遊', '左', '中', '右', '投'] as const)[i] as Position,
    stat: '',
    statLabel: '',
  }))
  return lineup
}

const pitcher: PlayerInfo = {
  name: '投手太郎',
  number: '18',
  stat: '3勝1敗',
  statLabel: '防4.50',
}

beforeEach(() => {
  localStorage.clear()
  useGameStore.setState({
    ...initialGameState,
    autoChangeEffect: false,
    pitchCount: 0,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LineupCard 投手欄の相手チーム名表示', () => {
  it('攻撃側=away の場合、投手欄にホームチームの shortName が表示される', () => {
    useGameStore.setState({
      awayTeam,
      homeTeam,
      awayLineup: makeLineup(),
      homeLineup: makeLineup(),
      currentHalf: 'top' as const,
      lineupDisplayTeam: 'away',
      pitcher,
      pitchCount: 42,
    })

    render(<LineupCard />)

    // 相手チーム（ホーム）の shortName が表示される
    expect(screen.getByText('ホークス')).toBeInTheDocument()
    // 「投手」ラベルも表示される
    expect(screen.getByText('投手')).toBeInTheDocument()
    // 投手名が表示される
    expect(screen.getByText('投手太郎')).toBeInTheDocument()
    // 投球数が表示される
    expect(screen.getByText('42球')).toBeInTheDocument()
  })

  it('攻撃側=home の場合、投手欄にアウェーチームの shortName が表示される', () => {
    useGameStore.setState({
      awayTeam,
      homeTeam,
      awayLineup: makeLineup(),
      homeLineup: makeLineup(),
      currentHalf: 'bottom' as const,
      lineupDisplayTeam: 'home',
      pitcher,
      pitchCount: 30,
    })

    render(<LineupCard />)

    // 相手チーム（アウェー）の shortName が表示される
    expect(screen.getByText('カープ')).toBeInTheDocument()
    expect(screen.getByText('投手')).toBeInTheDocument()
    expect(screen.getByText('投手太郎')).toBeInTheDocument()
  })

  it('相手チームのカラーが投手ヘッダーの背景色に使用される', () => {
    useGameStore.setState({
      awayTeam,
      homeTeam,
      awayLineup: makeLineup(),
      homeLineup: makeLineup(),
      currentHalf: 'top' as const,
      lineupDisplayTeam: 'away',
      pitcher,
      pitchCount: 10,
    })

    render(<LineupCard />)

    // ホームチームの色が使われたカラードットが存在する
    const teamNameEl = screen.getByText('ホークス')
    const headerDiv = teamNameEl.closest('div')
    expect(headerDiv).not.toBeNull()
    // ヘッダーの背景色に相手チームカラーが反映される
    expect(headerDiv!.style.backgroundColor).toBeTruthy()
  })

  it('投手名が空の場合、投手欄は表示されない', () => {
    useGameStore.setState({
      awayTeam,
      homeTeam,
      awayLineup: makeLineup(),
      homeLineup: makeLineup(),
      currentHalf: 'top' as const,
      lineupDisplayTeam: 'away',
      pitcher: { name: '', number: '', stat: '', statLabel: '' },
      pitchCount: 0,
    })

    render(<LineupCard />)

    // 投手欄が表示されない
    expect(screen.queryByText('投手')).not.toBeInTheDocument()
    expect(screen.queryByText('ホークス')).not.toBeInTheDocument()
  })
})
