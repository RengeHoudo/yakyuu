import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NPB_TEAM_MAP, parseNpbRosterHtml, fetchNpbRoster } from '../npbRoster'

// テスト用のミニマルなNPBページHTML
function makeHtml(teamHeading: string, rows: [string, string, string][]): string {
  const trRows = rows
    .map(([pos, num, name]) => `<tr><td>${pos}</td><td>${num}</td><td>${name}</td></tr>`)
    .join('\n')
  return `
    <html><body>
      <h5>${teamHeading}</h5>
      <table><tbody>${trRows}</tbody></table>
    </body></html>
  `
}

describe('NPB_TEAM_MAP', () => {
  it('全プリセット名がキーとして存在する', () => {
    const presets = [
      '広島', '巨人', '阪神', '中日', 'DeNA', 'ヤクルト',
      'ソフトバンク', 'オリックス', 'ロッテ', '楽天', '日本ハム', '西武',
      'セントラル', 'パシフィック',
    ]
    for (const name of presets) {
      expect(Object.prototype.hasOwnProperty.call(NPB_TEAM_MAP, name)).toBe(true)
    }
  })

  it('セントラル・パシフィックは null', () => {
    expect(NPB_TEAM_MAP['セントラル']).toBeNull()
    expect(NPB_TEAM_MAP['パシフィック']).toBeNull()
  })

  it('巨人は読売ジャイアンツにマップされる', () => {
    expect(NPB_TEAM_MAP['巨人']).toBe('読売ジャイアンツ')
  })

  it('既知の12球団はすべて非nullの文字列', () => {
    const teams = ['広島', '阪神', '中日', 'DeNA', 'ヤクルト',
      'ソフトバンク', 'オリックス', 'ロッテ', '楽天', '日本ハム', '西武', '巨人']
    for (const name of teams) {
      expect(typeof NPB_TEAM_MAP[name]).toBe('string')
    }
  })
})

describe('parseNpbRosterHtml', () => {
  it('正常: 投手・捕手・内野手・外野手を正しく抽出する', () => {
    const html = makeHtml('広島東洋カープ', [
      ['投手', '14', '大瀬良　大地'],
      ['捕手', '27', '坂倉　将吾'],
      ['内野手', '3', '小園　海斗'],
      ['外野手', '8', '西川　龍馬'],
    ])
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ positionCategory: '投手', number: '14', name: '大瀬良 大地' })
    expect(result[1]).toMatchObject({ positionCategory: '捕手', number: '27', name: '坂倉 将吾' })
    expect(result[2]).toMatchObject({ positionCategory: '内野手', number: '3', name: '小園 海斗' })
    expect(result[3]).toMatchObject({ positionCategory: '外野手', number: '8', name: '西川 龍馬' })
  })

  it('チームが見つからない場合は空配列', () => {
    const html = makeHtml('阪神タイガース', [['投手', '11', '青柳　晃洋']])
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(0)
  })

  it('テーブルなしの場合は空配列', () => {
    const html = `<html><body><h5>広島東洋カープ</h5><p>選手なし</p></body></html>`
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(0)
  })

  it('無効な守備位置のrowはスキップされる', () => {
    const html = makeHtml('広島東洋カープ', [
      ['コーチ', '80', '誰か'],       // 無効
      ['投手', '14', '大瀬良　大地'], // 有効
    ])
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(1)
    expect(result[0].positionCategory).toBe('投手')
  })

  it('名前が空のrowはスキップされる', () => {
    const html = makeHtml('広島東洋カープ', [
      ['投手', '99', ''],
      ['捕手', '27', '坂倉　将吾'],
    ])
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(1)
    expect(result[0].positionCategory).toBe('捕手')
  })

  it('3列未満のrowはスキップされる（ヘッダー行等）', () => {
    const html = `
      <html><body>
        <h5>広島東洋カープ</h5>
        <table>
          <thead><tr><th>守備</th><th>背番号</th><th>氏名</th></tr></thead>
          <tbody>
            <tr><td>投手</td><td>14</td><td>大瀬良　大地</td></tr>
          </tbody>
        </table>
      </body></html>
    `
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(1)
  })

  it('全角スペースの名前は半角スペースに正規化される', () => {
    const html = makeHtml('広島東洋カープ', [['投手', '14', '大瀬良　大地']])
    const result = parseNbRosterHtml(html, '広島')
    expect(result[0].name).toBe('大瀬良 大地')
  })
})

// fetchNpbRoster のテスト
describe('fetchNpbRoster', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('セントラルはfetchせず空配列を返す', async () => {
    const result = await fetchNpbRoster('セントラル')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('パシフィックはfetchせず空配列を返す', async () => {
    const result = await fetchNpbRoster('パシフィック')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('未知のプリセット名はfetchせず空配列を返す', async () => {
    const result = await fetchNpbRoster('存在しないチーム')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetchが成功した場合に選手一覧を返す', async () => {
    const html = makeHtml('広島東洋カープ', [
      ['投手', '14', '大瀬良　大地'],
      ['捕手', '27', '坂倉　将吾'],
    ])
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    } as Response)

    const result = await fetchNpbRoster('広島')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('大瀬良 大地')
  })

  it('HTTP エラー時に throw する', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    await expect(fetchNpbRoster('広島')).rejects.toThrow('404')
  })

  it('fetchが reject した場合も throw する', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network Error'))
    await expect(fetchNpbRoster('広島')).rejects.toThrow('Network Error')
  })
})

// parseNbRosterHtml は parseNpbRosterHtml の alias（タイポ修正）
function parseNbRosterHtml(html: string, keyword: string) {
  return parseNpbRosterHtml(html, keyword)
}
