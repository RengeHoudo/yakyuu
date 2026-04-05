import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NPB_TEAM_MAP, NPB_STATS_CODE_MAP, parseNpbRosterHtml, fetchNpbRoster, parseNpbBattingHtml, parseNpbPitchingHtml, fetchNpbStats } from '../npbRoster'
import type { RosterPlayer } from '../../types'

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
    expect(result[0]!.positionCategory).toBe('投手')
  })

  it('名前が空のrowはスキップされる', () => {
    const html = makeHtml('広島東洋カープ', [
      ['投手', '99', ''],
      ['捕手', '27', '坂倉　将吾'],
    ])
    const result = parseNpbRosterHtml(html, '広島')
    expect(result).toHaveLength(1)
    expect(result[0]!.positionCategory).toBe('捕手')
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
    expect(result[0]!.name).toBe('大瀬良 大地')
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
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => html } as Response) // roster
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)           // batting stats（空）
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)           // pitching stats（空）

    const result = await fetchNpbRoster('広島')
    expect(result).toHaveLength(2)
    expect(result[0]!.name).toBe('大瀬良 大地')
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

// ─────────────────────────────────────────────
// NPB_STATS_CODE_MAP
// ─────────────────────────────────────────────

describe('NPB_STATS_CODE_MAP', () => {
  it('広島のコードは c', () => {
    expect(NPB_STATS_CODE_MAP['広島']).toBe('c')
  })

  it('12球団すべてにコードが存在する', () => {
    const teams = ['広島', '巨人', '阪神', '中日', 'DeNA', 'ヤクルト',
      'ソフトバンク', 'オリックス', 'ロッテ', '楽天', '日本ハム', '西武']
    for (const t of teams) {
      expect(NPB_STATS_CODE_MAP[t], `${t} のコードが未定義`).toBeDefined()
    }
  })

  it('セントラル・パシフィックはコードなし', () => {
    expect(NPB_STATS_CODE_MAP['セントラル']).toBeUndefined()
    expect(NPB_STATS_CODE_MAP['パシフィック']).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// parseNpbBattingHtml
// ─────────────────────────────────────────────

// columns: 選手, 試合, 打席, 打数, 得点, 安打, 二塁打, 三塁打, 本塁打, 塁打, 打点, 盗塁, 盗塁刺, 犠打, 犠飛, 四球, 故意四, 死球, 三振, 併殺打, 打率, 長打率, 出塁率
type BattingRow = [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
function makeBattingHtml(rows: BattingRow[]): string {
  const ths = ['選手', '試合', '打席', '打数', '得点', '安打', '二塁打', '三塁打', '本塁打', '塁打', '打点', '盗塁', '盗塁刺', '犠打', '犠飛', '四球', '故意四', '死球', '三振', '併殺打', '打率', '長打率', '出塁率']
    .map((h) => `<th>${h}</th>`).join('')
  const trs = rows.map((row) =>
    `<tr>${row.map((v) => `<td>${v}</td>`).join('')}</tr>`
  ).join('\n')
  return `<html><body>
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </body></html>`
}

describe('parseNpbBattingHtml', () => {
  it('打率・HR・打点・OPS（出塁率+長打率）を正しく抽出・計算する', () => {
    const row: BattingRow = ['秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.280', '.420', '.330']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    const stats = map.get('秋山翔吾')
    expect(stats).toBeDefined()
    expect(stats?.battingAvg).toBe('.280')
    expect(stats?.homeRuns).toBe('3')
    expect(stats?.rbi).toBe('25')
    expect(stats?.ops).toBe('.750')
  })

  it('全打撃成績（試合・安打・二塁打等）を抽出できる', () => {
    const row: BattingRow = ['秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.280', '.420', '.330']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    const stats = map.get('秋山翔吾')
    expect(stats?.games).toBe('143')
    expect(stats?.plateAppearances).toBe('620')
    expect(stats?.atBats).toBe('560')
    expect(stats?.runs).toBe('95')
    expect(stats?.hits).toBe('173')
    expect(stats?.doubles).toBe('32')
    expect(stats?.triples).toBe('5')
    expect(stats?.totalBases).toBe('225')
    expect(stats?.stolenBases).toBe('20')
    expect(stats?.caughtStealing).toBe('5')
    expect(stats?.sacrificeHits).toBe('3')
    expect(stats?.sacrificeFlies).toBe('4')
    expect(stats?.walks).toBe('55')
    expect(stats?.intentionalWalks).toBe('3')
    expect(stats?.hitByPitch).toBe('2')
    expect(stats?.strikeouts).toBe('80')
    expect(stats?.groundedIntoDoublePlays).toBe('8')
    expect(stats?.sluggingPct).toBe('.420')
    expect(stats?.onBasePct).toBe('.330')
  })

  it('全角スペースを含む選手名でも正しくキーを生成する', () => {
    const row: BattingRow = ['大瀬良　大地', '20', '58', '56', '5', '10', '2', '0', '0', '12', '5', '0', '0', '8', '0', '2', '0', '0', '15', '2', '.180', '.250', '.250']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    expect(map.has('大瀬良大地')).toBe(true)
  })

  it('名前が "E.モンテロ" 形式でも正規化後のキーでヒットする', () => {
    const row: BattingRow = ['E.モンテロ', '130', '510', '478', '70', '129', '22', '3', '10', '197', '40', '5', '2', '1', '3', '28', '2', '1', '90', '10', '.270', '.440', '.380']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    // normalizePlayerName で "E." が除去 → "モンテロ"
    expect(map.has('モンテロ')).toBe(true)
  })

  it('ダッシュ値はスキップされる', () => {
    const row: BattingRow = ['田村 俊介', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '---', '-', '-']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    const stats = map.get('田村俊介')
    expect(stats?.battingAvg).toBeUndefined()
    expect(stats?.ops).toBeUndefined()
    expect(stats?.games).toBeUndefined()
    expect(stats?.hits).toBeUndefined()
  })

  it('選手名ヘッダーがなければ空 Map を返す', () => {
    const html = '<html><body><table><tr><th>A</th><th>B</th></tr></table></body></html>'
    const map = parseNpbBattingHtml(html)
    expect(map.size).toBe(0)
  })

  it('出塁率・長打率列がなければ OPS は計算されない', () => {
    const trs = '<tr><td>小園 海斗</td><td>14</td><td>58</td><td>.291</td></tr>'
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>本</th><th>点</th><th>率</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </body></html>`
    const map = parseNpbBattingHtml(html)
    const stats = map.get('小園海斗')
    expect(stats?.battingAvg).toBe('.291')
    expect(stats?.homeRuns).toBe('14')
    expect(stats?.ops).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// parseNpbPitchingHtml
// ─────────────────────────────────────────────

function makePitchingHtml(rows: [string, string, string, string][]): string {
  // [name, appearances, wins, losses]
  const trs = rows.map(([name, g, w, l]) =>
    `<tr><td>${name}</td><td>${g}</td><td>${w}</td><td>${l}</td></tr>`
  ).join('\n')
  return `<html><body>
    <table>
      <thead><tr><th>選手</th><th>試</th><th>勝</th><th>敗</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </body></html>`
}

describe('parseNpbPitchingHtml', () => {
  it('登板数と勝敗を正しく抽出する', () => {
    const html = makePitchingHtml([['森下 暢仁', '10', '5', '3']])
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('森下暢仁')
    expect(stats?.appearances).toBe('10')
    expect(stats?.record).toBe('5勝3敗')
  })

  it('全角スペースを含む名前でも正しくキーを生成する', () => {
    const html = makePitchingHtml([['大瀬良　大地', '5', '3', '2']])
    const map = parseNpbPitchingHtml(html)
    expect(map.has('大瀬良大地')).toBe(true)
  })

  it('複数投手をまとめて抽出できる', () => {
    const html = makePitchingHtml([
      ['森下 暢仁', '10', '5', '3'],
      ['大瀬良 大地', '8', '4', '2'],
    ])
    const map = parseNpbPitchingHtml(html)
    expect(map.size).toBe(2)
    expect(map.get('大瀬良大地')?.record).toBe('4勝2敗')
  })

  it('勝・敗列がなければ空 Map を返す', () => {
    const html = '<html><body><table><tr><th>選手</th><th>試</th></tr><tr><td>ABC</td><td>5</td></tr></table></body></html>'
    const map = parseNpbPitchingHtml(html)
    expect(map.size).toBe(0)
  })

  it('NPB実ページ形式のヘッダー（勝利・敗北）でもパースできる', () => {
    const trs = '<tr><td>森下 暢仁</td><td>22</td><td>10</td><td>4</td></tr>'
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>登板</th><th>勝利</th><th>敗北</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </body></html>`
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('森下暢仁')
    expect(stats).toBeDefined()
    expect(stats?.appearances).toBe('22')
    expect(stats?.record).toBe('10勝4敗')
  })

  it('左投げマーカー（*）付き選手名を正しくパースする', () => {
    const trs = '<tr><td>＊床田 寛樹</td><td>20</td><td>8</td><td>6</td></tr>'
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>登板</th><th>勝利</th><th>敗北</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </body></html>`
    const map = parseNpbPitchingHtml(html)
    // ＊が除去されたキーで取得できる
    expect(map.has('床田寛樹')).toBe(true)
    expect(map.get('床田寛樹')?.record).toBe('8勝6敗')
  })

  it('半角*付き選手名も正しくパースする', () => {
    const html = makePitchingHtml([['*床田 寛樹', '20', '8', '6']])
    const map = parseNpbPitchingHtml(html)
    expect(map.has('床田寛樹')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// fetchNpbStats
// ─────────────────────────────────────────────

describe('fetchNpbStats', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  const battingPlayers: RosterPlayer[] = [
    { positionCategory: '外野手', number: '55', name: '秋山 翔吾' },
    { positionCategory: '遊撃手' as never, number: '51', name: '小園 海斗' },
  ]
  const pitcherPlayers: RosterPlayer[] = [
    { positionCategory: '投手', number: '18', name: '森下 暢仁' },
  ]

  it('打者に打撃成績がマージされる', async () => {
    const battingHtml = makeBattingHtml([['秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.278', '.405', '.330']])
    const pitchingHtml = makePitchingHtml([])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbStats('広島', battingPlayers)
    expect(result[0]?.battingAvg).toBe('.278')
    expect(result[0]?.homeRuns).toBe('3')
    expect(result[0]?.rbi).toBe('25')
    expect(result[0]?.ops).toBe('.735')
  })

  it('投手に投手成績がマージされる', async () => {
    const battingHtml = makeBattingHtml([])
    const pitchingHtml = makePitchingHtml([['森下 暢仁', '10', '5', '3']])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbStats('広島', pitcherPlayers)
    expect(result[0]?.appearances).toBe('10')
    expect(result[0]?.record).toBe('5勝3敗')
  })

  it('非対応チーム（セントラル）は players をそのまま返す', async () => {
    const result = await fetchNpbStats('セントラル', battingPlayers)
    expect(result).toBe(battingPlayers)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetch エラー時は players をそのまま返す（graceful degradation）', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network Error'))
    const result = await fetchNpbStats('広島', battingPlayers)
    expect(result).toBe(battingPlayers)
  })

  it('HTTP エラー時は成績なしで players を返す', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    const result = await fetchNpbStats('広島', battingPlayers)
    // stats 取得失敗 → 元の players（成績フィールドなし）を返す
    expect(result[0]?.battingAvg).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// fetchNpbRoster (stats 取得込み)
// ─────────────────────────────────────────────

describe('fetchNpbRoster – stats 統合', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('名簿取得後に打撃・投手成績も取得してマージする', async () => {
    const rosterHtml = makeHtml('広島東洋カープ', [
      ['外野手', '55', '秋山 翔吾'],
      ['投手', '18', '森下 暢仁'],
    ])
    const battingHtml = makeBattingHtml([['秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.278', '.405', '.330']])
    const pitchingHtml = makePitchingHtml([['森下 暢仁', '10', '5', '3']])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbRoster('広島')
    expect(result).toHaveLength(2)
    expect(result[0]?.battingAvg).toBe('.278')
    expect(result[1]?.record).toBe('5勝3敗')
  })
})

// parseNbRosterHtml は parseNpbRosterHtml の alias（タイポ修正）
function parseNbRosterHtml(html: string, keyword: string) {
  return parseNpbRosterHtml(html, keyword)
}

// ─────────────────────────────────────────────
// parseNpbPitchingHtml — 全24列対応 (F1 + B2)
// ─────────────────────────────────────────────

// 列: 選手, 登板, 勝利, 敗北, セーブ, ホールド, ＨＰ, 完投, 完封勝, 無四球, 勝率,
//     打者, 投球回, 安打, 本塁打, 四球, 故意四, 死球, 三振, 暴投, ボーク, 失点, 自責点, 防御率
type FullPitchingRow = [
  string, string, string, string, string, string, string, string, string, string, string, string,
  string, string, string, string, string, string, string, string, string, string, string, string,
]
function makeFullPitchingHtml(rows: FullPitchingRow[]): string {
  const headers = ['選手', '登板', '勝利', '敗北', 'セーブ', 'ホールド', 'ＨＰ', '完投', '完封勝', '無四球', '勝率',
    '打者', '投球回', '安打', '本塁打', '四球', '故意四', '死球', '三振', '暴投', 'ボーク', '失点', '自責点', '防御率']
  const ths = headers.map((h) => `<th>${h}</th>`).join('')
  const trs = rows.map((row) =>
    `<tr>${row.map((v) => `<td>${v}</td>`).join('')}</tr>`,
  ).join('\n')
  return `<html><body>
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </body></html>`
}

describe('parseNpbPitchingHtml \u2013 \u516824\u5217\u5bfe\u5fdc (F1)', () => {
  const sampleRow: FullPitchingRow = [
    '森下 暢仁', '22', '10', '4', '1', '2', '3', '5', '2', '1', '.714',
    '550', '142.1', '130', '8', '35', '5', '4', '120', '2', '0', '40', '35', '2.21',
  ]

  it('全24列を正しく抽出する', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('森下暢仁')
    expect(stats).toBeDefined()
    expect(stats?.appearances).toBe('22')
    expect(stats?.wins).toBe('10')
    expect(stats?.losses).toBe('4')
    expect(stats?.saves).toBe('1')
    expect(stats?.holds).toBe('2')
    expect(stats?.holdPoints).toBe('3')
    expect(stats?.completeGames).toBe('5')
    expect(stats?.shutouts).toBe('2')
    expect(stats?.noWalkGames).toBe('1')
    expect(stats?.winPct).toBe('.714')
    expect(stats?.battersFaced).toBe('550')
    expect(stats?.inningsPitched).toBe('142.1')
    expect(stats?.hitsAllowed).toBe('130')
    expect(stats?.homeRunsAllowed).toBe('8')
    expect(stats?.walksAllowed).toBe('35')
    expect(stats?.intentionalWalksAllowed).toBe('5')
    expect(stats?.hitByPitchAllowed).toBe('4')
    expect(stats?.strikeoutsThrown).toBe('120')
    expect(stats?.wildPitches).toBe('2')
    expect(stats?.balks).toBe('0')
    expect(stats?.runsAllowed).toBe('40')
    expect(stats?.earnedRuns).toBe('35')
    expect(stats?.era).toBe('2.21')
  })

  it('wins/losses が個別に取得される', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    expect(stats?.wins).toBe('10')
    expect(stats?.losses).toBe('4')
  })

  it('saves/holds/holdPoints が取得される', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    expect(stats?.saves).toBe('1')
    expect(stats?.holds).toBe('2')
    expect(stats?.holdPoints).toBe('3')
  })

  it('era が直接取得される', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    expect(stats?.era).toBe('2.21')
  })

  it('whip が計算される: (hitsAllowed + walksAllowed) / parseInningsPitched(inningsPitched)', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    // (130 + 35) / (142 + 1/3) = 165 / 142.333 ≒ 1.16
    expect(stats?.whip).toBeDefined()
    const whip = parseFloat(stats!.whip!)
    expect(whip).toBeCloseTo((130 + 35) / (142 + 1 / 3), 1)
  })

  it('record が後方互換で生成される: "10勝4敗" 形式', () => {
    const html = makeFullPitchingHtml([sampleRow])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    expect(stats?.record).toBe('10勝4敗')
  })

  it('投球回が <span> 分割でも textContent で結合される', () => {
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>登板</th><th>勝利</th><th>敗北</th><th>セーブ</th><th>ホールド</th><th>ＨＰ</th><th>完投</th><th>完封勝</th><th>無四球</th><th>勝率</th><th>打者</th><th>投球回</th><th>安打</th><th>本塁打</th><th>四球</th><th>故意四</th><th>死球</th><th>三振</th><th>暴投</th><th>ボーク</th><th>失点</th><th>自責点</th><th>防御率</th></tr></thead>
        <tbody>
          <tr>
            <td>辻 大雅</td><td>30</td><td>3</td><td>2</td><td>5</td><td>20</td><td>25</td><td>0</td><td>0</td><td>0</td><td>.600</td><td>150</td>
            <td><span class="integer">3</span><span class="decimal">.2</span></td>
            <td>10</td><td>1</td><td>5</td><td>0</td><td>1</td><td>8</td><td>0</td><td>0</td><td>3</td><td>3</td><td>2.45</td>
          </tr>
        </tbody>
      </table>
    </body></html>`
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('辻大雅')
    expect(stats?.inningsPitched).toBe('3.2')
    // WHIP: (10 + 5) / (3 + 2/3) ≒ 4.09
    expect(stats?.whip).toBeDefined()
    const whip = parseFloat(stats!.whip!)
    expect(whip).toBeCloseTo(15 / (3 + 2 / 3), 1)
  })

  it('左投げマーカー <sup>*</sup> 付き選手名 (B2)', () => {
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>登板</th><th>勝利</th><th>敗北</th><th>セーブ</th><th>ホールド</th><th>ＨＰ</th><th>完投</th><th>完封勝</th><th>無四球</th><th>勝率</th><th>打者</th><th>投球回</th><th>安打</th><th>本塁打</th><th>四球</th><th>故意四</th><th>死球</th><th>三振</th><th>暴投</th><th>ボーク</th><th>失点</th><th>自責点</th><th>防御率</th></tr></thead>
        <tbody>
          <tr>
            <td><sup>*</sup>辻 大雅</td><td>30</td><td>3</td><td>2</td><td>5</td><td>20</td><td>25</td><td>0</td><td>0</td><td>0</td><td>.600</td><td>150</td>
            <td>36.0</td><td>30</td><td>2</td><td>12</td><td>1</td><td>2</td><td>35</td><td>1</td><td>0</td><td>14</td><td>12</td><td>3.00</td>
          </tr>
        </tbody>
      </table>
    </body></html>`
    const map = parseNpbPitchingHtml(html)
    expect(map.has('辻大雅')).toBe(true)
    expect(map.get('辻大雅')?.wins).toBe('3')
  })

  it('全角 ＊ 付き選手名も正しくパースされる (B2)', () => {
    const html = makeFullPitchingHtml([
      ['＊森下 暢仁', '22', '10', '4', '0', '0', '0', '5', '2', '1', '.714',
       '550', '142.0', '130', '8', '35', '5', '4', '120', '2', '0', '40', '35', '2.21'],
    ])
    const map = parseNpbPitchingHtml(html)
    expect(map.has('森下暢仁')).toBe(true)
  })

  it('ダッシュ値 - のフィールドは undefined', () => {
    const html = makeFullPitchingHtml([
      ['大瀬良 大地', '1', '-', '-', '-', '-', '-', '0', '0', '0', '-',
       '5', '1.0', '-', '0', '-', '0', '0', '2', '0', '0', '0', '0', '0.00'],
    ])
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('大瀬良大地')
    expect(stats?.wins).toBeUndefined()
    expect(stats?.losses).toBeUndefined()
    expect(stats?.saves).toBeUndefined()
  })

  it('投球回 0.0 の投手は whip が算出されない（0除算回避）', () => {
    const html = makeFullPitchingHtml([
      ['新人 投手', '1', '0', '0', '0', '0', '0', '0', '0', '0', '-',
       '3', '0.0', '2', '0', '1', '0', '0', '1', '0', '0', '2', '2', '99.00'],
    ])
    const map = parseNpbPitchingHtml(html)
    const stats = map.get('新人投手')
    expect(stats?.whip).toBeUndefined()
  })

  it('複数投手を正しく抽出（先発・中継ぎ・抑え混在）', () => {
    const html = makeFullPitchingHtml([
      ['森下 暢仁', '22', '10', '4', '0', '0', '0', '5', '2', '1', '.714',
       '550', '142.1', '130', '8', '35', '5', '4', '120', '2', '0', '40', '35', '2.21'],
      ['辻 大雅', '60', '3', '2', '20', '0', '23', '0', '0', '0', '.600',
       '220', '60.0', '50', '3', '20', '2', '3', '55', '2', '0', '20', '18', '2.70'],
      ['栗林 良吏', '55', '2', '3', '37', '1', '3', '0', '0', '0', '.400',
       '210', '55.1', '45', '4', '15', '1', '2', '65', '1', '0', '16', '14', '2.28'],
    ])
    const map = parseNpbPitchingHtml(html)
    expect(map.size).toBe(3)
    expect(map.get('森下暢仁')?.wins).toBe('10')
    expect(map.get('辻大雅')?.saves).toBe('20')
    expect(map.get('栗林良吏')?.saves).toBe('37')
  })
})

// ─────────────────────────────────────────────
// fetchNpbStats — 投手成績の全フィールドマージ
// ─────────────────────────────────────────────

describe('fetchNpbStats \u2013 \u6295\u624b\u5168\u30d5\u30a3\u30fc\u30eb\u30c9\u30de\u30fc\u30b8', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('投手に全成績フィールドがマージされる', async () => {
    const pitcherPlayer: RosterPlayer = { positionCategory: '投手', number: '18', name: '森下 暢仁' }
    const battingHtml = makeBattingHtml([])
    const pitchingHtml = makeFullPitchingHtml([[
      '森下 暢仁', '22', '10', '4', '1', '2', '3', '5', '2', '1', '.714',
      '550', '142.1', '130', '8', '35', '5', '4', '120', '2', '0', '40', '35', '2.21',
    ]])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbStats('広島', [pitcherPlayer])
    expect(result[0]?.wins).toBe('10')
    expect(result[0]?.losses).toBe('4')
    expect(result[0]?.saves).toBe('1')
    expect(result[0]?.holds).toBe('2')
    expect(result[0]?.era).toBe('2.21')
    expect(result[0]?.whip).toBeDefined()
  })
})
