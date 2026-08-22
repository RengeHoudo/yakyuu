import type { LineupPlayer, Position, PositionCategory, RosterPlayer } from '../types'

const VALID_POSITIONS: Position[] = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DH']

const VALID_CATEGORIES: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']

type ThrowHand = NonNullable<RosterPlayer['throwHand']>
type BatHand = NonNullable<RosterPlayer['batHand']>

function normalizeHandValue(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .toUpperCase()
}

function parseThrowHand(value: string): ThrowHand | undefined {
  const normalized = normalizeHandValue(value)
  if (['L', '左', '左投', '左投げ'].includes(normalized)) return 'L'
  if (['R', '右', '右投', '右投げ'].includes(normalized)) return 'R'
  return undefined
}

function parseBatHand(value: string): BatHand | undefined {
  const normalized = normalizeHandValue(value)
  if (['L', '左', '左打', '左打ち'].includes(normalized)) return 'L'
  if (['R', '右', '右打', '右打ち'].includes(normalized)) return 'R'
  if (['S', '両', '両打', '両打ち', '左右', 'SWITCH'].includes(normalized)) return 'S'
  return undefined
}

function parseCombinedHands(value: string): { throwHand?: ThrowHand; batHand?: BatHand } {
  const normalized = normalizeHandValue(value)
  const match = normalized.match(/^([左右RL])(?:投(?:げ)?)?[\/・-]?([右左両RLS])(?:打(?:ち)?)?$/)
  if (!match) return {}
  return {
    throwHand: parseThrowHand(match[1] ?? ''),
    batHand: parseBatHand(match[2] ?? ''),
  }
}

function inferBatHandFromName(name: string): BatHand | undefined {
  const normalized = normalizeHandValue(name.trim())
  if (normalized.startsWith('*')) return 'L'
  if (normalized.startsWith('+')) return 'S'
  return undefined
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').replace(/[\s_-]+/g, '').toLowerCase()
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader)
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)))
}

function parseWinsFromRecord(record: string): string | undefined {
  const m = record.match(/(\d+)勝/)
  return m ? m[1] : undefined
}

function parseLossesFromRecord(record: string): string | undefined {
  const m = record.match(/(\d+)敗/)
  return m ? m[1] : undefined
}

/**
 * 選手名の正規化
 * - 全角スペース → 半角スペース
 * - 全角英数字・記号（！-～）→ 半角
 * - 連続スペース → 1つに
 * - 先頭の * / ＊ を除去（左打ちを示すNPBマーク）
 * - 先頭の + / ＋ を除去（左右打］スイッチヒッターを示すNPBマーク）
 * - 先頭の "アルファベット." プレフィックスを除去（例: E.モンテロ → モンテロ）
 */
export function normalizePlayerName(name: string): string {
  return name
    .replace(/\u3000/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[*+]+/, '')   // 先頭の * (+) を除去（全角＊＋は上の変換で */+ になる）
    .replace(/^[A-Za-z]+\./, '')
}

/**
 * 全選手名簿 CSV テキストから RosterPlayer[] をパースする。
 *
 * 期待フォーマット（ヘッダー行あり）:
 *   守備位置,背番号,名前,打率,HR,打点,OPS,投,打
 *   外野手,55,秋山 翔吾,.278,4,28,.735,右,左
 * 投手成績を含む場合:
 *   守備位置,背番号,名前,登板,勝,敗,セーブ,ホールド,防御率,投,打
 *   投手,18,森下 暢仁,22,10,4,0,0,2.45,右,右
 *
 * - 守備位置: 投手 | 捕手 | 内野手 | 外野手
 * - 投: 右 | 左（R / L も可）
 * - 打: 右 | 左 | 両（R / L / S も可）
 * - 「投打」列に「右投左打」のようにまとめて指定することも可能
 * - ヘッダー行は自動スキップ（1列目が有効カテゴリでなければヘッダーと判定）
 */
