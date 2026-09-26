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
 * NPBボックススコアの td クラス名と結果テキストから打席結果タイプを判定する。
 * - ` hit Red` かつテキストに「本」を含む → `homerun`
 * - ` hit Red` → `hit`
 * - ` walk Blue` → `walk`
 * - ` Green` → `sacrifice`
 * - その他 → `out`
 */
export function classifyResult(className: string, text?: string): AtBatResultType {
  if (className.includes('hit') && className.includes('Red')) {
    if (text && text.includes('本')) return 'homerun'
    return 'hit'
  }
  if (className.includes('walk') && className.includes('Blue')) return 'walk'
  if (className.includes('Green')) return 'sacrifice'
  return 'out'
}

/**
 * ボックススコアのHTMLから打者ごとの打席結果を抽出する。
 * @returns { away: 打者[], home: 打者[] } — away=先攻チーム, home=後攻チーム
 */
export function parseBoxScoreHtml(html: string): Omit<BoxScoreData, 'fetchedAt'> {
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
      const resultInnings: number[] = []
      const headers = Array.from(table.querySelectorAll('thead tr:last-child th')).flatMap(th =>
        Array(Number(th.getAttribute('colspan')) || 1).fill(th.textContent?.trim()),
      )
      let column = 8
      for (let i = 8; i < tds.length; i++) {
        const td = tds[i]!
        const raw = td.textContent ?? ''
        const text = normalizeResultText(raw)
        const inning = Number(headers[column]) || column - 7
        column += Number(td.getAttribute('colspan')) || 1
        if (!text || text === '-') continue
        results.push({ text, type: classifyResult(td.className, text) })
        resultInnings.push(inning)
      }

      if (!isNaN(order) && order > 0) {
        // 先発打者は常に含める
        batters.push({ order: currentOrder, name, results, resultInnings })
      } else if (results.length > 0) {
        // 代打・打者交代等、打順番号なしだが打席結果がある選手を含める
        batters.push({ order: currentOrder, name, results, resultInnings })
      }
      // 打席結果なし（投手交代のみ等）はスキップ
    }

    return batters
  }

  function parsePitchers(id: string) {
    const pitchers: import('../types').PitcherBoxScore[] = []
    for (const row of doc.querySelectorAll(`#${id} > tbody > tr`)) {
      // 投球回のセル内にも table/td があるので、直下の列だけを読む。
      const cells = row.querySelectorAll(':scope > td')
      const name = cells[1]?.querySelector('a')?.textContent?.trim()
      if (!name || cells.length !== 14) continue
      const values = [5, 7, 8, 13].map(i => cells[i]?.textContent?.trim() ?? '')
      if (values.some(v => !/^\d+$/.test(v))) continue
      pitchers.push({ name, hitsAllowed: Number(values[0]), walksAllowed: Number(values[1]), hitByPitchAllowed: Number(values[2]), earnedRunsAllowed: Number(values[3]) })
    }
    return pitchers
  }

  const awayTotal = doc.querySelector('#tablefix_ls tr.top .total-1')?.textContent?.trim()
  const homeTotal = doc.querySelector('#tablefix_ls tr.bottom .total-1')?.textContent?.trim()
  return {
    away: parseTable('tablefix_t_b'),
    home: parseTable('tablefix_b_b'),
    pitchers: { away: parsePitchers('tablefix_t_p'), home: parsePitchers('tablefix_b_p') },
    ...(awayTotal && homeTotal && /^\d+$/.test(awayTotal) && /^\d+$/.test(homeTotal)
      ? { totals: { away: Number(awayTotal), home: Number(homeTotal) } } : {}),
  }
}
