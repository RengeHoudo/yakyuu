import { useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { describeBatting } from '../../lib/officialCorrection'

const TEMPLATES = [
  'ヒット（左前）',
  'ヒット（中前）',
  'ヒット（右前）',
  '二塁打',
  '三塁打',
  'ホームラン',
  '三振',
  '見逃し三振',
  '四球',
  'ゴロアウト',
  'フライアウト',
  'ライナーアウト',
  '犠打',
  '犠飛',
  '盗塁',
  'エラー',
  '併殺打',
  '死球',
  '暴投',
  '投手交代',
  '代打',
]

export default function PlayLogControl() {
  const [text, setText] = useState('')
  const addPlayLog = useGameStore((s) => s.addPlayLog)
  const clearPlayLog = useGameStore((s) => s.clearPlayLog)
  const playLog = useGameStore((s) => s.playLog)
  const corrections = useGameStore((s) => s.officialCorrections ?? [])
  const records = useGameStore((s) => s.plateAppearanceRecords ?? [])

  const handleAdd = () => {
    if (text.trim()) {
      addPlayLog(text.trim())
      setText('')
    }
  }

  const handleTemplate = (tmpl: string) => {
    addPlayLog(tmpl)
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">経過ログ</h2>
        {playLog.length > 0 && (
          <button
            onClick={() => {
              if (confirm('経過ログを全て削除しますか？')) clearPlayLog()
            }}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            全削除
          </button>
        )}
      </div>

      {/* 自由入力 */}
      <div className="flex gap-2">
        <input
          className="flex-1 bg-gray-700 text-white rounded px-3 py-2 text-sm"
          placeholder="プレー内容を入力..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <button
          onClick={handleAdd}
          className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded text-sm font-bold"
        >
          追加
        </button>
      </div>

      {/* テンプレート */}
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl}
            onClick={() => handleTemplate(tmpl)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded text-xs"
          >
            {tmpl}
          </button>
        ))}
      </div>

      {/* 直近ログ */}
      <details className="border-t border-gray-700 pt-2 text-sm text-gray-300">
        <summary className="cursor-pointer">公式記録による補正（{corrections.length}件）</summary>
        <p className="text-xs my-2">5分ごとに掲載済み打席を補正します。投手成績は公式が手動入力に追いついた時点で補正します。</p>
        <p className="text-xs my-2">過去の集計値だけのデータは打席補正の対象外です。選手・打席を一意に照合できない場合は手動値を維持します。</p>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {[...corrections].reverse().map(entry => <p key={entry.id} className="text-xs">{new Date(entry.timestamp).toLocaleTimeString()} {entry.text}</p>)}
          {corrections.length === 0 && <p className="text-xs">補正履歴はありません。</p>}
        </div>
      </details>
      <details className="text-sm text-gray-300">
        <summary className="cursor-pointer">打席記録（{records.length}件）</summary>
        <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
          {[...records].reverse().map(entry => <p key={entry.id} className="text-xs">
            {entry.inning}回{entry.team === 'away' ? '表' : '裏'} {entry.name} 第{entry.ordinal + 1}打席：{entry.officialText ?? describeBatting(entry.stats)}
            {entry.officialText && <span className="text-gray-400">（手動入力：{describeBatting(entry.original)}）</span>}
          </p>)}
        </div>
      </details>
      {playLog.length > 0 && (
        <div className="border-t border-gray-700 pt-2 space-y-1 max-h-40 overflow-y-auto">
          {playLog.slice(0, 10).map((entry) => (
            <div key={entry.id} className="text-gray-400 text-xs flex gap-2">
              <span className="shrink-0">
                {entry.inning}回{entry.half === 'top' ? '表' : '裏'}
              </span>
              <span className="text-white">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
