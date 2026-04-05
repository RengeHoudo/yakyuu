import type { PositionCategory, RosterPlayer } from '../types'
import { normalizePlayerName } from './csvImport'

/**
 * プリセット名 → NPBページ内のチーム見出しキーワード
 * null: 非対応（セントラル・パシフィック等）、undefined: 未知のプリセット
 */
export const NPB_TEAM_MAP: Record<string, string | null> = {
  広島: '広島',
  巨人: '読売ジャイアンツ',
  阪神: '阪神',
  中日: '中日',
  DeNA: 'DeNA',
  ヤクルト: 'ヤクルト',
  ソフトバンク: 'ソフトバンク',
  オリックス: 'オリックス',
  ロッテ: 'ロッテ',
  楽天: '楽天',
  日本ハム: '日本ハム',
  西武: '西武',
  セントラル: null,
  パシフィック: null,
}

/** プリセット名 → NPB成績ページのチームコード */
export const NPB_STATS_CODE_MAP: Record<string, string> = {
  広島: 'c',
  巨人: 'g',
  阪神: 't',
  中日: 'd',
  DeNA: 'db',
  ヤクルト: 's',
  ソフトバンク: 'h',
  オリックス: 'b',
  ロッテ: 'm',
  楽天: 'e',
  日本ハム: 'f',
  西武: 'l',
}

const VALID_CATS: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']

/** マッチング用：名前からスペースを全て除去 */
function nameKey(name: string): string {
  return name.replace(/\s+/g, '')
}

export interface BattingStats {
  // 基本4項目（オーバーレイ表示用）
  battingAvg?: string       // 打率
  homeRuns?: string         // 本塁打
  rbi?: string              // 打点
  ops?: string              // OPS（出塁率+長打率）
  // 詳細成績
  games?: string            // 試合
  plateAppearances?: string // 打席
  atBats?: string           // 打数
  runs?: string             // 得点
  hits?: string             // 安打
  doubles?: string          // 二塁打
  triples?: string          // 三塁打
  totalBases?: string       // 塁打
  stolenBases?: string      // 盗塁
  caughtStealing?: string   // 盗塁刺
  sacrificeHits?: string    // 犠打
  sacrificeFlies?: string   // 犠飛
  walks?: string            // 四球
  intentionalWalks?: string // 故意四球
  hitByPitch?: string       // 死球
  strikeouts?: string       // 三振
  groundedIntoDoublePlays?: string // 併殺打
  sluggingPct?: string      // 長打率
  onBasePct?: string        // 出塁率
}

export interface PitchingStats {
  appearances?: string
  record?: string
}

/**
 * NPB個人打撃成績HTMLから 選手名キー → 打撃成績 の Map を生成する。
 * キーはスペース除去した選手名（nameKey）。
 */
