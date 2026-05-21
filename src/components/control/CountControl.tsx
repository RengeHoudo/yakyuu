import { useGameStore } from '../../store/useGameStore'

export default function CountControl() {
  const count = useGameStore((s) => s.count)
  const addBall = useGameStore((s) => s.addBall)
  const addStrike = useGameStore((s) => s.addStrike)
  const addFoul = useGameStore((s) => s.addFoul)
  const addOut = useGameStore((s) => s.addOut)
  const resetCount = useGameStore((s) => s.resetCount)
  const subtractBall = useGameStore((s) => s.subtractBall)
  const subtractStrike = useGameStore((s) => s.subtractStrike)
  const subtractOut = useGameStore((s) => s.subtractOut)
  const pitchCount = useGameStore((s) => s.pitchCount)
  const setPitchCount = useGameStore((s) => s.setPitchCount)
  const recordSingle = useGameStore((s) => s.recordSingle)
  const recordDouble = useGameStore((s) => s.recordDouble)
  const recordTriple = useGameStore((s) => s.recordTriple)
  const recordHomeRun = useGameStore((s) => s.recordHomeRun)
  const recordWalk = useGameStore((s) => s.recordWalk)
  const recordIntentionalWalk = useGameStore((s) => s.recordIntentionalWalk)
  const recordHitByPitch = useGameStore((s) => s.recordHitByPitch)
  const recordUncaughtThirdStrike = useGameStore((s) => s.recordUncaughtThirdStrike)
  const recordError = useGameStore((s) => s.recordError)
  const recordGroundout = useGameStore((s) => s.recordGroundout)
  const recordForceOut = useGameStore((s) => s.recordForceOut)
  const recordFieldersChoice = useGameStore((s) => s.recordFieldersChoice)
  const recordSacrificeBuntFC = useGameStore((s) => s.recordSacrificeBuntFC)
  const recordSacrificeBunt = useGameStore((s) => s.recordSacrificeBunt)
  const recordSacrificeFly = useGameStore((s) => s.recordSacrificeFly)
  const recordDoublePlay = useGameStore((s) => s.recordDoublePlay)
  const recordTriplePlay = useGameStore((s) => s.recordTriplePlay)
  const runners = useGameStore((s) => s.runners)
  const runnerCount = [runners.first, runners.second, runners.third].filter(Boolean).length

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h2 className="text-white font-bold text-lg">カウント</h2>

      <div className="grid grid-cols-3 gap-3">
        {/* ボール */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-bold text-sm">B</span>
            <span className="text-white font-mono text-2xl font-bold">
              {count.balls}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={subtractBall}
              disabled={count.balls <= 0}
              className="flex-1 bg-green-900 hover:bg-green-800 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
            >
              -1
            </button>
            <button
              onClick={addBall}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white px-2 py-2 rounded text-sm font-bold"
            >
              +1
            </button>
          </div>
        </div>

        {/* ストライク */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 font-bold text-sm">S</span>
            <span className="text-white font-mono text-2xl font-bold">
              {count.strikes}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={subtractStrike}
              disabled={count.strikes <= 0}
              className="flex-1 bg-yellow-900 hover:bg-yellow-800 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
            >
              -1
            </button>
            <button
              onClick={addStrike}
              className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-2 rounded text-sm font-bold"
            >
              +1
            </button>
            <button
              onClick={addFoul}
              className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black px-2 py-2 rounded text-sm font-bold"
            >
              F
            </button>
          </div>
        </div>

        {/* アウト */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold text-sm">O</span>
            <span className="text-white font-mono text-2xl font-bold">
              {count.outs}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={subtractOut}
              disabled={count.outs <= 0}
              className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
            >
              -1
            </button>
            <button
              onClick={addOut}
              className="flex-1 bg-red-700 hover:bg-red-600 text-white px-2 py-2 rounded text-sm font-bold"
            >
              +1
            </button>
          </div>
        </div>
      </div>

      {/* 球数 */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
        <span className="text-gray-400 text-sm">投球数</span>
        <span className="text-white font-mono text-xl font-bold">{pitchCount}</span>
        <button
          onClick={() => setPitchCount(Math.max(0, pitchCount - 1))}
          className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
        >
          -1
        </button>
        <button
          onClick={() => setPitchCount(pitchCount + 1)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
        >
          +1
        </button>
        <button
          onClick={() => setPitchCount(0)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
        >
          リセット
        </button>
      </div>

      {/* プリセット */}
      <div className="flex gap-2 pt-2 border-t border-gray-700">
        <button
          onClick={resetCount}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-xs font-bold"
        >
          カウントリセット
        </button>
      </div>

      {/* 出塁 */}
      <div className="pt-2 border-t border-gray-700 space-y-1">
        <p className="text-gray-400 text-xs">出塁</p>
        <div className="flex gap-2">
          <button
            onClick={recordSingle}
            className="flex-1 bg-blue-700 hover:bg-blue-600 text-white px-2 py-2 rounded text-sm font-bold"
          >
            単打
          </button>
          <button
            onClick={recordDouble}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-2 rounded text-sm font-bold"
          >
            二塁打
          </button>
          <button
            onClick={recordTriple}
            className="flex-1 bg-blue-500 hover:bg-blue-400 text-white px-2 py-2 rounded text-sm font-bold"
          >
            三塁打
          </button>
          <button
            onClick={recordHomeRun}
            className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-2 rounded text-sm font-bold"
          >
            HR
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={recordWalk}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white px-2 py-2 rounded text-sm font-bold"
          >
            四球
          </button>
          <button
            onClick={recordIntentionalWalk}
            className="flex-1 bg-green-800 hover:bg-green-700 text-white px-2 py-2 rounded text-sm font-bold"
          >
            故意四球
          </button>
          <button
            onClick={recordHitByPitch}
            className="flex-1 bg-orange-700 hover:bg-orange-600 text-white px-2 py-2 rounded text-sm font-bold"
          >
            死球
          </button>
          <button
            onClick={recordUncaughtThirdStrike}
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white px-2 py-2 rounded text-sm font-bold"
          >
            振逃
          </button>
          <button
            onClick={recordError}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white px-2 py-2 rounded text-sm font-bold"
          >
            エラー
          </button>
          <button
            onClick={recordFieldersChoice}
            className="flex-1 bg-teal-700 hover:bg-teal-600 text-white px-2 py-2 rounded text-sm font-bold"
          >
            野選
          </button>
          <button
            onClick={recordSacrificeBuntFC}
            className="flex-1 bg-teal-800 hover:bg-teal-700 text-white px-2 py-2 rounded text-sm font-bold"
          >
            犠野
          </button>
        </div>
      </div>

      {/* アウトプレー */}
      <div className="pt-2 border-t border-gray-700 space-y-1">
        <p className="text-gray-400 text-xs">アウトプレー</p>
        <div className="flex gap-2">
          <button
            onClick={recordGroundout}
            className="flex-1 bg-red-900 hover:bg-red-800 text-white px-2 py-2 rounded text-sm font-bold"
          >
            ゴロ/飛/直
          </button>
          <button
            onClick={recordForceOut}
            className="flex-1 bg-red-900 hover:bg-red-800 text-white px-2 py-2 rounded text-sm font-bold"
          >
            封殺
          </button>
          <button
            onClick={recordSacrificeBunt}
            disabled={count.outs >= 2 || runnerCount < 1}
            className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
          >
            犠打
          </button>
          <button
            onClick={recordSacrificeFly}
            disabled={count.outs >= 2 || runnerCount < 1}
            className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
          >
            犠飛
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={recordDoublePlay}
            disabled={count.outs >= 2 || runnerCount < 1}
            className="flex-1 bg-red-800 hover:bg-red-700 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
          >
            併殺
          </button>
          <button
            onClick={recordTriplePlay}
            disabled={count.outs >= 1 || runnerCount < 2}
            className="flex-1 bg-red-800 hover:bg-red-700 disabled:opacity-30 text-white px-2 py-2 rounded text-sm font-bold"
          >
            三重殺
          </button>
        </div>
      </div>
    </div>
  )
}
