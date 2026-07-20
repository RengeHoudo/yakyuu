/**
 * NPBボックススコア（box.html）のスクレイピングとパース
 */
import type { AtBatResult, AtBatResultType, BatterBoxScore, BoxScoreData } from '../types'
export type { AtBatResult, AtBatResultType, BatterBoxScore, BoxScoreData }

/**
 * スコアページURLを box.html のURLに変換する。
 * 例: `https://npb.jp/scores/2026/0718/c-t-14/` → `https://npb.jp/scores/2026/0718/c-t-14/box.html`
 */
export function buildBoxScoreUrl(scoreUrl: string): string | null {
  if (!scoreUrl) return null
  const base = scoreUrl.endsWith('/') ? scoreUrl : scoreUrl + '/'
  return base + 'box.html'
}

/**
 * 全角スペース（U+3000）および半角スペースを除去する。
 * 例: `四　球` → `四球`
 */
export function normalizeResultText(text: string): string {
  return text.replace(/[\s\u3000]/g, '')
}

/**
 * NPBボックススコアの td クラス名から打席結果タイプを判定する。
 * - ` hit Red` → `hit`
 * - ` walk Blue` → `walk`
 * - ` Green` → `sacrifice`
 * - その他 → `out`
 */
export function classifyResult(className: string): AtBatResultType {
  if (className.includes('hit') && className.includes('Red')) return 'hit'
  if (className.includes('walk') && className.includes('Blue')) return 'walk'
  if (className.includes('Green')) return 'sacrifice'
  return 'out'
}

/**
 * ボックススコアのHTMLから打者ごとの打席結果を抽出する。
 * @returns { away: 打者[], home: 打者[] } — away=先攻チーム, home=後攻チーム
 */
export function parseBoxScoreHtml(html: string): { away: BatterBoxScore[]; home: BatterBoxScore[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function parseTable(tableId: string): BatterBoxScore[] {
    const table = doc.getElementById(tableId)
    if (!table) return []

    const rows = table.querySelectorAll('tbody tr')
    const batters: BatterBoxScore[] = []
    // 直前の打順番号を記憶（代打・打者交代行はこの番号を引き継ぐ）
    let currentOrder = 0

    for (const row of rows) {
      const tds = row.querySelectorAll('td')
      // 最低8列（固定列: 打順,守備,選手,打数,得点,安打,打点,盗塁）＋イニング列が必要
      if (tds.length < 9) continue

      const orderText = tds[0]?.textContent?.trim() ?? ''
      const order = parseInt(orderText, 10)

      if (!isNaN(order) && order > 0) {
        // 打順番号ありの行：先発打者
        currentOrder = order
      } else if (currentOrder === 0) {
        // まだ打順が確定していない（先頭行より前）はスキップ
        continue
      }

      const nameEl = tds[2]?.querySelector('a')
      const name = (nameEl?.textContent ?? tds[2]?.textContent ?? '').trim()
      if (!name) continue

      // 固定列(0-7)の後、イニング結果列を収集
      const results: AtBatResult[] = []
      for (let i = 8; i < tds.length; i++) {
        const td = tds[i]!
        const raw = td.textContent ?? ''
        const text = normalizeResultText(raw)
        if (!text || text === '-') continue
        results.push({ text, type: classifyResult(td.className) })
      }

      if (!isNaN(order) && order > 0) {
        // 先発打者は常に含める
        batters.push({ order: currentOrder, name, results })
      } else if (results.length > 0) {
        // 代打・打者交代等、打順番号なしだが打席結果がある選手を含める
        batters.push({ order: currentOrder, name, results })
      }
      // 打席結果なし（投手交代のみ等）はスキップ
    }

    return batters
  }

  return {
    away: parseTable('tablefix_t_b'),
    home: parseTable('tablefix_b_b'),
  }
}
