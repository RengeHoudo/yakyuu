import { useEffect, useMemo, useState } from 'react'
import {
  fetchNpbScholarBatterStats,
  getBaseState,
  getLiveBatterAverage,
  mergeBatterSituationalStats,
} from '../../lib/npbScholar'
import type { BatterAverageDetail, BatterSituationalStats } from '../../lib/npbScholar'
import { useGameStore } from '../../store/useGameStore'
import { computeLiveBattingStats, type LineupPlayer } from '../../types'
import PitcherStatsOverlay from './PitcherStatsOverlay'

const PANEL_WIDTH = 250 / 2.2
const PANEL_HEIGHT = 410 / 2.2

function formatDetail(detail: BatterAverageDetail | undefined): string {
  if (!detail) return '-- (-- - --)'
  return `${detail.average} (${detail.atBats} - ${detail.hits})`
}

function formatOnBasePct(player: LineupPlayer | undefined): string {
  if (!player) return '-- (四:-- - 死:--)'
  const walks = (Number(player.walks) || 0) + (player.gameWalks ?? 0)
  const hitByPitch = (Number(player.hitByPitch) || 0) + (player.gameHitByPitch ?? 0)
  return `${computeLiveBattingStats(player).onBasePct} (四:${walks} - 死:${hitByPitch})`
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
  const pitcher = useGameStore((state) => state.pitcher)
  const awayTeamName = useGameStore((state) => state.awayTeam.name)
  const homeTeamName = useGameStore((state) => state.homeTeam.name)
  const runners = useGameStore((state) => state.runners)
  const batterSituationalGameStats = useGameStore((state) => state.batterSituationalGameStats ?? {})
  const batterPitcherHandGameStats = useGameStore((state) => state.batterPitcherHandGameStats ?? {})

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
  const gamePitcherHandStats = playerKey ? batterPitcherHandGameStats[playerKey] : undefined
  const requestKey = `${playerName}|${teamName}`
  // 成績やカウントの更新ではリセットせず、打順・選手・攻撃チームの変更を検出する。
  const batterIdentity = JSON.stringify([teamKey, batterIndex, playerName, batter.number || indexedPlayer?.number])
  const hasPitcher = Boolean(pitcher.name)
  const [rotation, setRotation] = useState({ key: batterIdentity, pitcher: false })

  useEffect(() => {
    setRotation({ key: batterIdentity, pitcher: false })
    if (!hasPitcher) return
    const timer = window.setInterval(() => {
      setRotation((previous) => ({ key: batterIdentity, pitcher: !previous.pitcher }))
    }, 15000)
    return () => window.clearInterval(timer)
  }, [batterIdentity, hasPitcher])

  const showPitcher = hasPitcher && rotation.key === batterIdentity && rotation.pitcher

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
    () => seasonStats
      ? mergeBatterSituationalStats(
          seasonStats,
          gameSituationalStats,
          gamePitcherHandStats,
        )
      : null,
    [gamePitcherHandStats, gameSituationalStats, seasonStats],
  )
  const status = loaded.key === requestKey ? loaded.status : 'loading'
  const baseState = getBaseState(runners)
  const isScoringPosition = runners.second || runners.third
  const situationDetail = stats
    ? (isScoringPosition ? stats.risp : stats.nonRisp)
    : undefined
  const baseStateDetail = stats?.byBaseState[baseState.split]
  const defendingLineup = currentHalf === 'top' ? homeLineup : awayLineup
  const lineupPitcher = defendingLineup.find((candidate) =>
    candidate.number === pitcher.number && candidate.name === pitcher.name
  )
  const pitcherHand = pitcher.throwHand ?? lineupPitcher?.throwHand
  const pitcherHandDetail = pitcherHand ? stats?.byPitcherHand[pitcherHand] : undefined
  const batterHand = lineupPlayer?.batHand === 'S'
    ? (pitcherHand === 'R' ? 'L' : pitcherHand === 'L' ? 'R' : undefined)
    : lineupPlayer?.batHand
  const liveDetail = useMemo(
    () => lineupPlayer ? getLiveBatterAverage(lineupPlayer) : undefined,
    [lineupPlayer],
  )

  if (!playerName) return null

  const batterPanel = (
    <div
      data-testid="batter-stats-panel"
      className="bg-black/80 backdrop-blur-sm rounded-lg px-[6px] py-[6px] text-white overflow-hidden select-none"
      style={{ width: `${PANEL_WIDTH}px`, height: `${PANEL_HEIGHT}px` }}
    >
      <div className="h-full flex flex-col">
        <div className="min-h-0">
          <div className="text-[7px] leading-none font-bold text-accent mb-0.5">打者</div>
          <div
            data-testid="batter-name"
            className="text-[12px] leading-none font-bold truncate"
            title={playerName}
          >
            {playerName}
          </div>
        </div>

        <div data-testid="live-average-block" className="mt-1 py-px">
          <div className="text-[7px] leading-none text-gray-300 mb-0.5">打率</div>
          <div
            data-testid="live-batter-average"
            className="text-[13px] leading-none font-bold text-yellow-300 tabular-nums"
          >
            {formatDetail(liveDetail)}
          </div>
        </div>

        <div
          data-testid="situational-stats-list"
          className="border-t border-white/30 mt-1.5 pt-1.5 flex-1 min-h-0 space-y-[3px]"
        >
          {status === 'loading' ? (
            <div className="text-[9px] leading-tight text-gray-400">取得中</div>
          ) : status === 'error' || !stats ? (
            <div className="text-[9px] leading-tight text-gray-400">データなし</div>
          ) : (
            <>
              <div data-testid="situational-stat-item" className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">
                  {pitcherHand === 'R' ? '対右投手' : pitcherHand === 'L' ? '対左投手' : '投手左右不明'}
                </div>
                <div
                  data-testid="pitcher-hand-average"
                  className="text-[11px] leading-none font-bold text-green-200 tabular-nums"
                >
                  {formatDetail(pitcherHandDetail)}
                </div>
              </div>
              <div data-testid="situational-stat-item" className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">
                  {isScoringPosition ? '得点圏打率' : '非得点圏打率'}
                </div>
                <div className="text-[11px] leading-none font-bold tabular-nums">
                  {formatDetail(situationDetail)}
                </div>
              </div>
              <div data-testid="situational-stat-item" className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">
                  {baseState.label}
                </div>
                <div
                  data-testid="base-state-average"
                  className="text-[11px] leading-none font-bold text-cyan-200 tabular-nums"
                >
                  {formatDetail(baseStateDetail)}
                </div>
              </div>
            </>
          )}
          <div data-testid="situational-stat-item" className="py-[2.25px]">
            <div className="text-[9px] leading-none text-gray-300 mb-px">
              出塁率
            </div>
            <div
              data-testid="live-on-base-pct"
              className="text-[11px] leading-none font-bold text-orange-200 tabular-nums"
            >
              {formatOnBasePct(lineupPlayer)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <PitcherStatsOverlay
        visible={showPitcher}
        pitcherName={pitcher.name}
        teamName={currentHalf === 'top' ? homeTeamName : awayTeamName}
        batterHand={batterHand}
      />
      {!showPitcher && batterPanel}
    </>
  )
}
