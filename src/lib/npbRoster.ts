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

const VALID_CATS: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']

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
 */
export async function fetchNpbRoster(presetName: string): Promise<RosterPlayer[]> {
  const keyword = NPB_TEAM_MAP[presetName]
  if (keyword === null || keyword === undefined) return []

  // Vite dev proxy: /api/npb-roster → https://npb.jp/announcement/roster/
  const url = '/api/npb-roster'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NPBサイトへのアクセスに失敗しました (HTTP ${res.status})`)
  const html = await res.text()
  return parseNpbRosterHtml(html, keyword)
}
