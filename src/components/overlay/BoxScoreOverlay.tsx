import { useGameStore } from '../../store/useGameStore'
import type { AtBatResult } from '../../lib/boxScore'

/** 打席結果タイプに応じた背景・文字色クラスを返す */
function resultStyle(type: AtBatResult['type']): string {
  switch (type) {
    case 'hit':       return 'bg-[rgb(255,100,100)] text-black'
    case 'walk':      return 'bg-green-500 text-black'
    case 'sacrifice': return 'bg-yellow-400 text-black'
    case 'out':       return 'bg-[rgb(180,180,180)] text-black'
  }
}

interface ResultBoxProps {
  pa: number
  result: AtBatResult
}

function ResultBox({ pa, result }: ResultBoxProps) {
  return (
    <div
      className={`relative flex items-center justify-center py-1 rounded text-xs font-bold w-[5.5rem] ${resultStyle(result.type)}`}
    >
      <span className="absolute left-1.5 opacity-70 text-[10px] text-white">{pa}</span>
      <span>{result.text}</span>
    </div>
  )
}

export default function BoxScoreOverlay() {
  const currentHalf = useGameStore((s) => s.currentHalf)
  const batter = useGameStore((s) => s.batter)
  const boxScoreData = useGameStore((s) => s.boxScoreData)

  if (!boxScoreData) return null

  // 攻撃チームに対応するボックススコアを選択
  const teamData = currentHalf === 'top' ? boxScoreData.away : boxScoreData.home

  // 現在の打者名でマッチング（NPB略称を含む部分一致）
  const batterEntry = teamData.find(
    (b) => b.name === batter.name || batter.name.startsWith(b.name) || b.name.startsWith(batter.name.split(' ')[0] ?? batter.name),
  )

  const results = batterEntry?.results ?? []
  if (results.length === 0) return null

  const row1 = results.slice(0, 4)
  const row2 = results.slice(4, 8)

  return (
    <div className="bg-black/80 backdrop-blur-sm rounded-lg px-2 py-1.5 select-none">
      <div className="flex flex-col gap-1">
        {/* 1〜4打席目 */}
        <div className="flex gap-1">
          {row1.map((r, i) => (
            <ResultBox key={i} pa={i + 1} result={r} />
          ))}
        </div>
        {/* 5〜8打席目（存在する場合のみ表示） */}
        {row2.length > 0 && (
          <div className="flex gap-1">
            {row2.map((r, i) => (
              <ResultBox key={i + 4} pa={i + 5} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