export function parseNpbBattingHtml(html: string): Map<string, BattingStats> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const result = new Map<string, BattingStats>()

  for (const table of doc.querySelectorAll('table')) {
    // ヘッダーセルを取得（<thead> の <th>/<td> を優先、なければ最初の <tr>）
    // 実際のNPBページは改行・空白を含む場合があるため全空白を除去して正規化
    const headerCells = Array.from(
      table.querySelectorAll('thead tr:first-child th, thead tr:first-child td'),
    )
    const headers = headerCells.length > 0
      ? headerCells.map((h) => (h.textContent ?? '').replace(/\s+/g, ''))
      : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'))
          .map((h) => (h.textContent ?? '').replace(/\s+/g, ''))

    const nameIdx  = headers.findIndex((h) => h.includes('選手'))
    if (nameIdx === -1) continue

    const avgIdx   = headers.findIndex((h) => h === '打率' || h === '率')
    const hrIdx    = headers.findIndex((h) => h === '本塁打' || h === '本')
    const rbiIdx   = headers.findIndex((h) => h === '打点' || h === '点')
    const obpIdx   = headers.findIndex((h) => h.includes('出塁'))
    const slgIdx   = headers.findIndex((h) => h.includes('長打'))
    const gamesIdx = headers.findIndex((h) => h === '試合' || h === '試')
    const paIdx    = headers.findIndex((h) => h === '打席' || h === '席')
    const abIdx    = headers.findIndex((h) => h === '打数')
    const runsIdx  = headers.findIndex((h) => h === '得点')
    const hitsIdx  = headers.findIndex((h) => h === '安打')
    const doublesIdx = headers.findIndex((h) => h === '二塁打')
    const triplesIdx = headers.findIndex((h) => h === '三塁打')
    const tbIdx    = headers.findIndex((h) => h === '塁打')
    const sbIdx    = headers.findIndex((h) => h === '盗塁')
    const csIdx    = headers.findIndex((h) => h === '盗塁刺')
    const shIdx    = headers.findIndex((h) => h === '犠打')
    const sfIdx    = headers.findIndex((h) => h === '犠飛')
    const bbIdx    = headers.findIndex((h) => h === '四球')
    const ibbIdx   = headers.findIndex((h) => h === '故意四' || h === '故' || h === '故意四球' || h === '申告敬遠')
    const hbpIdx   = headers.findIndex((h) => h === '死球')
    const soIdx    = headers.findIndex((h) => h === '三振')
    const gidpIdx  = headers.findIndex((h) => h === '併殺打' || h === '併')

    // 打率列がなければ打撃成績テーブルでない
    if (avgIdx === -1) continue

    // ヘルパー関数（ダッシュ・空値をスキップ）
    const cellVal = (cells: Element[], idx: number): string | undefined => {
      if (idx === -1) return undefined
      const v = cells[idx]?.textContent?.trim()
      return v && v !== '-' && !v.startsWith('-') ? v : undefined
    }
    const intVal = (cells: Element[], idx: number): string | undefined => {
      if (idx === -1) return undefined
      const v = cells[idx]?.textContent?.trim()
      return v && v !== '-' ? v : undefined
    }

    const dataRows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(
      (row) => row.querySelectorAll('td').length > nameIdx,
    )

    for (const row of dataRows) {
      const cells = Array.from(row.querySelectorAll('td'))
      const rawName = cells[nameIdx]?.textContent?.trim() ?? ''
      if (!rawName) continue
      const name = normalizePlayerName(rawName)
      const key = nameKey(name)
      if (!key) continue

      const stats: BattingStats = {}

      const avg = cellVal(cells, avgIdx)
      if (avg) stats.battingAvg = avg
      const hr = intVal(cells, hrIdx)
      if (hr) stats.homeRuns = hr
      const rbi = intVal(cells, rbiIdx)
      if (rbi) stats.rbi = rbi

      // 出塁率・長打率 → OPS 計算 & 個別保存
      const obpStr = cellVal(cells, obpIdx)
      const slgStr = cellVal(cells, slgIdx)
      if (obpStr) stats.onBasePct = obpStr
      if (slgStr) stats.sluggingPct = slgStr
      if (obpStr && slgStr) {
        const obp = parseFloat(obpStr)
        const slg = parseFloat(slgStr)
        if (!isNaN(obp) && !isNaN(slg)) {
          stats.ops = (obp + slg).toFixed(3).replace(/^0\./, '.')
        }
      }

      // 詳細成績
      const games = intVal(cells, gamesIdx); if (games) stats.games = games
      const pa    = intVal(cells, paIdx);    if (pa)    stats.plateAppearances = pa
      const ab    = intVal(cells, abIdx);    if (ab)    stats.atBats = ab
      const runs  = intVal(cells, runsIdx);  if (runs)  stats.runs = runs
      const hits  = intVal(cells, hitsIdx);  if (hits)  stats.hits = hits
      const dbl   = intVal(cells, doublesIdx); if (dbl)  stats.doubles = dbl
      const tri   = intVal(cells, triplesIdx); if (tri)  stats.triples = tri
      const tb    = intVal(cells, tbIdx);    if (tb)    stats.totalBases = tb
      const sb    = intVal(cells, sbIdx);    if (sb)    stats.stolenBases = sb
      const cs    = intVal(cells, csIdx);    if (cs)    stats.caughtStealing = cs
      const sh    = intVal(cells, shIdx);    if (sh)    stats.sacrificeHits = sh
      const sf    = intVal(cells, sfIdx);    if (sf)    stats.sacrificeFlies = sf
      const bb    = intVal(cells, bbIdx);    if (bb)    stats.walks = bb
      const ibb   = intVal(cells, ibbIdx);   if (ibb)   stats.intentionalWalks = ibb
      const hbp   = intVal(cells, hbpIdx);   if (hbp)   stats.hitByPitch = hbp
      const so    = intVal(cells, soIdx);    if (so)    stats.strikeouts = so
      const gidp  = intVal(cells, gidpIdx);  if (gidp)  stats.groundedIntoDoublePlays = gidp

      result.set(key, stats)
    }
    if (result.size > 0) return result
  }
  return result
}

/**
 * NPB個人投手成績HTMLから 選手名キー → 投手成績 の Map を生成する。
 */
export function parseNpbPitchingHtml(html: string): Map<string, PitchingStats> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const result = new Map<string, PitchingStats>()

  for (const table of doc.querySelectorAll('table')) {
    const headerCells = Array.from(
      table.querySelectorAll('thead tr:first-child th, thead tr:first-child td'),
    )
    const headers = headerCells.length > 0
      ? headerCells.map((h) => (h.textContent ?? '').replace(/\s+/g, ''))
      : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'))
          .map((h) => (h.textContent ?? '').replace(/\s+/g, ''))

    const nameIdx = headers.findIndex((h) => h.includes('選手'))
    if (nameIdx === -1) continue

    const gIdx = headers.findIndex((h) => h === '試合' || h === '試' || h === '登板' || h === 'G')
    const wIdx = headers.findIndex((h) => h === '勝' || h === '勝利')
    const lIdx = headers.findIndex((h) => h === '敗' || h === '敗北')

    // 勝・敗列がなければ投手成績テーブルでない
    if (wIdx === -1 || lIdx === -1) continue

    const dataRows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(
      (row) => row.querySelectorAll('td').length > nameIdx,
    )

    for (const row of dataRows) {
      const cells = Array.from(row.querySelectorAll('td'))
      const rawName = cells[nameIdx]?.textContent?.trim() ?? ''
      if (!rawName) continue
      const name = normalizePlayerName(rawName)
      const key = nameKey(name)
      if (!key) continue

      const stats: PitchingStats = {}
      if (gIdx !== -1) {
        const g = cells[gIdx]?.textContent?.trim()
        if (g && g !== '-') stats.appearances = g
      }
      const w = cells[wIdx]?.textContent?.trim()
      const l = cells[lIdx]?.textContent?.trim()
      if (w && l && w !== '-' && l !== '-') stats.record = `${w}勝${l}敗`
      result.set(key, stats)
    }
    if (result.size > 0) return result
  }
  return result
}

