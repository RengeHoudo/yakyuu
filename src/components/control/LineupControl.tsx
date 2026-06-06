import { useRef, useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { useRosterStore } from '../../store/useRosterStore'
import type { LineupPlayer, PitcherAppearance, PitcherGameStats, Position, PositionCategory, RosterPlayer, RunnerIndices } from '../../types'
import { defaultPitcherGameStats, formatPitcherGameSummary, formatOutsAsInnings, computeLiveEra, computeLiveWhip } from '../../types'
import { parseLineupCsv, parseRosterCsv } from '../../lib/csvImport'
import { fetchScorePageLineup, matchAbbreviatedName } from '../../lib/npbRoster'

// ─────────────────────────────────────────────
// 試合内成績編集モーダル
// ─────────────────────────────────────────────

/** 打者用試合内成績編集モーダル */
function BatterGameStatsModal({
  player,
  team,
  index,
  onClose,
}: {
  player: LineupPlayer
  team: 'away' | 'home'
  index: number
  onClose: () => void
}) {
  const setLineupPlayerGameStats = useGameStore((s) => s.setLineupPlayerGameStats)

  const [atBats, setAtBats] = useState(String(player.gameAtBats ?? 0))
  const [walks, setWalks] = useState(String(player.gameWalks ?? 0))
  const [hbp, setHbp] = useState(String(player.gameHitByPitch ?? 0))
  const [sacFlies, setSacFlies] = useState(String(player.gameSacFlies ?? 0))
  const [sacBunts, setSacBunts] = useState(String(player.gameSacBunts ?? 0))
  const [singles, setSingles] = useState(String(player.gameSingles ?? 0))
  const [doubles, setDoubles] = useState(String(player.gameDoubles ?? 0))
  const [triples, setTriples] = useState(String(player.gameTriples ?? 0))
  const [homeRuns, setHomeRuns] = useState(String(player.gameHomeRuns ?? 0))

  const toNum = (v: string) => Math.max(0, parseInt(v, 10) || 0)

  const handleSave = () => {
    setLineupPlayerGameStats(team, index, {
      gameAtBats: toNum(atBats),
      gameWalks: toNum(walks),
      gameHitByPitch: toNum(hbp),
      gameSacFlies: toNum(sacFlies),
      gameSacBunts: toNum(sacBunts),
      gameSingles: toNum(singles),
      gameDoubles: toNum(doubles),
      gameTriples: toNum(triples),
      gameHomeRuns: toNum(homeRuns),
    })
    onClose()
  }

  const numInput = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-300 text-xs w-20 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-20 text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-600 rounded-lg p-4 w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-sm">
            {player.name || `${index + 1}番`} — 試合内打撃成績
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>
        <p className="text-gray-500 text-xs">打率・HR・打点・OPSは変更できません（通算成績）</p>
        <div className="space-y-2">
          {numInput('打数', atBats, setAtBats)}
          {numInput('四球', walks, setWalks)}
          {numInput('死球', hbp, setHbp)}
          {numInput('犠飛', sacFlies, setSacFlies)}
          {numInput('犠打', sacBunts, setSacBunts)}
          {numInput('単打', singles, setSingles)}
          {numInput('二塁打', doubles, setDoubles)}
          {numInput('三塁打', triples, setTriples)}
          {numInput('本塁打', homeRuns, setHomeRuns)}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 bg-accent hover:bg-accent/80 text-white rounded py-1.5 text-sm font-bold"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded py-1.5 text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

/** 投手用試合内成績編集モーダル */
function PitcherGameStatsModal({
  player,
  pitcherKey,
  currentStats,
  onClose,
}: {
  player: LineupPlayer
  pitcherKey: string
  currentStats: PitcherGameStats
  onClose: () => void
}) {
  const setPitcherGameStats = useGameStore((s) => s.setPitcherGameStats)

  const [pitchCount, setPitchCount] = useState(String(currentStats.pitchCount ?? 0))
  const [outsRecorded, setOutsRecorded] = useState(String(currentStats.outsRecorded))
  const [hitsAllowed, setHitsAllowed] = useState(String(currentStats.hitsAllowed))
  const [walksAllowed, setWalksAllowed] = useState(String(currentStats.walksAllowed))
  const [earnedRuns, setEarnedRuns] = useState(String(currentStats.earnedRunsAllowed))

  const toNum = (v: string) => Math.max(0, parseInt(v, 10) || 0)

  const handleSave = () => {
    // 投球回はアウト数から算出: outsRecorded / 3
    setPitcherGameStats(pitcherKey, {
      ...currentStats,
      pitchCount: toNum(pitchCount),
      outsRecorded: toNum(outsRecorded),
      hitsAllowed: toNum(hitsAllowed),
      walksAllowed: toNum(walksAllowed),
      earnedRunsAllowed: toNum(earnedRuns),
    })
    onClose()
  }

  const numInput = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-300 text-xs w-24 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-20 text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-600 rounded-lg p-4 w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-sm">
            {player.name || '投手'} — 試合内投手成績
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="space-y-2">
          {numInput('投球数', pitchCount, setPitchCount)}
          {numInput('アウト数（投球回）', outsRecorded, setOutsRecorded)}
          {numInput('被安打', hitsAllowed, setHitsAllowed)}
          {numInput('与四球', walksAllowed, setWalksAllowed)}
          {numInput('自責点', earnedRuns, setEarnedRuns)}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 bg-accent hover:bg-accent/80 text-white rounded py-1.5 text-sm font-bold"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded py-1.5 text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

const POSITIONS: Position[] = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DH', '代']

const CATEGORY_SHORT: Record<PositionCategory, string> = {
  投手: '投', 捕手: '捕', 内野手: '内', 外野手: '外',
}

/** ドロップダウン選択肢のラベルをフォーマットする: `{投|捕|内|外}: {名前}  [ {背番号} ]` */
export function formatRosterOptionLabel(category: PositionCategory, name: string, number: string): string {
  return `${CATEGORY_SHORT[category]}: ${name}  [ ${number} ]`
}

/** 背番号をソート用数値に変換: "00" → -1, "0" → 0, その他 → parseInt */
function numberSortKey(num: string): number {
  if (num === '00') return -1
  return parseInt(num, 10) || 0
}

export function sortedRoster(roster: RosterPlayer[]): RosterPlayer[] {
  return [...roster].sort(
    (a, b) => numberSortKey(a.number) - numberSortKey(b.number),
  )
}

function BatterRow({
  player,
  isCurrent,
  roster,
  onSelect,
  onChange,
  isAttacking,
  runnerBase,
  onSetBase,
  onScoreWithRBI,
  onScoreNoRBI,
  onScoreUnearned,
  showStats,
  onOpenGameStats,
}: {
  player: LineupPlayer
  isCurrent: boolean
  roster: RosterPlayer[]
  onSelect: () => void
  onChange: (p: LineupPlayer) => void
  isAttacking: boolean
  runnerBase: keyof RunnerIndices | null
  onSetBase: (base: keyof RunnerIndices) => void
  onScoreWithRBI: () => void
  onScoreNoRBI: () => void
  onScoreUnearned: () => void
  showStats: boolean
  onOpenGameStats: () => void
}) {
  const sorted = sortedRoster(roster)
  return (
    <div
      className={`text-sm rounded px-1.5 py-1 space-y-0.5 ${
        isCurrent ? 'bg-accent/30 ring-1 ring-accent' : ''
      }`}
    >
      {/* 1行目: 番号・守備位置・選手名・操作ボタン */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 w-4 text-center text-xs shrink-0">
          {player.order}
        </span>
        <select
          className="bg-gray-700 text-white rounded px-1 py-1 text-xs w-10 shrink-0"
          value={player.position}
          onChange={(e) => onChange({ ...player, position: e.target.value as Position })}
        >
          <option value="">--</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {sorted.length > 0 ? (
          <select
            className="bg-gray-700 text-white rounded px-1 py-1 text-xs flex-1 min-w-0"
            value=""
            onChange={(e) => {
              const r = sorted.find((r) => `${r.number}__${r.name}` === e.target.value)
              if (r) onChange({
                ...player,
                name: r.name,
                number: r.number,
                // ロスターに stats がある場合はそれを使用、なければ既存値を保持
                battingAvg: r.battingAvg ?? player.battingAvg ?? '',
                homeRuns: r.homeRuns ?? player.homeRuns ?? '',
                rbi: r.rbi ?? player.rbi ?? '',
                ops: r.ops ?? player.ops ?? '',
                games: r.games,
                plateAppearances: r.plateAppearances,
                atBats: r.atBats,
                runs: r.runs,
                hits: r.hits,
                doubles: r.doubles,
                triples: r.triples,
                totalBases: r.totalBases,
                stolenBases: r.stolenBases,
                caughtStealing: r.caughtStealing,
                sacrificeHits: r.sacrificeHits,
                sacrificeFlies: r.sacrificeFlies,
                walks: r.walks,
                intentionalWalks: r.intentionalWalks,
                hitByPitch: r.hitByPitch,
                strikeouts: r.strikeouts,
                groundedIntoDoublePlays: r.groundedIntoDoublePlays,
                sluggingPct: r.sluggingPct,
                onBasePct: r.onBasePct,
                batHand: r.batHand,
                switchHitter: r.batHand === 'S',
              })
            }}
          >
            <option value="">{player.name || '-- 選手を選択 --'}</option>
            {sorted.map((r) => (
              <option key={`${r.number}__${r.name}`} value={`${r.number}__${r.name}`}>
                {formatRosterOptionLabel(r.positionCategory, r.name, r.number)}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="bg-gray-700 text-white rounded px-2 py-1 text-xs flex-1 min-w-0"
            placeholder="名前"
            value={player.name}
            onChange={(e) => onChange({ ...player, name: e.target.value })}
          />
        )}
        <button
          onClick={onSelect}
          className={`text-xs px-2 py-1 rounded shrink-0 ${
            isCurrent
              ? 'bg-accent text-white font-bold'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
          title="この打者を選択"
        >
          打席
        </button>
        {isAttacking && (
          <div className="flex gap-0.5 shrink-0">
            {(['first', 'second', 'third'] as const).map((base, i) => (
              <button
                key={base}
                onClick={() => onSetBase(base)}
                className={`text-xs w-6 py-1 rounded font-bold ${
                  runnerBase === base
                    ? 'bg-yellow-400 text-black'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                }`}
                title={`${i + 1}塁に出塁`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={onScoreWithRBI}
              disabled={!runnerBase}
              className={`text-xs w-8 py-1 rounded font-bold ${
                runnerBase
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="生還・打点あり（追加進塁）"
            >
              H🏏
            </button>
            <button
              onClick={onScoreNoRBI}
              disabled={!runnerBase}
              className={`text-xs w-8 py-1 rounded font-bold ${
                runnerBase
                  ? 'bg-gray-600 hover:bg-gray-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="生還・打点なし（盗塁・WP/PB等）"
            >
              H🏃
            </button>
            <button
              onClick={onScoreUnearned}
              disabled={!runnerBase}
              className={`text-xs w-8 py-1 rounded font-bold ${
                runnerBase
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="非自責点生還（エラー等）"
            >
              H❌
            </button>
          </div>
        )}
      </div>
      {/* 2行目: スタッツ（左右・打率・HR・打点・OPS） ─ 読み取り専用 + 試合成績編集ボタン */}
      {showStats && (
        <div className="flex items-center gap-1 pl-5">
          <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs w-6 shrink-0 text-center">
            {player.batHand === 'L' ? '左' : player.batHand === 'R' ? '右' : '-'}
          </span>
          <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs w-14 shrink-0 text-center">
            {player.battingAvg || '---'}
          </span>
          <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs w-10 shrink-0 text-center">
            {player.homeRuns ?? '-'}本
          </span>
          <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs w-10 shrink-0 text-center">
            {player.rbi ?? '-'}打点
          </span>
          <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs w-14 shrink-0 text-center">
            {player.ops || '---'}
          </span>
          <button
            onClick={onOpenGameStats}
            className="bg-gray-600 hover:bg-gray-500 text-gray-200 rounded px-2 py-0.5 text-xs shrink-0"
            title="この試合の打撃成績を編集"
          >
            成績編集
          </button>
          {(player.gameAtBats != null) && (
            <span className="text-green-400 text-xs">
              {player.gameAtBats}打数
              {((player.gameSingles ?? 0) + (player.gameDoubles ?? 0) + (player.gameTriples ?? 0) + (player.gameHomeRuns ?? 0))}安打
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PitcherRow({
  player,
  roster,
  onSelect,
  onChange,
  showStats,
  gameStats,
  retiredPitcherNumbers,
  currentAppearance,
  isCurrentPitcher,
  teamHistory,
  allPitcherStats,
  allPitcherGameStats,
  currentPitchCount,
  currentPitcherKey,
  onOpenGameStats,
}: {
  player: LineupPlayer
  roster: RosterPlayer[]
  onSelect: () => void
  onChange: (p: LineupPlayer) => void
  showStats: boolean
  gameStats?: PitcherGameStats
  /** この試合で降板済みの投手背番号一覧 */
  retiredPitcherNumbers: Set<string>
  /** 現在の投手の登板履歴エントリ */
  currentAppearance?: PitcherAppearance
  /** この投手が現在登板中か */
  isCurrentPitcher: boolean
  /** このチームの投手登板履歴 */
  teamHistory: PitcherAppearance[]
  /** 投手別累計投球数 */
  allPitcherStats: Record<string, number>
  /** 投手別試合中成績 */
  allPitcherGameStats: Record<string, PitcherGameStats>
  /** 登板中投手の現在の投球数 */
  currentPitchCount: number
  /** 現在守備中の投手キー "${team}-${number}" */
  currentPitcherKey: string
  onOpenGameStats: () => void
}) {
  const pitchers = sortedRoster(roster)
    .filter((r) => r.positionCategory === '投手')
    .filter((r) => !retiredPitcherNumbers.has(r.number))
  const appearanceLabel = currentAppearance
    ? currentAppearance.order === 0
      ? '先発'
      : `中継ぎ${currentAppearance.order}番手`
    : null
  return (
    <div className="text-sm rounded px-1.5 py-1 space-y-0.5 bg-red-900/20 border border-red-800/30">
    <div className="flex items-center gap-1.5">
      <span className="text-red-400 w-4 text-center text-xs shrink-0 font-bold">
        P
      </span>
      <span className="text-red-400 text-xs w-12 shrink-0 text-center font-bold">
        投
      </span>
      {pitchers.length > 0 ? (
        <select
          className="bg-gray-700 text-white rounded px-1 py-1 text-xs flex-1 min-w-0"
          value=""
          onChange={(e) => {
            const r = pitchers.find((r) => `${r.number}__${r.name}` === e.target.value)
            if (r) onChange({
              ...player,
              name: r.name,
              number: r.number,
              appearances: r.appearances ?? '',
              record: r.record ?? '',
              wins: r.wins,
              losses: r.losses,
              saves: r.saves,
              holds: r.holds,
              holdPoints: r.holdPoints,
              completeGames: r.completeGames,
              shutouts: r.shutouts,
              noWalkGames: r.noWalkGames,
              winPct: r.winPct,
              battersFaced: r.battersFaced,
              inningsPitched: r.inningsPitched,
              hitsAllowed: r.hitsAllowed,
              homeRunsAllowed: r.homeRunsAllowed,
              walksAllowed: r.walksAllowed,
              intentionalWalksAllowed: r.intentionalWalksAllowed,
              hitByPitchAllowed: r.hitByPitchAllowed,
              strikeoutsThrown: r.strikeoutsThrown,
              wildPitches: r.wildPitches,
              balks: r.balks,
              runsAllowed: r.runsAllowed,
              earnedRuns: r.earnedRuns,
              era: r.era,
              whip: r.whip,
              throwHand: r.throwHand,
            })
          }}
        >
          <option value="">{player.name || '-- 投手を選択 --'}</option>
          {pitchers.map((r) => (
            <option key={`${r.number}__${r.name}`} value={`${r.number}__${r.name}`}>
              {formatRosterOptionLabel(r.positionCategory, r.name, r.number)}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="bg-gray-700 text-white rounded px-2 py-1 text-xs flex-1 min-w-0"
          placeholder="投手名"
          value={player.name}
          onChange={(e) => onChange({ ...player, name: e.target.value })}
        />
      )}
      <input
        className="bg-gray-700 text-white rounded px-1 py-1 text-xs w-10 shrink-0"
        placeholder="登板"
        value={player.appearances || ''}
        onChange={(e) => onChange({ ...player, appearances: e.target.value })}
      />
      <input
        className="bg-gray-700 text-white rounded px-1 py-1 text-xs w-20 shrink-0"
        placeholder="勝敗"
        value={player.record || ''}
        onChange={(e) => onChange({ ...player, record: e.target.value })}
      />
      <button
        onClick={onSelect}
        disabled={isCurrentPitcher}
        className={`text-xs px-2 py-1 rounded shrink-0 font-bold ${
          isCurrentPitcher
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-red-700 hover:bg-red-600 text-white'
        }`}
        title={isCurrentPitcher ? 'この投手は登板中です' : 'この投手を登板'}
      >
        登板
      </button>
    </div>
    {/* 登板状況表示 */}
    {isCurrentPitcher && (
      <div className="flex items-center gap-1.5 pl-5">
        <span className="text-green-400 text-xs font-bold animate-pulse">● 登板中</span>
        {appearanceLabel && (
          <span className="text-yellow-300 text-xs font-bold">{appearanceLabel}</span>
        )}
      </div>
    )}
    {showStats && (
      <div className="flex items-center gap-1 pl-5 flex-wrap">
        <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs shrink-0 text-center">
          防{computeLiveEra(player, gameStats) ?? player.era ?? '---'}
        </span>
        <span className="bg-gray-700/60 text-gray-300 rounded px-1 py-0.5 text-xs shrink-0 text-center">
          W{computeLiveWhip(player, gameStats) ?? player.whip ?? '---'}
        </span>
        <button
          onClick={onOpenGameStats}
          className="bg-gray-600 hover:bg-gray-500 text-gray-200 rounded px-2 py-0.5 text-xs shrink-0"
          title="この試合の投手成績を編集"
        >
          成績編集
        </button>
        {gameStats && (
          <span className="text-green-400 text-xs font-mono">
            {formatPitcherGameSummary(gameStats)}
          </span>
        )}
      </div>
    )}
    {!showStats && gameStats && (
      <div className="flex items-center gap-1 pl-5">
        <span className="text-green-400 text-xs font-mono">
          📊 {formatPitcherGameSummary(gameStats)}
        </span>
      </div>
    )}
    {/* 投手交代履歴 */}
    {teamHistory.length > 0 && (
      <div className="text-[10px] text-gray-400 px-2 space-y-0.5">
        {teamHistory.map((p) => {
          const key = `${p.team}-${p.number}`
          const pitchCount = (p.isActive && key === currentPitcherKey) ? currentPitchCount : (allPitcherStats[key] ?? 0)
          const gs = allPitcherGameStats[key]
          const outsRecorded = gs?.outsRecorded ?? 0
          const label = p.order === 0 ? '先発' : `${p.order}番手`
          if (p.isActive) {
            return (
              <div key={key} className="flex gap-2 text-green-400">
                <span>{label}</span>
                <span>{p.name}</span>
                <span>{formatOutsAsInnings(outsRecorded)}回</span>
                <span>{pitchCount}球</span>
                <span className="animate-pulse">登板中</span>
              </div>
            )
          }
          return (
            <div key={key} className="flex gap-2">
              <span>{label}</span>
              <span className="text-gray-300">{p.name}</span>
              <span>{formatOutsAsInnings(outsRecorded)}回</span>
              <span>{pitchCount}球</span>
            </div>
          )
        })}
      </div>
    )}
    </div>
  )
}

/** 1チーム分の打順パネル */
function TeamLineupPanel({ side }: { side: 'away' | 'home' }) {
  const [csvError, setCsvError] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
  /** 打者の試合内成績編集モーダル対象: lineup index */
  const [editBatterStatsIdx, setEditBatterStatsIdx] = useState<number | null>(null)
  /** 投手の試合内成績編集モーダルを開くか */
  const [editPitcherStats, setEditPitcherStats] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rosterFileRef = useRef<HTMLInputElement>(null)

  const roster = useRosterStore((s) => side === 'away' ? s.awayRoster : s.homeRoster)
  const setRoster = useRosterStore((s) => s.setRoster)
  const clearRoster = useRosterStore((s) => s.clearRoster)

  const team = useGameStore((s) => side === 'away' ? s.awayTeam : s.homeTeam)
  const lineup = useGameStore((s) => side === 'away' ? s.awayLineup : s.homeLineup)
  const batterIdx = useGameStore((s) => side === 'away' ? s.awayBatterIndex : s.homeBatterIndex)
  const currentHalf = useGameStore((s) => s.currentHalf)
  const runnerIndices = useGameStore((s) => s.runnerIndices)
  const setLineupPlayer = useGameStore((s) => s.setLineupPlayer)
  const setLineup = useGameStore((s) => s.setLineup)
  const selectBatter = useGameStore((s) => s.selectBatter)
  const nextBatter = useGameStore((s) => s.nextBatter)
  const prevBatter = useGameStore((s) => s.prevBatter)
  const setLineupDisplayTeam = useGameStore((s) => s.setLineupDisplayTeam)
  const setRunnerAtBase = useGameStore((s) => s.setRunnerAtBase)
  const scoreRunnerWithRBI = useGameStore((s) => s.scoreRunnerWithRBI)
  const scoreRunnerNoRBI = useGameStore((s) => s.scoreRunnerNoRBI)
  const scoreRunnerUnearned = useGameStore((s) => s.scoreRunnerUnearned)
  const scoreUrl = useGameStore((s) => s.scoreUrl)
  const pitcherGameStats = useGameStore((s) => s.pitcherGameStats)
  const pitcher = useGameStore((s) => s.pitcher)
  const pitcherHistory = useGameStore((s) => s.pitcherHistory)
  const pitcherStats = useGameStore((s) => s.pitcherStats)
  const pitchCount = useGameStore((s) => s.pitchCount)

  const [fetchingLineup, setFetchingLineup] = useState(false)

  const isAttacking = (side === 'away' && currentHalf === 'top') ||
    (side === 'home' && currentHalf === 'bottom')
  const label = side === 'away' ? '先攻' : '後攻'

  /** NPBスコアページから打順を取得して適用する */
  const handleFetchLineup = async () => {
    if (!scoreUrl) return
    setFetchingLineup(true)
    setCsvError(null)
    try {
      const [awayOrder, homeOrder] = await fetchScorePageLineup(scoreUrl)
      const entries = side === 'away' ? awayOrder : homeOrder
      if (entries.length === 0) {
        setCsvError('スコアページからオーダーを取得できませんでした')
        return
      }

      const currentLineup = [...lineup]
      for (const entry of entries) {
        const idx = entry.order - 1
        if (idx < 0 || idx > 8) continue

        // ロスターとのマッチング
        const matched = roster.length > 0 ? matchAbbreviatedName(entry.name, roster) : null
        const existing = currentLineup[idx]!
        // 同じ選手が既にセットされている場合、成績は保持する
        const isSamePlayer = matched
          ? (existing.name === matched.name && existing.number === matched.number)
          : false

        if (matched) {
          // ロスターからフル情報を取得
          const isPitcher = matched.positionCategory === '投手'
          currentLineup[idx] = {
            ...existing,
            order: entry.order,
            position: entry.position,
            name: matched.name,
            number: matched.number,
            // 打投左右は静的属性なので常に更新
            batHand: matched.batHand,
            throwHand: matched.throwHand,
            switchHitter: matched.batHand === 'S',
            ...(isPitcher || isSamePlayer ? {} : {
              battingAvg: matched.battingAvg ?? '',
              homeRuns: matched.homeRuns ?? '',
              rbi: matched.rbi ?? '',
              ops: matched.ops ?? '',
              games: matched.games,
              plateAppearances: matched.plateAppearances,
              atBats: matched.atBats,
              runs: matched.runs,
              hits: matched.hits,
              doubles: matched.doubles,
              triples: matched.triples,
              totalBases: matched.totalBases,
              stolenBases: matched.stolenBases,
              caughtStealing: matched.caughtStealing,
              sacrificeHits: matched.sacrificeHits,
              sacrificeFlies: matched.sacrificeFlies,
              walks: matched.walks,
              intentionalWalks: matched.intentionalWalks,
              hitByPitch: matched.hitByPitch,
              strikeouts: matched.strikeouts,
              groundedIntoDoublePlays: matched.groundedIntoDoublePlays,
              sluggingPct: matched.sluggingPct,
              onBasePct: matched.onBasePct,
            }),
          }

          // 投手が1-9番に入っている場合、10番にも投手としてセット
          if (isPitcher && entry.position === '投') {
            const existingPitcher = currentLineup[9]!
            const isSamePitcher = existingPitcher.name === matched.name && existingPitcher.number === matched.number
            currentLineup[9] = {
              ...existingPitcher,
              name: matched.name,
              number: matched.number,
              position: '投',
            // 打投左右は静的属性なので常に更新
              throwHand: matched.throwHand,
              batHand: matched.batHand,
              switchHitter: matched.batHand === 'S',
              // 同じ投手なら試合中の成績を保持
              ...(isSamePitcher ? {} : {
                appearances: matched.appearances ?? '',
                record: matched.record ?? '',
                wins: matched.wins,
                losses: matched.losses,
                saves: matched.saves,
                holds: matched.holds,
                holdPoints: matched.holdPoints,
                completeGames: matched.completeGames,
                shutouts: matched.shutouts,
                noWalkGames: matched.noWalkGames,
                winPct: matched.winPct,
                battersFaced: matched.battersFaced,
                inningsPitched: matched.inningsPitched,
                hitsAllowed: matched.hitsAllowed,
                homeRunsAllowed: matched.homeRunsAllowed,
                walksAllowed: matched.walksAllowed,
                intentionalWalksAllowed: matched.intentionalWalksAllowed,
                hitByPitchAllowed: matched.hitByPitchAllowed,
                strikeoutsThrown: matched.strikeoutsThrown,
                wildPitches: matched.wildPitches,
                balks: matched.balks,
                runsAllowed: matched.runsAllowed,
                earnedRuns: matched.earnedRuns,
                era: matched.era,
                whip: matched.whip,
                throwHand: matched.throwHand,
              }),
            }
          }
        } else {
          // ロスターなし：スコアページの名前だけセット
          currentLineup[idx] = {
            ...currentLineup[idx]!,
            order: entry.order,
            position: entry.position,
            name: entry.name,
          }

          if (entry.position === '投') {
            currentLineup[9] = {
              ...currentLineup[9]!,
              name: entry.name,
              position: '投',
            }
          }
        }
      }

      setLineup(side, currentLineup)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : '打順の取得に失敗しました')
    } finally {
      setFetchingLineup(false)
    }
  }

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const players = parseLineupCsv(reader.result as string)
        setLineup(side, players)
        setCsvError(null)
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'CSV読み込みに失敗しました')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleRosterImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const players = parseRosterCsv(reader.result as string)
        setRoster(side, players)
        setCsvError(null)
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : '選手名簿の読み込みに失敗しました')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div
      className={`rounded-lg p-3 space-y-2 ${
        isAttacking
          ? 'bg-yellow-900/20 border-2 border-yellow-500/50'
          : 'bg-gray-800 border border-gray-700'
      }`}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-6 rounded" style={{ backgroundColor: team.color }} />
          <span className="text-white font-bold text-sm">{team.name}</span>
          <span className="text-gray-400 text-xs">（{label}）</span>
          {isAttacking && (
            <span className="text-yellow-400 text-xs font-bold animate-pulse">攻撃中</span>
          )}
          {!isAttacking && (
            <span className="text-gray-500 text-xs">守備中</span>
          )}
          <button
            onClick={() => setShowStats((v) => !v)}
            className={`text-xs px-1.5 py-0.5 rounded border ${
              showStats
                ? 'border-gray-400 text-gray-200 bg-gray-600'
                : 'border-gray-600 text-gray-500 bg-transparent'
            }`}
            title="スタッツ表示切替"
          >
            Stats
          </button>
        </div>
        {isAttacking && (
          <div className="flex gap-1">
            <button
              onClick={() => { setLineupDisplayTeam(side); prevBatter() }}
              className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1.5 rounded text-xs font-bold"
            >
              ← 前の打者
            </button>
            <button
              onClick={() => { setLineupDisplayTeam(side); nextBatter() }}
              className="bg-accent hover:bg-accent/80 text-white px-3 py-1.5 rounded text-xs font-bold"
            >
              次の打者 →
            </button>
          </div>
        )}
      </div>

      {/* CSV / プリセット */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvImport}
        />
        <input
          ref={rosterFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleRosterImport}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold"
        >
          打順CSV読込
        </button>
        <button
          onClick={() => rosterFileRef.current?.click()}
          className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded text-xs font-bold"
        >
          選手名簿CSV読込
          {roster.length > 0 && (
            <span className="ml-1 text-purple-200">({roster.length}名)</span>
          )}
        </button>
        <button
          onClick={handleFetchLineup}
          disabled={!scoreUrl || fetchingLineup}
          className={`px-2 py-1 rounded text-xs font-bold ${
            scoreUrl && !fetchingLineup
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
          title={scoreUrl ? 'NPBスコアページから打順を取得' : 'まず試合管理でURLを設定してください'}
        >
          {fetchingLineup ? '取得中...' : '打順取得'}
        </button>
        {roster.length > 0 && (
          <button
            onClick={() => clearRoster(side)}
            className="text-gray-500 hover:text-gray-300 text-xs px-1"
            title="名簿をクリア"
          >
            ✕名簿
          </button>
        )}
      </div>
      {csvError && (
        <div className="bg-red-900/50 border border-red-500 rounded px-3 py-1.5 text-red-300 text-xs">
          {csvError}
        </div>
      )}

      {/* ラインナップ（1-9番打者） */}
      <div className="space-y-0.5">
        {lineup.slice(0, 9).map((player, idx) => {
          const runnerBase =
            runnerIndices.first === idx ? 'first' as const :
            runnerIndices.second === idx ? 'second' as const :
            runnerIndices.third === idx ? 'third' as const : null
          return (
            <BatterRow
              key={player.order}
              player={player}
              isCurrent={idx === batterIdx && isAttacking}
              roster={roster}
              onSelect={() => selectBatter(side, idx)}
              onChange={(p) => setLineupPlayer(side, idx, p)}
              isAttacking={isAttacking}
              runnerBase={runnerBase}
              onSetBase={(base) => setRunnerAtBase(base, runnerIndices[base] === idx ? null : idx)}
              onScoreWithRBI={() => scoreRunnerWithRBI(idx)}
              onScoreNoRBI={() => scoreRunnerNoRBI(idx)}
              onScoreUnearned={() => scoreRunnerUnearned(idx)}
              showStats={showStats}
              onOpenGameStats={() => setEditBatterStatsIdx(idx)}
            />
          )
        })}
      </div>

      {/* 投手（10番目） */}
      {lineup[9] && (() => {
        const retiredPitcherNumbers = new Set(
          pitcherHistory
            .filter((h) => h.team === side && !h.isActive)
            .map((h) => h.number)
        )
        const currentAppearance = pitcherHistory.find(
          (h) => h.team === side && h.number === lineup[9]!.number && h.isActive
        )
        const isCurrentPitcher = pitcher.number === lineup[9]!.number && pitcher.name === lineup[9]!.name
        const teamHistory = pitcherHistory.filter((h) => h.team === side)
        return (
          <PitcherRow
            player={lineup[9]!}
            roster={roster}
            onSelect={() => selectBatter(side, 9)}
            onChange={(p) => setLineupPlayer(side, 9, p)}
            showStats={showStats}
            gameStats={lineup[9]!.number ? pitcherGameStats[`${side}-${lineup[9]!.number}`] : undefined}
            retiredPitcherNumbers={retiredPitcherNumbers}
            currentAppearance={currentAppearance}
            isCurrentPitcher={isCurrentPitcher}
            teamHistory={teamHistory}
            allPitcherStats={pitcherStats}
            allPitcherGameStats={pitcherGameStats}
            currentPitchCount={pitchCount}
            currentPitcherKey={`${currentHalf === 'top' ? 'home' : 'away'}-${pitcher.number}`}
            onOpenGameStats={() => setEditPitcherStats(true)}
          />
        )
      })()}

      {/* 打者の試合内成績編集モーダル */}
      {editBatterStatsIdx !== null && lineup[editBatterStatsIdx] && (
        <BatterGameStatsModal
          player={lineup[editBatterStatsIdx]!}
          team={side}
          index={editBatterStatsIdx}
          onClose={() => setEditBatterStatsIdx(null)}
        />
      )}

      {/* 投手の試合内成績編集モーダル */}
      {editPitcherStats && lineup[9] && (
        <PitcherGameStatsModal
          player={lineup[9]!}
          pitcherKey={`${side}-${lineup[9]!.number}`}
          currentStats={lineup[9]!.number ? (pitcherGameStats[`${side}-${lineup[9]!.number}`] ?? { ...defaultPitcherGameStats }) : { ...defaultPitcherGameStats }}
          onClose={() => setEditPitcherStats(false)}
        />
      )}
    </div>
  )
}

export default function LineupControl() {
  const statDisplaySettings = useGameStore((s) => s.statDisplaySettings)
  const setStatDisplaySettings = useGameStore((s) => s.setStatDisplaySettings)

  const STAT_TOGGLES: { key: keyof typeof statDisplaySettings; label: string }[] = [
    { key: 'showBattingAvg', label: '打率' },
    { key: 'showHomeRuns', label: 'HR' },
    { key: 'showRbi', label: '打点' },
    { key: 'showOps', label: 'OPS' },
    { key: 'showAppearances', label: '登板' },
    { key: 'showRecord', label: '勝敗' },
    { key: 'showSaves', label: 'セーブ' },
    { key: 'showHolds', label: 'ホールド' },
    { key: 'showEra', label: '防御率' },
    { key: 'showWhip', label: 'WHIP' },
    { key: 'showHandedness', label: '左右' },
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-white font-bold text-lg">打順・選手</h2>

      <TeamLineupPanel side="away" />
      <TeamLineupPanel side="home" />

      {/* Overlay 表示設定 */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
        <p className="text-gray-400 text-xs font-bold mb-2">Overlay 表示項目</p>
        <div className="flex flex-wrap gap-2">
          {STAT_TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={statDisplaySettings[key]}
                onChange={(e) => setStatDisplaySettings({ [key]: e.target.checked })}
                className="accent-accent w-3.5 h-3.5"
              />
              <span className="text-gray-300 text-xs">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
