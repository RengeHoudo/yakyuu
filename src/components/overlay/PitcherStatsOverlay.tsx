import { useEffect, useState } from 'react'
import { fetchNpbScholarPitcherStats, type BatterAverageDetail, type PitcherSeasonStats } from '../../lib/npbScholar'

interface Props {
  visible: boolean
  pitcherName: string
  teamName: string
  batterHand?: 'L' | 'R'
}

interface LoadedStats {
  key: string
  status: 'loading' | 'ready' | 'error'
  data: PitcherSeasonStats | null
}

function formatDetail(detail: BatterAverageDetail | undefined): string {
  return detail ? `${detail.average} (${detail.atBats} - ${detail.hits})` : '-- (-- - --)'
}

/** 非表示中も取得結果を保持し、15秒の切り替えで再取得・ちらつきを起こさない。 */
export default function PitcherStatsOverlay({ visible, pitcherName, teamName, batterHand }: Props) {
  const requestKey = JSON.stringify([pitcherName, teamName])
  const [loaded, setLoaded] = useState<LoadedStats>({ key: '', status: 'loading', data: null })

  useEffect(() => {
    if (!pitcherName) return
    let active = true
    setLoaded({ key: requestKey, status: 'loading', data: null })
    fetchNpbScholarPitcherStats(pitcherName, teamName)
      .then((data) => {
        if (active) setLoaded({ key: requestKey, status: 'ready', data })
      })
      .catch(() => {
        if (active) setLoaded({ key: requestKey, status: 'error', data: null })
      })
    return () => { active = false }
  }, [pitcherName, requestKey, teamName])

  if (!visible || !pitcherName) return null

  const stats = loaded.key === requestKey ? loaded.data : null
  const status = loaded.key === requestKey ? loaded.status : 'loading'
  const handDetail = batterHand ? stats?.byBatterHand[batterHand] : undefined

  return (
    <div
      data-testid="pitcher-stats-panel"
      className="bg-black/80 backdrop-blur-sm rounded-lg px-[6px] py-[6px] text-white overflow-hidden select-none"
      style={{ width: `${250 / 2.2}px`, height: `${410 / 2.2}px` }}
    >
      <div className="h-full flex flex-col">
        <div className="min-h-0">
          <div className="text-[7px] leading-none font-bold text-accent mb-0.5">投手</div>
          <div data-testid="pitcher-name" className="text-[12px] leading-none font-bold truncate" title={pitcherName}>
            {pitcherName}
          </div>
        </div>

        <div className="mt-1 py-px">
          <div className="text-[7px] leading-none text-gray-300 mb-0.5">防御率</div>
          <div data-testid="pitcher-era" className="text-[13px] leading-none font-bold text-yellow-300 tabular-nums">
            {stats?.era ?? '--'}
          </div>
        </div>

        <div data-testid="pitcher-stats-list" className="border-t border-white/30 mt-1.5 pt-1.5 flex-1 min-h-0 space-y-[3px]">
          {status === 'loading' ? (
            <div className="text-[9px] leading-tight text-gray-400">取得中</div>
          ) : !stats ? (
            <div className="text-[9px] leading-tight text-gray-400">データなし</div>
          ) : (
            <>
              <div className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">WHIP</div>
                <div data-testid="pitcher-whip" className="text-[11px] leading-none font-bold tabular-nums">
                  {stats.whip ?? '--'}
                </div>
              </div>
              <div className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">被打率</div>
                <div data-testid="pitcher-average" className="text-[11px] leading-none font-bold text-cyan-200 tabular-nums">
                  {formatDetail(stats.average)}
                </div>
              </div>
              <div className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">
                  {batterHand === 'R' ? '対右打者 被打率' : batterHand === 'L' ? '対左打者 被打率' : '打者左右不明'}
                </div>
                <div data-testid="batter-hand-average" className="text-[11px] leading-none font-bold text-green-200 tabular-nums">
                  {formatDetail(handDetail)}
                </div>
              </div>
              <div className="py-[2.25px]">
                <div className="text-[9px] leading-none text-gray-300 mb-px">被出塁率</div>
                <div data-testid="pitcher-on-base-pct" className="text-[11px] leading-none font-bold text-orange-200 tabular-nums">
                  {`${stats.onBasePct ?? '--'} (四:${stats.walks ?? '--'} - 死:${stats.hitByPitch ?? '--'})`}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
