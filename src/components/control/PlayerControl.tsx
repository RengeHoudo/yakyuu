import { useState, useEffect } from 'react'
import { useGameStore } from '../../store/useGameStore'
import type { PlayerInfo } from '../../types'

function PlayerForm({
  label,
  player,
  onApply,
  showThrowHand = false,
}: {
  label: string
  player: PlayerInfo
  onApply: (info: PlayerInfo) => void
  showThrowHand?: boolean
}) {
  const [name, setName] = useState(player.name)
  const [number, setNumber] = useState(player.number)
  const [stat, setStat] = useState(player.stat)
  const [statLabel, setStatLabel] = useState(player.statLabel)
  const [throwHand, setThrowHand] = useState<'' | 'L' | 'R'>(player.throwHand ?? '')

  useEffect(() => {
    setName(player.name)
    setNumber(player.number)
    setStat(player.stat)
    setStatLabel(player.statLabel)
    setThrowHand(player.throwHand ?? '')
  }, [player.name, player.number, player.stat, player.statLabel, player.throwHand])

  const applyWithThrowHand = (nextThrowHand: '' | 'L' | 'R') => onApply({
    name,
    number,
    stat,
    statLabel,
    throwHand: nextThrowHand || undefined,
  })
  const apply = () => applyWithThrowHand(throwHand)

  return (
    <div className="space-y-2">
      <label className="text-gray-400 text-xs font-bold">{label}</label>
      <div className="grid grid-cols-4 gap-2">
        <input
          className="bg-gray-700 text-white rounded px-2 py-1.5 text-sm col-span-2"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={apply}
        />
        <input
          className="bg-gray-700 text-white rounded px-2 py-1.5 text-sm"
          placeholder="背番号"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={apply}
        />
        <button
          onClick={apply}
          className="bg-accent hover:bg-accent/80 text-white rounded text-sm font-bold"
        >
          反映
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <input
          className="bg-gray-700 text-white rounded px-2 py-1.5 text-sm col-span-1"
          placeholder="ラベル（例: 打率）"
          value={statLabel}
          onChange={(e) => setStatLabel(e.target.value)}
          onBlur={apply}
        />
        <input
          className="bg-gray-700 text-white rounded px-2 py-1.5 text-sm col-span-1"
          placeholder="値（例: .312）"
          value={stat}
          onChange={(e) => setStat(e.target.value)}
          onBlur={apply}
        />
        {showThrowHand && (
          <select
            aria-label="投手の利き腕"
            className="bg-gray-700 text-white rounded px-2 py-1.5 text-sm col-span-1"
            value={throwHand}
            onChange={(e) => {
              const next = e.target.value as '' | 'L' | 'R'
              setThrowHand(next)
              applyWithThrowHand(next)
            }}
          >
            <option value="">利き腕不明</option>
            <option value="R">右投げ</option>
            <option value="L">左投げ</option>
          </select>
        )}
      </div>
    </div>
  )
}

export default function PlayerControl() {
  const batter = useGameStore((s) => s.batter)
  const pitcher = useGameStore((s) => s.pitcher)
  const setBatter = useGameStore((s) => s.setBatter)
  const setPitcher = useGameStore((s) => s.setPitcher)

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h2 className="text-white font-bold text-lg">選手情報</h2>
      <PlayerForm label="打者" player={batter} onApply={setBatter} />
      <PlayerForm label="投手" player={pitcher} onApply={setPitcher} showThrowHand />
    </div>
  )
}