export function parseRosterCsv(text: string): RosterPlayer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) throw new Error('CSVが空です')

  const firstRow = lines[0]!.split(',').map((c) => c.trim())
  const firstCol = firstRow[0]!.replace(/^\uFEFF/, '')
  const hasHeader = !VALID_CATEGORIES.includes(firstCol as PositionCategory)
  const dataLines = hasHeader ? lines.slice(1) : lines
  const headers = hasHeader ? firstRow : []
  const throwHandIdx = findHeaderIndex(headers, ['投', '投げ', '投球', '投球腕', 'throwHand', 'throws'])
  const batHandIdx = findHeaderIndex(headers, ['打', '打ち', '打席側', 'batHand', 'bats'])
  const combinedHandsIdx = findHeaderIndex(headers, ['投打', '投打左右', '左右', 'handedness'])
  const columnIndex = (aliases: string[], legacyIndex: number): number =>
    hasHeader ? findHeaderIndex(headers, aliases) : legacyIndex
  const battingAvgIdx = columnIndex(['打率'], 3)
  const homeRunsIdx = columnIndex(['HR', '本塁打'], 4)
  const rbiIdx = columnIndex(['打点', 'RBI'], 5)
  const opsIdx = columnIndex(['OPS'], 6)
  const appearancesIdx = columnIndex(['登板', '登板数'], 3)
  const winsIdx = columnIndex(['勝', '勝利'], 4)
  const lossesIdx = columnIndex(['敗', '敗戦'], 5)
  const savesIdx = columnIndex(['セーブ', 'S'], 6)
  const holdsIdx = columnIndex(['ホールド', 'H'], 7)
  const eraIdx = columnIndex(['防御率', 'ERA'], 8)

  const players: RosterPlayer[] = []
  for (const line of dataLines) {
    const cols = line.split(',').map((c) => c.trim())
    const posRaw = (cols[0] ?? '').replace(/^\uFEFF/, '')
    const number = cols[1] ?? ''
    const rawName = cols[2] ?? ''
    if (!VALID_CATEGORIES.includes(posRaw as PositionCategory) || !rawName) continue

    // ヘッダーなしの場合も、従来列の末尾に「投,打」を足した形式を受け付ける。
    const legacyThrowHandIdx = posRaw === '投手' ? 9 : 7
    const legacyBatHandIdx = posRaw === '投手' ? 10 : 8
    const combinedHands = combinedHandsIdx >= 0
      ? parseCombinedHands(cols[combinedHandsIdx] ?? '')
      : {}
    const throwHand = parseThrowHand(
      cols[throwHandIdx >= 0 ? throwHandIdx : (!hasHeader ? legacyThrowHandIdx : -1)] ?? '',
    ) ?? combinedHands.throwHand
    const batHand = parseBatHand(
      cols[batHandIdx >= 0 ? batHandIdx : (!hasHeader ? legacyBatHandIdx : -1)] ?? '',
    ) ?? combinedHands.batHand ?? inferBatHandFromName(rawName)
    const valueAt = (index: number): string | undefined =>
      index >= 0 ? (cols[index] || undefined) : undefined
    const pitcherStat = (index: number): string | undefined =>
      posRaw === '投手' ? valueAt(index) : undefined

    players.push({
      positionCategory: posRaw as PositionCategory,
      number,
      name: normalizePlayerName(rawName),
      battingAvg: valueAt(battingAvgIdx),
      homeRuns: valueAt(homeRunsIdx),
      rbi: valueAt(rbiIdx),
      ops: valueAt(opsIdx),
      appearances: pitcherStat(appearancesIdx),
      wins: pitcherStat(winsIdx),
      losses: pitcherStat(lossesIdx),
      saves: pitcherStat(savesIdx),
      holds: pitcherStat(holdsIdx),
      era: pitcherStat(eraIdx),
      throwHand,
      batHand,
    })
  }

  if (players.length === 0) throw new Error('有効な選手データがありません')
  return players
}

/**
 * CSV テキストから LineupPlayer[] をパースする。
 *
 * 期待フォーマット（ヘッダー行あり）:
 *   順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,投,打
 *
 * - 1〜9行目: 野手（打率・HR・打点・OPS を使用）
 * - 10行目: 投手（登板数・勝敗を使用）
 * - 投・打: roster CSV と同じく右／左／両（または R／L／S）を使用
 * - ヘッダー行は自動スキップ（1列目が数値でなければヘッダーと判定）
 */
