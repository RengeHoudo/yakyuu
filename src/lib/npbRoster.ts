import type { Position, PositionCategory, RosterPlayer } from '../types'
import { parseInningsPitched } from '../types'
import { normalizePlayerName } from './csvImport'
import { fetchNpbRosterPage, fetchNpbStatsPage, fetchNpbScorePage } from './fetchProxy'

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
  wins?: string
  losses?: string
  saves?: string
  holds?: string
  holdPoints?: string
  completeGames?: string
  shutouts?: string
  noWalkGames?: string
  winPct?: string
  battersFaced?: string
  inningsPitched?: string
  hitsAllowed?: string
  homeRunsAllowed?: string
  walksAllowed?: string
  intentionalWalksAllowed?: string
  hitByPitchAllowed?: string
  strikeoutsThrown?: string
  wildPitches?: string
  balks?: string
  runsAllowed?: string
  earnedRuns?: string
  era?: string
  whip?: string    // (hitsAllowed + walksAllowed) / inningsPitched から計算
  record?: string  // 後方互換用: "${wins}勝${losses}敗"
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
 * 全24列（登板〜防御率）に対応。WHIP はパース時に計算して格納する。
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

    const wIdx = headers.findIndex((h) => h === '勝' || h === '勝利')
    const lIdx = headers.findIndex((h) => h === '敗' || h === '敗北')

    // 勝・敗列がなければ投手成績テーブルでない
    if (wIdx === -1 || lIdx === -1) continue

    const gIdx   = headers.findIndex((h) => h === '試合' || h === '試' || h === '登板' || h === 'G')
    const sIdx   = headers.findIndex((h) => h === 'セーブ' || h === 'S' || h === 'セ')
    const hIdx   = headers.findIndex((h) => h === 'ホールド' || h === 'H')
    const hpIdx  = headers.findIndex((h) => h === 'HP' || h === 'ＨＰ')
    const cgIdx  = headers.findIndex((h) => h === '完投')
    const shoIdx = headers.findIndex((h) => h === '完封勝' || h === '完封')
    const nwIdx  = headers.findIndex((h) => h === '無四球')
    const wrIdx  = headers.findIndex((h) => h === '勝率')
    const bfIdx  = headers.findIndex((h) => h === '打者')
    const ipIdx  = headers.findIndex((h) => h === '投球回')
    const haIdx  = headers.findIndex((h) => h === '安打')
    const hraIdx = headers.findIndex((h) => h === '本塁打')
    const bbIdx  = headers.findIndex((h) => h === '四球')
    const ibbIdx = headers.findIndex((h) => h === '故意四' || h === '故意四球')
    const hbpIdx = headers.findIndex((h) => h === '死球')
    const soIdx  = headers.findIndex((h) => h === '三振')
    const wpIdx  = headers.findIndex((h) => h === '暴投')
    const bkIdx  = headers.findIndex((h) => h === 'ボーク')
    const raIdx  = headers.findIndex((h) => h === '失点')
    const erIdx  = headers.findIndex((h) => h === '自責点')
    const eraIdx = headers.findIndex((h) => h === '防御率')

    const cellVal = (cells: Element[], idx: number): string | undefined => {
      if (idx === -1) return undefined
      const v = cells[idx]?.textContent?.trim()
      return v && v !== '-' && !v.startsWith('-') ? v : undefined
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

      const stats: PitchingStats = {}

      const g = cellVal(cells, gIdx); if (g) stats.appearances = g
      const w = cellVal(cells, wIdx); if (w) stats.wins = w
      const l = cellVal(cells, lIdx); if (l) stats.losses = l
      const sv = cellVal(cells, sIdx); if (sv) stats.saves = sv
      const h2 = cellVal(cells, hIdx); if (h2) stats.holds = h2
      const hp = cellVal(cells, hpIdx); if (hp) stats.holdPoints = hp
      const cg = cellVal(cells, cgIdx); if (cg) stats.completeGames = cg
      const sho = cellVal(cells, shoIdx); if (sho) stats.shutouts = sho
      const nw = cellVal(cells, nwIdx); if (nw) stats.noWalkGames = nw
      const wr = cellVal(cells, wrIdx); if (wr) stats.winPct = wr
      const bf = cellVal(cells, bfIdx); if (bf) stats.battersFaced = bf
      const ip = cellVal(cells, ipIdx); if (ip) stats.inningsPitched = ip
      const ha = cellVal(cells, haIdx); if (ha) stats.hitsAllowed = ha
      const hra = cellVal(cells, hraIdx); if (hra) stats.homeRunsAllowed = hra
      const bb = cellVal(cells, bbIdx); if (bb) stats.walksAllowed = bb
      const ibb = cellVal(cells, ibbIdx); if (ibb) stats.intentionalWalksAllowed = ibb
      const hbp = cellVal(cells, hbpIdx); if (hbp) stats.hitByPitchAllowed = hbp
      const so = cellVal(cells, soIdx); if (so) stats.strikeoutsThrown = so
      const wp = cellVal(cells, wpIdx); if (wp) stats.wildPitches = wp
      const bk = cellVal(cells, bkIdx); if (bk) stats.balks = bk
      const ra = cellVal(cells, raIdx); if (ra) stats.runsAllowed = ra
      const er = cellVal(cells, erIdx); if (er) stats.earnedRuns = er
      const era = cellVal(cells, eraIdx); if (era) stats.era = era

      // WHIP 計算（被安打 + 与四球）/ 投球回
      if (ip && ha && bb) {
        const ipNum = parseInningsPitched(ip)
        if (ipNum > 0) {
          const whipVal = (Number(ha) + Number(bb)) / ipNum
          stats.whip = whipVal.toFixed(2)
        }
      }

      // record: 後方互換用
      if (w && l) stats.record = `${w}勝${l}敗`

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
      fetchNpbStatsPage('batting', year, code),
      fetchNpbStatsPage('pitching', year, code),
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

  // Vite dev proxy or CORS proxy in production
  const res = await fetchNpbRosterPage()
  if (!res.ok) throw new Error(`NPBサイトへのアクセスに失敗しました (HTTP ${res.status})`)
  const html = await res.text()
  const players = parseNpbRosterHtml(html, keyword)

  // 成績を非同期フェッチしてマージ（失敗しても名簿だけは返す）
  return fetchNpbStats(presetName, players)
}

