import { useGameStore } from '../../store/useGameStore'
import { formatBatterStat, formatPitcherStat } from '../../types'
import type { PitcherAppearance, PitcherGameStats } from '../../types'

/** 投手の番手ラベルを取得 */
function getAppearanceLabel(appearance?: PitcherAppearance): string | null {
  if (!appearance) return null
  return appearance.order === 0 ? '先発' : `${appearance.order}番手`
}

export default function PlayerInfo() {
  const batter = useGameStore((s) => s.batter)
  const pitcher = useGameStore((s) => s.pitcher)
  const pitchCount = useGameStore((s) => s.pitchCount)
  const currentHalf = useGameStore((s) => s.currentHalf)
  const awayBatterIndex = useGameStore((s) => s.awayBatterIndex)
  const homeBatterIndex = useGameStore((s) => s.homeBatterIndex)
  const awayLineup = useGameStore((s) => s.awayLineup)
  const homeLineup = useGameStore((s) => s.homeLineup)
  const statDisplaySettings = useGameStore((s) => s.statDisplaySettings)
  const pitcherGameStats = useGameStore((s) => s.pitcherGameStats)
  const pitcherHistory = useGameStore((s) => s.pitcherHistory)

  // 現在攻撃中チームのラインナップから打者スタッツを動的計算
  const attackingLineup = currentHalf === 'top' ? awayLineup : homeLineup
  const batterIdx = currentHalf === 'top' ? awayBatterIndex : homeBatterIndex
  const lineupPlayer = attackingLineup[batterIdx]
  const batterStat = (lineupPlayer && lineupPlayer.name === batter.name)
    ? formatBatterStat(lineupPlayer, statDisplaySettings)
    : batter.stat

  // 守備チームのラインナップから投手スタッツを動的計算
  const defendingLineup = currentHalf === 'top' ? homeLineup : awayLineup
  const pitcherLineupPlayer = defendingLineup[9]
  const defTeam = currentHalf === 'top' ? 'home' : 'away'
  const pitcherKey = `${defTeam}-${pitcher.number}`
  const currentGameStats: PitcherGameStats | undefined = pitcherGameStats[pitcherKey]
  const pitcherStat = (pitcherLineupPlayer && pitcherLineupPlayer.name === pitcher.name)
    ? formatPitcherStat(pitcherLineupPlayer, statDisplaySettings, currentGameStats)
    : [statDisplaySettings.showAppearances ? pitcher.statLabel : '', statDisplaySettings.showRecord ? pitcher.stat : ''].filter(Boolean).join(' ')

  // 投手の番手ラベル
  const currentAppearance = pitcherHistory.find(
    (h) => h.team === defTeam && h.number === pitcher.number && h.isActive
  )
  const appearanceLabel = getAppearanceLabel(currentAppearance)

  const hasBatter = batter.name.length > 0
  const hasPitcher = pitcher.name.length > 0

  if (!hasBatter && !hasPitcher) return null

  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm flex gap-6">
      {hasBatter && (
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold text-xs">打者</span>
          <span className="font-bold">{batter.name}</span>
          {batterStat && (
            <span className="text-yellow-400 text-xs">
              {batter.statLabel ? `${batter.statLabel} ` : ''}{batterStat}
            </span>
          )}
        </div>
      )}
      {hasPitcher && (
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-bold text-xs">投手</span>
          {appearanceLabel && (
            <span className="text-yellow-300 font-bold text-xs">{appearanceLabel}</span>
          )}
          <span className="font-bold">{pitcher.name}</span>
          {pitcherStat && (
            <span className="text-yellow-400 text-xs">
              {pitcherStat}
            </span>
          )}
          <span className="text-gray-300 text-xs ml-1">
            {pitchCount}球
          </span>
        </div>
      )}
    </div>
  )
}
