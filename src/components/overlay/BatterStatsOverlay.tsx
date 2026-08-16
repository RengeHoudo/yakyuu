import { useEffect, useMemo, useState } from 'react'
import {
  fetchNpbScholarBatterStats,
  getBaseState,
  getLiveBatterAverage,
  mergeBatterSituationalStats,
} from '../../lib/npbScholar'
import type { BatterAverageDetail, BatterSituationalStats } from '../../lib/npbScholar'
import { useGameStore } from '../../store/useGameStore'

const PANEL_WIDTH = 315 / 2.2
const PANEL_HEIGHT = 340 / 2.2

function formatDetail(detail: BatterAverageDetail | undefined): string {
  if (!detail) return '-- (-- - --)'
  return `${detail.average} (${detail.atBats} - ${detail.hits})`
}

interface LoadedStats {
  key: string
  status: 'loading' | 'ready' | 'error'
  data: BatterSituationalStats | null
}

export default function BatterStatsOverlay() {
  const batter = useGameStore((state) => state.batter)
  const currentHalf = useGameStore((state) => state.currentHalf)
  const awayBatterIndex = useGameStore((state) => state.awayBatterIndex)
  const homeBatterIndex = useGameStore((state) => state.homeBatterIndex)
  const awayLineup = useGameStore((state) => state.awayLineup)
  const homeLineup = useGameStore((state) => state.homeLineup)
  const awayTeamName = useGameStore((state) => state.awayTeam.name)
  const homeTeamName = useGameStore((state) => state.homeTeam.name)
  const runners = useGameStore((state) => state.runners)
  const batterSituationalGameStats = useGameStore((state) => state.batterSituationalGameStats ?? {})

  const attackingLineup = currentHalf === 'top' ? awayLineup : homeLineup
  const batterIndex = currentHalf === 'top' ? awayBatterIndex : homeBatterIndex
  const indexedPlayer = attackingLineup[batterIndex]
  const lineupPlayer = indexedPlayer?.name === batter.name
    ? indexedPlayer
    : attackingLineup.find((player) => player.name === batter.name)
  const playerName = batter.name || indexedPlayer?.name || ''
  const teamName = currentHalf === 'top' ? awayTeamName : homeTeamName
  const teamKey = currentHalf === 'top' ? 'away' : 'home'
  const playerKey = lineupPlayer?.number ? `${teamKey}-${lineupPlayer.number}` : null
  const gameSituationalStats = playerKey ? batterSituationalGameStats[playerKey] : undefined
  const requestKey = `${playerName}|${teamName}`

  const [loaded, setLoaded] = useState<LoadedStats>({ key: '', status: 'loading', data: null })

  useEffect(() => {
    if (!playerName) return
    let active = true
    setLoaded({ key: requestKey, status: 'loading', data: null })
    fetchNpbScholarBatterStats(playerName, teamName)
      .then((data) => {
        if (active) setLoaded({ key: requestKey, status: 'ready', data })
      })
      .catch(() => {
        if (active) setLoaded({ key: requestKey, status: 'error', data: null })
      })
    return () => { active = false }
  }, [playerName, requestKey, teamName])

  const seasonStats = loaded.key === requestKey ? loaded.data : null
  const stats = useMemo(
    () => seasonStats ? mergeBatterSituationalStats(seasonStats, gameSituationalStats) : null,
    [gameSituationalStats, seasonStats],
  )
  const status = loaded.key === requestKey ? loaded.status : 'loading'
  const baseState = getBaseState(runners)
  const isScoringPosition = runners.second || runners.third
  const situationDetail = stats
    ? (isScoringPosition ? stats.risp : stats.nonRisp)
    : undefined
  const baseStateDetail = stats?.byBaseState[baseState.split]
  const liveDetail = useMemo(
    () => lineupPlayer ? getLiveBatterAverage(lineupPlayer) : undefined,
    [lineupPlayer],
  )

  if (!playerName) return null

  return (
    <div
      data-testid="batter-stats-panel"
      className="bg-black/80 backdrop-blur-sm rounded-lg px-2 py-2 text-white overflow-hidden select-none"
      style={{ width: `${PANEL_WIDTH}px`, height: `${PANEL_HEIGHT}px` }}
    >
      <div className="h-full flex flex-col">
        <div className="min-h-0">
          <div className="text-[8px] leading-none font-bold text-accent mb-1">打者</div>
          <div className="text-[13px] leading-tight font-bold truncate" title={playerName}>{playerName}</div>
        </div>

        <div className="mt-2">
          <div className="text-[8px] leading-none text-gray-300 mb-1">打率</div>
          <div className="text-[11px] leading-tight font-bold text-yellow-300 tabular-nums">
            {formatDetail(liveDetail)}
          </div>
        </div>

        <div className="border-t border-white/30 mt-2 pt-2 flex-1 min-h-0">
          <div className="text-[8px] leading-none text-gray-300 mb-1">
            {isScoringPosition ? '得点圏打率' : '非得点圏打率'}
          </div>
          {status === 'loading' ? (
            <div className="text-[9px] leading-tight text-gray-400">取得中</div>
          ) : status === 'error' || !stats ? (
            <div className="text-[9px] leading-tight text-gray-400">データなし</div>
          ) : (
            <>
              <div className="text-[11px] leading-tight font-bold tabular-nums">
                {formatDetail(situationDetail)}
              </div>
              <div className="mt-2">
                <div className="text-[8px] leading-none text-gray-300 mb-1">
                  {baseState.label}
                </div>
                <div
                  data-testid="base-state-average"
                  className="text-[11px] leading-tight font-bold text-cyan-200 tabular-nums"
                >
                  {formatDetail(baseStateDetail)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