/**
 * プリセット名に対応するチームの打撃・投手成績をNPBサイトから取得し、
 * 名簿選手にマージして返す。取得失敗時は元の players をそのまま返す。
 */
export async function fetchNpbStats(presetName: string, players: RosterPlayer[]): Promise<RosterPlayer[]> {
  const code = NPB_STATS_CODE_MAP[presetName]
  if (!code) return players

  const year = new Date().getFullYear()
  let battingMap = new Map<string, BattingStats>()
  let pitchingMap = new Map<string, PitchingStats>()

  try {
    const [battingRes, pitchingRes] = await Promise.all([
      fetch(`/api/npb-stats/batting/${year}/${code}`),
      fetch(`/api/npb-stats/pitching/${year}/${code}`),
    ])
    if (battingRes.ok) {
      battingMap = parseNpbBattingHtml(await battingRes.text())
    }
    if (pitchingRes.ok) {
      pitchingMap = parseNpbPitchingHtml(await pitchingRes.text())
    }
  } catch {
    return players
  }

  return players.map((p) => {
    const key = nameKey(p.name)
    if (p.positionCategory === '投手') {
      const stats = pitchingMap.get(key)
      return stats ? { ...p, ...stats } : p
    } else {
      const stats = battingMap.get(key)
      return stats ? { ...p, ...stats } : p
    }
  })
}


/**
 * NPB出場選手一覧ページのHTML文字列から、指定チームの名簿を抽出する。
 * @param html fetch で取得した npb.jp/announcement/roster/ のHTML全文
 * @param teamNameKeyword h5 テキストに含まれる検索キーワード（例: "広島"）
 */
export function parseNpbRosterHtml(html: string, teamNameKeyword: string): RosterPlayer[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // h2〜h6 すべてからチーム名を含む見出しを探す（NPBページのタグが変わっても対応可能）
  const allHeadings = Array.from(doc.querySelectorAll('h2, h3, h4, h5, h6'))
  const teamHeading = allHeadings.find((h) => h.textContent?.trim().includes(teamNameKeyword))
  if (!teamHeading) return []

  // 直後の table を探す（隣接要素に table がない場合は親コンテナ内も検索）
  let el: Element | null = teamHeading.nextElementSibling
  while (el && el.tagName !== 'TABLE') {
    el = el.nextElementSibling
  }
  if (!el) {
    const parent = teamHeading.closest('div, section, article, td, li')
    el = parent?.querySelector('table') ?? null
  }
  if (!el) return []

  const rows = Array.from(el.querySelectorAll('tr'))
  const players: RosterPlayer[] = []

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td'))
    if (cells.length < 3) continue
    const posRaw = cells[0]?.textContent?.trim() ?? ''
    const number = cells[1]?.textContent?.trim() ?? ''
    const rawName = cells[2]?.textContent?.trim() ?? ''
    if (!VALID_CATS.includes(posRaw as PositionCategory) || !rawName) continue
    players.push({
      positionCategory: posRaw as PositionCategory,
      number,
      name: normalizePlayerName(rawName),
    })
  }

  return players
}

/**
 * プリセット名に対応するチームの出場選手名簿をNPBサイトから取得する。
 * - セントラル・パシフィックは空配列を返す（スキップ）
 * - 開発サーバー経由（/api/npb-roster）でCORSを回避する
 * - ネットワークエラーや HTTP エラーは呼び出し元に throw する
 * - 名簿取得後に打撃・投手成績も取得してマージする
 */
export async function fetchNpbRoster(presetName: string): Promise<RosterPlayer[]> {
  const keyword = NPB_TEAM_MAP[presetName]
  if (keyword === null || keyword === undefined) return []

  // Vite dev proxy: /api/npb-roster → https://npb.jp/announcement/roster/
  const url = '/api/npb-roster'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NPBサイトへのアクセスに失敗しました (HTTP ${res.status})`)
  const html = await res.text()
  const players = parseNpbRosterHtml(html, keyword)

  // 成績を非同期フェッチしてマージ（失敗しても名簿だけは返す）
  return fetchNpbStats(presetName, players)
}
