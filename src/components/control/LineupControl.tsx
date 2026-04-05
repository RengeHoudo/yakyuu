import { useRef, useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { useRosterStore } from '../../store/useRosterStore'
import type { LineupPlayer, Position, PositionCategory, RosterPlayer, RunnerIndices } from '../../types'
import { parseLineupCsv, parseRosterCsv } from '../../lib/csvImport'

const POSITIONS: Position[] = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DH', '代']

const CATEGORY_ORDER: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']
const CATEGORY_SHORT: Record<PositionCategory, string> = {
  投手: '投', 捕手: '捕', 内野手: '内', 外野手: '外',
}

function sortedRoster(roster: RosterPlayer[]): RosterPlayer[] {
  return [...roster].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.positionCategory) - CATEGORY_ORDER.indexOf(b.positionCategory),
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
  onScore,
  showStats,
}: {
  player: LineupPlayer
  isCurrent: boolean
  roster: RosterPlayer[]
  onSelect: () => void
  onChange: (p: LineupPlayer) => void
  isAttacking: boolean
  runnerBase: keyof RunnerIndices | null
  onSetBase: (base: keyof RunnerIndices) => void
  onScore: () => void
  showStats: boolean
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
                battingAvg: r.battingAvg ?? '',
                homeRuns: r.homeRuns ?? '',
                rbi: r.rbi ?? '',
                ops: r.ops ?? '',
              })
            }}
          >
            <option value="">{player.name || '-- 選手を選択 --'}</option>
            {sorted.map((r) => (
              <option key={`${r.number}__${r.name}`} value={`${r.number}__${r.name}`}>
                {CATEGORY_SHORT[r.positionCategory]}: {r.name}
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
              onClick={onScore}
              disabled={!runnerBase}
              className={`text-xs w-6 py-1 rounded font-bold ${
                runnerBase
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="生還（点数+1）"
            >
              H
            </button>
          </div>
        )}
      </div>
      {/* 2行目: スタッツ（打率・HR・打点・OPS） */}
      {showStats && (
        <div className="flex items-center gap-1 pl-5">
          <input
            className="bg-gray-700/60 text-white rounded px-1 py-0.5 text-xs w-14 shrink-0"
            placeholder="打率"
            value={player.battingAvg || ''}
            onChange={(e) => onChange({ ...player, battingAvg: e.target.value })}
          />
          <input
            className="bg-gray-700/60 text-white rounded px-1 py-0.5 text-xs w-10 shrink-0"
            placeholder="HR"
            value={player.homeRuns || ''}
            onChange={(e) => onChange({ ...player, homeRuns: e.target.value })}
          />
          <input
            className="bg-gray-700/60 text-white rounded px-1 py-0.5 text-xs w-10 shrink-0"
            placeholder="打点"
            value={player.rbi || ''}
            onChange={(e) => onChange({ ...player, rbi: e.target.value })}
          />
          <input
            className="bg-gray-700/60 text-white rounded px-1 py-0.5 text-xs w-14 shrink-0"
            placeholder="OPS"
            value={player.ops || ''}
            onChange={(e) => onChange({ ...player, ops: e.target.value })}
          />
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
}: {
  player: LineupPlayer
  roster: RosterPlayer[]
  onSelect: () => void
  onChange: (p: LineupPlayer) => void
}) {
  const pitchers = sortedRoster(roster).filter((r) => r.positionCategory === '投手')
  return (
    <div className="flex items-center gap-1.5 text-sm rounded px-1.5 py-1 bg-red-900/20 border border-red-800/30">
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
            if (r) onChange({ ...player, name: r.name, number: r.number, appearances: '', record: '' })
          }}
        >
          <option value="">{player.name || '-- 投手を選択 --'}</option>
          {pitchers.map((r) => (
            <option key={`${r.number}__${r.name}`} value={`${r.number}__${r.name}`}>
              投: {r.name}
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
        className="text-xs px-2 py-1 rounded shrink-0 bg-red-700 hover:bg-red-600 text-white font-bold"
        title="この投手を登板"
      >
        登板
      </button>
    </div>
  )
}

/** 1チーム分の打順パネル */
function TeamLineupPanel({ side }: { side: 'away' | 'home' }) {
  const [csvError, setCsvError] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
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
  const scoreRunner = useGameStore((s) => s.scoreRunner)

  const isAttacking = (side === 'away' && currentHalf === 'top') ||
    (side === 'home' && currentHalf === 'bottom')
  const label = side === 'away' ? '先攻' : '後攻'

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
              onScore={() => scoreRunner(idx)}
              showStats={showStats}
            />
          )
        })}
      </div>

      {/* 投手（10番目） */}
      {lineup[9] && (
        <PitcherRow
          player={lineup[9]}
          roster={roster}
          onSelect={() => selectBatter(side, 9)}
          onChange={(p) => setLineupPlayer(side, 9, p)}
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