export function parseLineupCsv(text: string): LineupPlayer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    throw new Error('CSVが空です')
  }

  const firstRow = lines[0]!.split(',').map((c) => c.trim())
  const firstCol = firstRow[0]!.replace(/^\uFEFF/, '')
  const hasHeader = !/^\d+$/.test(firstCol)
  const headers = hasHeader ? firstRow : []
  const dataLines = hasHeader ? lines.slice(1) : lines

  const columnIndex = (aliases: string[], legacyIndex: number): number =>
    hasHeader ? findHeaderIndex(headers, aliases) : legacyIndex
  const battingAvgIdx = columnIndex(['打率'], 4)
  const homeRunsIdx = columnIndex(['HR', '本塁打'], 5)
  const rbiIdx = columnIndex(['打点', 'RBI'], 6)
  const opsIdx = columnIndex(['OPS'], 7)
  const appearancesIdx = columnIndex(['登板', '登板数'], 8)
  const recordIdx = columnIndex(['勝敗', 'record'], 9)
  const savesIdx = columnIndex(['セーブ', 'S'], 10)
  const holdsIdx = columnIndex(['ホールド', 'H'], 11)
  const eraIdx = columnIndex(['防御率', 'ERA'], 12)
  const throwHandIdx = columnIndex(['投', '投げ', '投球', '投球腕', 'throwHand', 'throws'], 13)
  const batHandIdx = columnIndex(['打', '打ち', '打席側', 'batHand', 'bats'], 14)
  const combinedHandsIdx = hasHeader
    ? findHeaderIndex(headers, ['投打', '投打左右', '左右', 'handedness'])
    : -1

  if (dataLines.length === 0) {
    throw new Error('データ行がありません')
  }

  const players: LineupPlayer[] = []

  for (const line of dataLines) {
    const cols = line.split(',').map((c) => c.trim())
    const order = parseInt(cols[0] ?? '', 10)
    if (isNaN(order) || order < 1 || order > 10) continue

    const name = cols[1] ?? ''
    const number = cols[2] ?? ''
    const posRaw = cols[3] ?? ''
    const normalizedPosition = posRaw === '指' ? 'DH' : posRaw
    const position = (VALID_POSITIONS.includes(normalizedPosition as Position) ? normalizedPosition : '') as Position
    const combinedHands = combinedHandsIdx >= 0
      ? parseCombinedHands(cols[combinedHandsIdx] ?? '')
      : {}
    const throwHand = parseThrowHand(cols[throwHandIdx] ?? '') ?? combinedHands.throwHand
    const batHand = parseBatHand(cols[batHandIdx] ?? '')
      ?? combinedHands.batHand
      ?? inferBatHandFromName(name)
    const handedness = {
      throwHand,
      batHand,
      switchHitter: batHand === 'S',
    }

    if (order === 10) {
      // 投手
      const recordStr = cols[recordIdx] ?? ''
      players.push({
        order,
        name,
        number,
        position: position || '投',
        appearances: cols[appearancesIdx] || undefined,
        wins: parseWinsFromRecord(recordStr),
        losses: parseLossesFromRecord(recordStr),
        record: recordStr || undefined,
        saves: cols[savesIdx] || undefined,
        holds: cols[holdsIdx] || undefined,
        era: cols[eraIdx] || undefined,
        ...handedness,
      })
    } else {
      // 野手
      players.push({
        order,
        name,
        number,
        position,
        battingAvg: cols[battingAvgIdx] ?? '',
        homeRuns: cols[homeRunsIdx] ?? '',
        rbi: cols[rbiIdx] ?? '',
        ops: cols[opsIdx] ?? '',
        ...handedness,
      })
    }
  }

  // 不足分を空行で埋める（10人分）
  for (let i = 1; i <= 10; i++) {
    if (!players.find((p) => p.order === i)) {
      players.push({
        order: i,
        name: '',
        number: '',
        position: (i === 10 ? '投' : '') as Position,
      })
    }
  }

  // order 順にソート
  players.sort((a, b) => a.order - b.order)

  return players
}
