import { useGameStore } from '../../store/useGameStore'
import type { Position } from '../../types'
import { getDisplayNameInContext } from '../../types'

/** 表示名を最大4文字に切り詰める */
function truncate4(name: string): string {
  return name.length > 4 ? name.slice(0, 4) : name
}

/** 守備位置ごとの SVG 座標 (viewBox 260×165)
 *  各ポジションは塁の頂点座標と重ならないよう外側に配置 */
const FIELDER_COORDS: Partial<Record<Position, { x: number; y: number }>> = {
  '投': { x: 130, y: 96  },
  '捕': { x: 130, y: 138 },
  '一': { x: 218, y: 76  },
  '二': { x: 166, y: 64  },
  '三': { x: 42,  y: 76  },
  '遊': { x: 90,  y: 64  },
  '左': { x: 33,  y: 24  },
  '中': { x: 130, y: 10  },
  '右': { x: 223, y: 24  },
}

/** 塁頂点座標（ダイヤモンドの各角） */
const BASE_COORDS = {
  first:  { x: 185, y: 95  },
  second: { x: 130, y: 42  },
  third:  { x: 75,  y: 95  },
}

interface LabelProps {
  x: number
  y: number
  name: string
  isDefense: boolean
}

function PlayerLabel({ x, y, name, isDefense }: LabelProps) {
  const w = Math.max(26, name.length * 10 + 8)
  const fill   = isDefense ? '#1e293b' : '#ea580c'
  const stroke = isDefense ? '#475569' : '#c2410c'
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y="-9" width={w} height="18" rx="3"
        fill={fill} stroke={stroke} strokeWidth="0.75" />
      <text
        x="0" y="5"
        textAnchor="middle"
        fontSize="10"
        fill="white"
        fontFamily="'Noto Sans JP', 'Hiragino Sans', sans-serif"
        fontWeight={isDefense ? 'normal' : 'bold'}
      >
        {name}
      </text>
    </g>
  )
}

export default function FieldingDiagram() {
  const currentHalf   = useGameStore((s) => s.currentHalf)
  const awayLineup    = useGameStore((s) => s.awayLineup)
  const homeLineup    = useGameStore((s) => s.homeLineup)
  const runners       = useGameStore((s) => s.runners)
  const runnerIndices = useGameStore((s) => s.runnerIndices)

  const defLineup = currentHalf === 'top' ? homeLineup : awayLineup
  const atkLineup = currentHalf === 'top' ? awayLineup : homeLineup

  const defNames = defLineup.map((p) => p.name)
  const atkNames = atkLineup.map((p) => p.name)

  const fielderLabels: LabelProps[] = []
  for (const player of defLineup.slice(0, 10)) {
    if (!player.name || !player.position) continue
    const coords = FIELDER_COORDS[player.position]
    if (!coords) continue
    fielderLabels.push({
      x: coords.x,
      y: coords.y,
      name: truncate4(getDisplayNameInContext(player.name, defNames)),
      isDefense: true,
    })
  }

  const baseEntries = [
    { base: 'first'  as const, on: runners.first,  idx: runnerIndices.first  },
    { base: 'second' as const, on: runners.second, idx: runnerIndices.second },
    { base: 'third'  as const, on: runners.third,  idx: runnerIndices.third  },
  ]

  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg py-1 px-0">
      <svg viewBox="0 0 260 165" className="w-72 h-44">
        {/* ベースライン（ダイヤモンド） */}
        <polygon
          points="130,148 185,95 130,42 75,95"
          fill="none" stroke="#4b5563" strokeWidth="1"
        />
        {/* ホームプレート */}
        <rect x="124" y="144" width="12" height="10" rx="1"
          fill="#374151" stroke="#6b7280" strokeWidth="0.75" />

        {/* 塁マーカー（走者なし：白枠◆） */}
        {baseEntries.map(({ base, on }) => {
          if (on) return null
          const { x, y } = BASE_COORDS[base]
          return (
            <polygon key={base}
              points={`${x},${y - 8} ${x + 8},${y} ${x},${y + 8} ${x - 8},${y}`}
              fill="none" stroke="#9ca3af" strokeWidth="1"
            />
          )
        })}

        {/* 守備位置ラベル */}
        {fielderLabels.map((props, i) => (
          <PlayerLabel key={`f-${i}`} {...props} />
        ))}

        {/* 走者ラベル（塁の頂点に重ねてオレンジ表示） */}
        {baseEntries.map(({ base, on, idx }) => {
          if (!on) return null
          let name = '走者'
          if (idx !== null) {
            const p = atkLineup[idx]
            if (p?.name) name = truncate4(getDisplayNameInContext(p.name, atkNames))
          }
          const { x, y } = BASE_COORDS[base]
          return (
            <PlayerLabel key={`r-${base}`} x={x} y={y} name={name} isDefense={false} />
          )
        })}
      </svg>
    </div>
  )
}