/** NPBスコアページ内チームコード → プリセット名の逆引きマップ */
export const NPB_CODE_TO_TEAM_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(NPB_STATS_CODE_MAP).map(([name, code]) => [code, name]),
)

/** NPBスコアページURLのバリデーション正規表現 */
export const SCORE_URL_PATTERN = /^https:\/\/npb\.jp\/scores\/(\d{4})\/(\d{4})\/([a-z]{1,2})-([a-z]{1,2})-(\d{2})\/$/

/** スコアページURLからチームコードを抽出する。先頭がホーム、2番目がアウェイ */
export function parseScoreUrl(url: string): { year: string; date: string; homeCode: string; awayCode: string; gameNum: string } | null {
  const m = url.match(SCORE_URL_PATTERN)
  if (!m) return null
  return { year: m[1]!, date: m[2]!, homeCode: m[3]!, awayCode: m[4]!, gameNum: m[5]! }
}

/** スコアページの守備位置表記 → Position 型のマッピング */
const SCORE_POSITION_MAP: Record<string, Position> = {
  '投': '投', '捕': '捕', '一': '一', '二': '二', '三': '三',
  '遊': '遊', '左': '左', '中': '中', '右': '右',
  '指': 'DH', '打': 'DH', 'D': 'DH', 'DH': 'DH',
}

/** スコアページから抽出した1行分のオーダー */
export interface ScoreLineupEntry {
  order: number
  position: Position
  name: string
}

/**
 * NPBスコアページHTMLから「最新のオーダー」セクションの打順を抽出する。
 * @returns [leftTeamLineup, rightTeamLineup] — left=アウェイ, right=ホーム
 */
export function parseScorePageLineup(html: string): [ScoreLineupEntry[], ScoreLineupEntry[]] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const orderDiv = doc.getElementById('player-order')
  if (!orderDiv) return [[], []]

  const halves = orderDiv.querySelectorAll('.half_left, .half_right')
  const result: [ScoreLineupEntry[], ScoreLineupEntry[]] = [[], []]

  halves.forEach((half, hIdx) => {
    if (hIdx > 1) return
    const rows = half.querySelectorAll('table tr')
    for (const row of rows) {
      const ths = row.querySelectorAll('th')
      const tds = row.querySelectorAll('td')
      if (ths.length < 2 || tds.length < 1) continue

      const orderNum = parseInt(ths[0]?.textContent?.trim() ?? '', 10)
      if (isNaN(orderNum) || orderNum < 1 || orderNum > 9) continue

      const posRaw = ths[1]?.textContent?.trim() ?? ''
      const position = SCORE_POSITION_MAP[posRaw] ?? ''

      // 選手名は <a> タグ内、またはプレーンテキスト
      const nameEl = tds[0]?.querySelector('a') ?? tds[0]
      const name = nameEl?.textContent?.trim() ?? ''
      if (!name) continue

      result[hIdx]!.push({ order: orderNum, position, name })
    }
  })

  return result
}

/**
 * スコアページの略称名（姓のみ or 姓+名の1文字）をロスター選手と突合する。
 *
 * マッチング優先度:
 * 1. 完全一致（スペース除去後）
 * 2. 姓の完全一致（同姓が1人のみ）
 * 3. 姓+名の先頭1文字の一致
 */
export function matchAbbreviatedName(abbreviatedName: string, roster: RosterPlayer[]): RosterPlayer | null {
  const abbr = abbreviatedName.replace(/\s+/g, '')
  if (!abbr) return null

  // 1. 完全一致
  const exact = roster.find((r) => r.name.replace(/\s+/g, '') === abbr)
  if (exact) return exact

  // ロスター選手を姓・名に分割してマッチング
  const parsed = roster.map((r) => {
    const parts = r.name.split(/\s+/)
    const lastName = parts[0] ?? ''
    const firstName = parts[1] ?? ''
    return { player: r, lastName, firstName }
  })

  // 2. 姓一致候補を集める
  const surnameMatches = parsed.filter((p) => p.lastName === abbr)
  if (surnameMatches.length === 1) return surnameMatches[0]!.player

  // 3. 姓+名先頭1文字の一致
  for (const p of parsed) {
    if (p.firstName && p.lastName + p.firstName.charAt(0) === abbr) {
      return p.player
    }
  }

  // 4. 同姓複数でも姓一致なら最初のものを返す（フォールバック）
  if (surnameMatches.length > 0) return surnameMatches[0]!.player

  return null
}

/**
 * NPBスコアページURLからオーダーを取得する。
 * Vite dev proxy 経由でフェッチする。
 */
export async function fetchScorePageLineup(scoreUrl: string): Promise<[ScoreLineupEntry[], ScoreLineupEntry[]]> {
  const parsed = parseScoreUrl(scoreUrl)
  if (!parsed) throw new Error('無効なURL形式です')

  const res = await fetchNpbScorePage(parsed.year, parsed.date, parsed.homeCode, parsed.awayCode, parsed.gameNum)
  if (!res.ok) throw new Error(`NPBスコアページの取得に失敗しました (HTTP ${res.status})`)
  const html = await res.text()
  return parseScorePageLineup(html)
}
