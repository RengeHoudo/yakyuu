import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { fetchNpbRoster, NPB_TEAM_MAP, SCORE_URL_PATTERN, parseScoreUrl, NPB_CODE_TO_TEAM_MAP } from '../../lib/npbRoster'
import { useRosterStore } from '../../store/useRosterStore'

const NPB_PRESETS = [
  { name: '広島', color: '#FF0000' },
  { name: '巨人', color: '#F97709' },
  { name: '阪神', color: '#FFE201' },
  { name: '中日', color: '#002569' },
  { name: 'DeNA', color: '#0091E1' },
  { name: 'ヤクルト', color: '#98C145' },
  { name: 'ソフトバンク', color: '#FCC700' },
  { name: 'オリックス', color: '#A47B01' },
  { name: 'ロッテ', color: '#C0C0C0' },
  { name: '楽天', color: '#870010' },
  { name: '日本ハム', color: '#01609A' },
  { name: '西武', color: '#336487' },
  { name: 'セントラル', color: '#0F8F2C' },
  { name: 'パシフィック', color: '#61AFE0' },
] as const

export default function GameControl() {
  const awayTeam = useGameStore((s) => s.awayTeam)
  const homeTeam = useGameStore((s) => s.homeTeam)
  const isGameOver = useGameStore((s) => s.isGameOver)
  const setTeamName = useGameStore((s) => s.setTeamName)
  const setGameOver = useGameStore((s) => s.setGameOver)
  const newGame = useGameStore((s) => s.newGame)
  const gameStartTime = useGameStore((s) => s.gameStartTime)
  const startGameTimer = useGameStore((s) => s.startGameTimer)
  const stopGameTimer = useGameStore((s) => s.stopGameTimer)
  const setTeamColor = useGameStore((s) => s.setTeamColor)
  const showWaitingScreen = useGameStore((s) => s.showWaitingScreen)
  const setShowWaitingScreen = useGameStore((s) => s.setShowWaitingScreen)
  const resetOverlayPositions = useGameStore((s) => s.resetOverlayPositions)
  const overlayScale = useGameStore((s) => s.overlayScale ?? 1)
  const setOverlayScale = useGameStore((s) => s.setOverlayScale)
  const overlayOpacity = useGameStore((s) => s.overlayOpacity ?? 1)
  const setOverlayOpacity = useGameStore((s) => s.setOverlayOpacity)
  const scoreUrl = useGameStore((s) => s.scoreUrl)
  const setScoreUrl = useGameStore((s) => s.setScoreUrl)

  // ローカル state（スムーズな入力用）
  const [awayName, setAwayName] = useState(awayTeam.name)
  const [homeName, setHomeName] = useState(homeTeam.name)
  const [awayColor, setAwayColor] = useState(awayTeam.color)
  const [homeColor, setHomeColor] = useState(homeTeam.color)
  const [scoreUrlInput, setScoreUrlInput] = useState(scoreUrl ?? '')
  const [scoreUrlError, setScoreUrlError] = useState<string | null>(null)
  const [loadingTeam, setLoadingTeam] = useState<'away' | 'home' | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [autoFetchRoster, setAutoFetchRoster] = useState(true)
  const setRoster = useRosterStore((s) => s.setRoster)

  // ストア側が変わったらローカル state を追従（IDB復元・newGame 等）
  useEffect(() => { setAwayName(awayTeam.name) }, [awayTeam.name])
  useEffect(() => { setHomeName(homeTeam.name) }, [homeTeam.name])
  useEffect(() => { setAwayColor(awayTeam.color) }, [awayTeam.color])
  useEffect(() => { setHomeColor(homeTeam.color) }, [homeTeam.color])
  useEffect(() => { setScoreUrlInput(scoreUrl ?? '') }, [scoreUrl])

  /** ローカル state → ストアに反映（name を shortName にも使用） */
  const applyTeams = () => {
    setTeamName('away', awayName, awayName)
    setTeamName('home', homeName, homeName)
    setTeamColor('away', awayColor)
    setTeamColor('home', homeColor)
  }

  /** 入力欄からフォーカスが外れたら自動でストアに反映 */
  const handleBlur = () => { applyTeams() }

  /** NPBプリセット選択: チーム名/カラーを即時反映し、名簿を非同期取得 */
  const handlePreset = async (team: 'away' | 'home', p: typeof NPB_PRESETS[number]) => {
    if (team === 'away') {
      setAwayName(p.name); setAwayColor(p.color)
      setTeamName('away', p.name, p.name); setTeamColor('away', p.color)
    } else {
      setHomeName(p.name); setHomeColor(p.color)
      setTeamName('home', p.name, p.name); setTeamColor('home', p.color)
    }

    // セントラル・パシフィック等非対応チームはフェッチしない
    const keyword = NPB_TEAM_MAP[p.name]
    if (keyword === null || keyword === undefined) return
    if (!autoFetchRoster) return

    setRosterError(null)
    setLoadingTeam(team)
    try {
      const validScoreUrl = SCORE_URL_PATTERN.test(scoreUrlInput.trim()) ? scoreUrlInput.trim() : undefined
      const roster = await fetchNpbRoster(p.name, validScoreUrl)
      if (roster.length > 0) {
        setRoster(team, roster)
      } else {
        setRosterError('NPBサイトから選手データを取得できませんでした（ページ構造が変更された可能性あり）。「選手名簿 CSV 読込」で手動インポートしてください。')
      }
    } catch {
      setRosterError('NPB名簿の取得に失敗しました。ネットワーク接続を確認してください。手動でCSVをインポートすることもできます。')
    } finally {
      setLoadingTeam(null)
    }
  }

  const handleNewGame = () => {
    if (confirm('新しい試合を開始しますか？全データがリセットされます。')) {
      newGame()
    }
  }

  /** スコアページURL を適用し、チームプリセットも自動設定する */
  const handleScoreUrlApply = () => {
    setScoreUrlError(null)
    const trimmed = scoreUrlInput.trim()
    if (!trimmed) {
      setScoreUrl('')
      return
    }
    if (!SCORE_URL_PATTERN.test(trimmed)) {
      setScoreUrlError('URLの形式が正しくありません。例: https://npb.jp/scores/2026/0405/c-t-03/')
      return
    }
    setScoreUrl(trimmed)
    // URL からチームを自動設定
    const parsed = parseScoreUrl(trimmed)
    if (parsed) {
      const homeName = NPB_CODE_TO_TEAM_MAP[parsed.homeCode]
      const awayName = NPB_CODE_TO_TEAM_MAP[parsed.awayCode]
      if (awayName) {
        const preset = NPB_PRESETS.find((p) => p.name === awayName)
        if (preset) void handlePreset('away', preset)
      }
      if (homeName) {
        const preset = NPB_PRESETS.find((p) => p.name === homeName)
        if (preset) void handlePreset('home', preset)
      }
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h2 className="text-white font-bold text-lg">試合管理</h2>

      {/* NPBスコアページURL */}
      <div className="space-y-1">
        <label className="text-gray-400 text-xs">NPBスコアページURL</label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-700 text-white rounded px-3 py-2 text-sm font-mono placeholder:text-gray-500"
            placeholder="https://npb.jp/scores/2026/0405/c-t-03/"
            value={scoreUrlInput}
            onChange={(e) => setScoreUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScoreUrlApply() }}
          />
          <button
            onClick={handleScoreUrlApply}
            className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded text-sm font-bold whitespace-nowrap"
          >
            適用
          </button>
        </div>
        {scoreUrlError && (
          <div className="text-red-400 text-xs">{scoreUrlError}</div>
        )}
        {scoreUrl && !scoreUrlError && (
          <div className="text-green-400 text-xs">✓ URL設定済み — 打順・選手欄の「打順取得」で反映できます</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">アウェイ（先攻）</label>
          <input
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="チーム名"
            value={awayName}
            onChange={(e) => setAwayName(e.target.value)}
            onBlur={handleBlur}
          />
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">カラー</label>
            <input
              type="color"
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              value={awayColor}
              onChange={(e) => { setAwayColor(e.target.value); setTeamColor('away', e.target.value) }}
            />
            <span className="text-gray-500 text-xs font-mono">{awayColor}</span>
          </div>
          <select
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
            value=""
            disabled={loadingTeam !== null}
            onChange={(e) => {
              const p = NPB_PRESETS.find((p) => p.name === e.target.value)
              if (!p) return
              void handlePreset('away', p)
            }}
          >
            <option value="">
              {loadingTeam === 'away' ? '取得中...' : 'プリセットから選択...'}
            </option>
            {NPB_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-gray-400 text-xs">ホーム（後攻）</label>
          <input
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="チーム名"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            onBlur={handleBlur}
          />
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">カラー</label>
            <input
              type="color"
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              value={homeColor}
              onChange={(e) => { setHomeColor(e.target.value); setTeamColor('home', e.target.value) }}
            />
            <span className="text-gray-500 text-xs font-mono">{homeColor}</span>
          </div>
          <select
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
            value=""
            disabled={loadingTeam !== null}
            onChange={(e) => {
              const p = NPB_PRESETS.find((p) => p.name === e.target.value)
              if (!p) return
              void handlePreset('home', p)
            }}
          >
            <option value="">
              {loadingTeam === 'home' ? '取得中...' : 'プリセットから選択...'}
            </option>
            {NPB_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {rosterError && (
        <div className="bg-orange-900/50 border border-orange-500 rounded px-3 py-2 text-orange-300 text-xs">
          {rosterError}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <input
          id="auto-fetch-roster"
          type="checkbox"
          checked={autoFetchRoster}
          onChange={(e) => { setAutoFetchRoster(e.target.checked); setRosterError(null) }}
          className="accent-accent w-4 h-4 cursor-pointer"
        />
        <label htmlFor="auto-fetch-roster" className="text-gray-300 cursor-pointer select-none">
          プリセット選択時に名簿を自動取得
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={applyTeams}
          className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded text-sm font-bold"
        >
          チーム名を反映
        </button>
        <button
          onClick={() => setGameOver(!isGameOver)}
          className={`px-4 py-2 rounded text-sm font-bold ${
            isGameOver
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isGameOver ? '試合再開' : '試合終了'}
        </button>
        <button
          onClick={handleNewGame}
          className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm font-bold"
        >
          新規試合
        </button>
      </div>

      {/* 待機画面 */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
        <span className="text-gray-400 text-sm">待機画面</span>
        <button
          onClick={() => setShowWaitingScreen(!showWaitingScreen)}
          className={`px-4 py-2 rounded text-sm font-bold ${
            showWaitingScreen
              ? 'bg-accent hover:bg-accent/80 text-white'
              : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
          }`}
        >
          {showWaitingScreen ? '表示中' : '表示する'}
        </button>
        {showWaitingScreen && (
          <span className="text-accent text-xs">タイマー開始で自動非表示</span>
        )}
      </div>

      {/* タイマー */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
        <span className="text-gray-400 text-sm">経過時間</span>
        {gameStartTime ? (
          <button
            onClick={stopGameTimer}
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm font-bold"
          >
            タイマー停止
          </button>
        ) : (
          <button
            onClick={startGameTimer}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold"
          >
            タイマー開始
          </button>
        )}
        {gameStartTime && (
          <span className="text-green-400 text-xs animate-pulse">計測中</span>
        )}
      </div>

      {/* オーバーレイ パネルサイズ・位置 */}
      <div className="space-y-2 pt-2 border-t border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm whitespace-nowrap">パネルサイズ</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={overlayScale}
            onChange={(e) => setOverlayScale(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-white text-sm font-mono w-12 text-right">
            {overlayScale.toFixed(1)}x
          </span>
          <button
            onClick={() => setOverlayScale(1)}
            className="bg-gray-600 hover:bg-gray-500 text-gray-300 px-2 py-1 rounded text-xs"
          >
            1x
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm whitespace-nowrap">不透明度</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-white text-sm font-mono w-12 text-right">
            {Math.round(overlayOpacity * 100)}%
          </span>
          <button
            onClick={() => setOverlayOpacity(1)}
            className="bg-gray-600 hover:bg-gray-500 text-gray-300 px-2 py-1 rounded text-xs"
          >
            100%
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">パネル配置</span>
          <button
            onClick={resetOverlayPositions}
            className="bg-gray-600 hover:bg-gray-500 text-gray-300 px-3 py-1.5 rounded text-xs font-bold"
          >
            位置をリセット
          </button>
        </div>
      </div>

      {isGameOver && (
        <div className="bg-red-900/50 border border-red-500 rounded p-2 text-red-300 text-sm text-center">
          試合終了
        </div>
      )}
    </div>
  )
}
