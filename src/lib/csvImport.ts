import type { LineupPlayer, Position, PositionCategory, RosterPlayer } from '../types'

const VALID_POSITIONS: Position[] = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DH']

const VALID_CATEGORIES: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']

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
 *   守備位置,背番号,名前,打率,HR,打点,OPS
 *
 * - 守備位置: 投手 | 捕手 | 内野手 | 外野手
 * - ヘッダー行は自動スキップ（1列目が有効カテゴリでなければヘッダーと判定）
 */
export function parseRosterCsv(text: string): RosterPlayer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) throw new Error('CSVが空です')

  const firstCol = lines[0]!.split(',')[0]!.trim()
  const dataLines = VALID_CATEGORIES.includes(firstCol as PositionCategory) ? lines : lines.slice(1)

  const players: RosterPlayer[] = []
  for (const line of dataLines) {
    const cols = line.split(',').map((c) => c.trim())
    const posRaw = cols[0] ?? ''
    const number = cols[1] ?? ''
    const rawName = cols[2] ?? ''
    if (!VALID_CATEGORIES.includes(posRaw as PositionCategory) || !rawName) continue
    players.push({
      positionCategory: posRaw as PositionCategory,
      number,
      name: normalizePlayerName(rawName),
      battingAvg: cols[3] || undefined,
      homeRuns: cols[4] || undefined,
      rbi: cols[5] || undefined,
      ops: cols[6] || undefined,
      // 投手用追加列（守備位置が投手の場合は cols[3]〜[8] を投手用に使用）
      appearances: posRaw === '投手' ? (cols[3] || undefined) : undefined,
      wins: posRaw === '投手' ? (cols[4] || undefined) : undefined,
      losses: posRaw === '投手' ? (cols[5] || undefined) : undefined,
      saves: posRaw === '投手' ? (cols[6] || undefined) : undefined,
      holds: posRaw === '投手' ? (cols[7] || undefined) : undefined,
      era: posRaw === '投手' ? (cols[8] || undefined) : undefined,
    })
  }

  if (players.length === 0) throw new Error('有効な選手データがありません')
  return players
}

/**
 * CSV テキストから LineupPlayer[] をパースする。
 *
 * 期待フォーマット（ヘッダー行あり）:
 *   順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗
 *
 * - 1〜9行目: 野手（打率・HR・打点・OPS を使用）
 * - 10行目: 投手（登板数・勝敗を使用）
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

  // ヘッダー行をスキップ
  const firstCol = lines[0]!.split(',')[0]!.trim()
  const dataLines = /^\d+$/.test(firstCol) ? lines : lines.slice(1)

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
    const position = (VALID_POSITIONS.includes(posRaw as Position) ? posRaw : '') as Position

    if (order === 10) {
      // 投手
      const recordStr = cols[9] ?? ''
      players.push({
        order,
        name,
        number,
        position: position || '投',
        appearances: cols[8] || undefined,
        wins: parseWinsFromRecord(recordStr),
        losses: parseLossesFromRecord(recordStr),
        record: recordStr || undefined,
        saves: cols[10] || undefined,
        holds: cols[11] || undefined,
        era: cols[12] || undefined,
      })
    } else {
      // 野手
      players.push({
        order,
        name,
        number,
        position,
        battingAvg: cols[4] ?? '',
        homeRuns: cols[5] ?? '',
        rbi: cols[6] ?? '',
        ops: cols[7] ?? '',
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
