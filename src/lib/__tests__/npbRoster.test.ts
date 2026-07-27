import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NPB_CODE_TO_TEAM_MAP,
  NPB_TEAM_MAP,
  NPB_STATS_CODE_MAP,
  detectNpbAllStarType,
  parseNpbRosterHtml,
  parseNpbEventRosterHtml,
  fetchNpbRoster,
  parseNpbBattingHtml,
  parseNpbPitchingHtml,
  fetchNpbStats,
  parseScorePageLineup,
  parseNpbGameRosterHtml,
} from '../npbRoster'
import type { RosterPlayer } from '../../types'
import freshAllStarScoreHtml from '../../../docs/copilot/オールスターゲーム.html?raw'
import allStarRosterHtml from '../../../docs/copilot/オールスターゲームroster.html?raw'
import freshAllStarRosterHtml from '../../../docs/copilot/出場者 _ ナミックス フレッシュオールスターゲーム2026 _ NPB.jp 日本野球機構_roster.html?raw'

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
      'Central', 'Pacific',
    ]
    for (const name of presets) {
      expect(Object.prototype.hasOwnProperty.call(NPB_TEAM_MAP, name)).toBe(true)
    }
  })

  it('Central・Pacificはイベント名簿の見出しにマップされる', () => {
    expect(NPB_TEAM_MAP.Central).toBe('セントラル・リーグ')
    expect(NPB_TEAM_MAP.Pacific).toBe('パシフィック・リーグ')
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

describe('オールスターのチームコードと試合種別', () => {
  it('cl と pl を既存のリーグプリセットにマップする', () => {
    expect(NPB_CODE_TO_TEAM_MAP.cl).toBe('Central')
    expect(NPB_CODE_TO_TEAM_MAP.pl).toBe('Pacific')
  })

  it('試合見出しからフレッシュオールスターを判別する', () => {
    const html = `
      <nav><a href="/freshas/">フレッシュオールスター・ゲーム</a></nav>
      <main><h3>【フレッシュオールスターゲーム】 セントラル・リーグ vs パシフィック・リーグ</h3></main>
    `
    expect(detectNpbAllStarType(html)).toBe('freshas')
  })

  it('共通ナビにフレッシュへのリンクがあっても通常オールスターと判別する', () => {
    const html = `
      <nav><a href="/freshas/">フレッシュオールスター・ゲーム</a></nav>
      <main><h3>【マイナビオールスターゲーム】 セントラル・リーグ vs パシフィック・リーグ</h3></main>
    `
    expect(detectNpbAllStarType(html)).toBe('allstar')
  })

  it('オールスター以外の試合は null を返す', () => {
    const html = '<main><h3>【JERA セ・リーグ公式戦】 読売ジャイアンツ vs 広島東洋カープ</h3></main>'
    expect(detectNpbAllStarType(html)).toBeNull()
  })
})

describe('parseNpbEventRosterHtml', () => {
  const html = `
    <div class="player_wrap">
      <div class="half_left">
        <h5><span>セントラル・リーグ選抜</span></h5>
        <table>
          <tr><th class="position">監督</th></tr>
          <tr><td class="name">監督 太郎</td><td class="num">74</td></tr>
          <tr><th class="position">先発投手</th></tr>
          <tr><td class="name">投手 一郎</td><td class="num">019</td></tr>
          <tr class="absence"><td class="name">辞退 投手</td><td class="num">99</td></tr>
          <tr><th class="position">捕手</th></tr>
          <tr><td class="name">捕手 二郎</td><td class="number">27</td></tr>
          <tr><th class="position">内野手</th></tr>
          <tr><td class="name">内野 三郎</td><td class="number">3</td></tr>
          <tr><th class="position">外野手</th></tr>
          <tr><td class="name">外野 四郎</td><td class="number">8</td></tr>
        </table>
      </div>
      <div class="half_right">
        <h5><span>パシフィック・リーグ</span></h5>
        <table>
          <tr><th class="position">投手</th></tr>
          <tr><td class="name">パ 投手</td><td class="number">11</td></tr>
        </table>
      </div>
    </div>
  `

  it('通常・フレッシュ両方の name と number/num 列から選手を抽出する', () => {
    const result = parseNpbEventRosterHtml(html, 'セントラル・リーグ')
    expect(result).toEqual([
      { positionCategory: '投手', number: '019', name: '投手 一郎' },
      { positionCategory: '捕手', number: '27', name: '捕手 二郎' },
      { positionCategory: '内野手', number: '3', name: '内野 三郎' },
      { positionCategory: '外野手', number: '8', name: '外野 四郎' },
    ])
  })

  it('指定したリーグのセクションだけを抽出する', () => {
    expect(parseNpbEventRosterHtml(html, 'パシフィック・リーグ')).toEqual([
      { positionCategory: '投手', number: '11', name: 'パ 投手' },
    ])
  })
})

describe('提供された2026年オールスターHTML', () => {
  it('フレッシュオールスターのスコアページを判別できる', () => {
    expect(detectNpbAllStarType(freshAllStarScoreHtml)).toBe('freshas')
  })

  it('通常オールスター出場者ページから両リーグの選手を抽出できる', () => {
    const central = parseNpbEventRosterHtml(allStarRosterHtml, 'セントラル・リーグ')
    const pacific = parseNpbEventRosterHtml(allStarRosterHtml, 'パシフィック・リーグ')

    expect(central.length).toBeGreaterThan(10)
    expect(pacific.length).toBeGreaterThan(10)
    expect(central).toContainEqual(expect.objectContaining({ number: '26', name: '山野 太一' }))
  })

  it('フレッシュ出場者ページの num 列から両リーグの選手を抽出できる', () => {
    const central = parseNpbEventRosterHtml(freshAllStarRosterHtml, 'セントラル・リーグ')
    const pacific = parseNpbEventRosterHtml(freshAllStarRosterHtml, 'パシフィック・リーグ')

    expect(central.length).toBeGreaterThan(10)
    expect(pacific.length).toBeGreaterThan(10)
    expect(central).toContainEqual(expect.objectContaining({ number: '019', name: '園田 純規' }))
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
    const result = await fetchNpbRoster('Central')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('パシフィックはfetchせず空配列を返す', async () => {
    const result = await fetchNpbRoster('Pacific')
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('フレッシュオールスターはスコアページを判別して freshas の名簿を取得する', async () => {
    const scoreHtml = '<h3>【フレッシュオールスターゲーム】 セントラル・リーグ vs パシフィック・リーグ</h3>'
    const rosterHtml = `
      <div class="half_left">
        <h5>セントラル・リーグ選抜</h5>
        <table>
          <tr><th class="position">投手</th></tr>
          <tr><td class="name">園田 純規</td><td class="num">019</td></tr>
        </table>
      </div>
    `
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => scoreHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response)

    const result = await fetchNpbRoster('Central', 'https://npb.jp/scores/2026/0727/cl-pl-01/')

    expect(result).toEqual([
      { positionCategory: '投手', number: '019', name: '園田 純規' },
    ])
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('/api/npb-event/freshas/2026/roster.html')
  })

  it('通常オールスターは allstar の名簿を取得する', async () => {
    const scoreHtml = '<h3>【マイナビオールスターゲーム】 セントラル・リーグ vs パシフィック・リーグ</h3>'
    const rosterHtml = `
      <div class="half_right">
        <h5>パシフィック・リーグ</h5>
        <table>
          <tr><th class="position">外野手</th></tr>
          <tr><td class="name">周東 佑京</td><td class="number">23</td></tr>
        </table>
      </div>
    `
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => scoreHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response)

    const result = await fetchNpbRoster('Pacific', 'https://npb.jp/scores/2026/0729/cl-pl-01/')

    expect(result).toEqual([
      { positionCategory: '外野手', number: '23', name: '周東 佑京' },
    ])
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('/api/npb-event/allstar/2026/roster.html')
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
// 投打左右（Handedness）
// ─────────────────────────────────────────────

describe('parseNpbBattingHtml – batHand', () => {
  it('半角 * 付きは左打ち（L）として検出される', () => {
    const row: BattingRow = ['*秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.278', '.405', '.330']
    const html = makeBattingHtml([row])
    const stats = parseNpbBattingHtml(html).get('秋山翔吾')
    expect(stats?.batHand).toBe('L')
  })

  it('全角 ＊ 付きも左打ち（L）として検出される', () => {
    const row: BattingRow = ['＊小園 海斗', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.291', '.415', '.340']
    const html = makeBattingHtml([row])
    const stats = parseNpbBattingHtml(html).get('小園海斗')
    expect(stats?.batHand).toBe('L')
  })

  it('* なし選手は右打ち（R）として検出される', () => {
    const row: BattingRow = ['坂倉 将吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.288', '.438', '.350']
    const html = makeBattingHtml([row])
    const stats = parseNpbBattingHtml(html).get('坂倉将吾')
    expect(stats?.batHand).toBe('R')
  })

  it('左打ちと右打ちが混在する場合も個別に正しく判定される', () => {
    const rows: BattingRow[] = [
      ['*秋山 翔吾', '143', '620', '560', '95', '173', '32', '5', '3', '225', '25', '20', '5', '3', '4', '55', '3', '2', '80', '8', '.278', '.405', '.330'],
      ['坂倉 将吾', '130', '500', '450', '60', '130', '20', '3', '10', '196', '50', '5', '2', '1', '3', '48', '2', '1', '90', '10', '.288', '.436', '.360'],
    ]
    const html = makeBattingHtml(rows)
    const map = parseNpbBattingHtml(html)
    expect(map.get('秋山翔吾')?.batHand).toBe('L')
    expect(map.get('坂倉将吾')?.batHand).toBe('R')
  })

  it('半角 + 付きはスイッチヒッター（S）として検出される', () => {
    const row: BattingRow = ['+平川 蓮', '100', '350', '320', '40', '90', '15', '2', '5', '129', '30', '10', '3', '5', '2', '30', '2', '1', '60', '5', '.281', '.403', '.320']
    const html = makeBattingHtml([row])
    const stats = parseNpbBattingHtml(html).get('平川蓮')
    expect(stats).toBeDefined()
    expect(stats?.batHand).toBe('S')
  })

  it('全角 ＋ 付きもスイッチヒッター（S）として検出される', () => {
    const row: BattingRow = ['＋平川 蓮', '100', '350', '320', '40', '90', '15', '2', '5', '129', '30', '10', '3', '5', '2', '30', '2', '1', '60', '5', '.281', '.403', '.320']
    const html = makeBattingHtml([row])
    const stats = parseNpbBattingHtml(html).get('平川蓮')
    expect(stats).toBeDefined()
    expect(stats?.batHand).toBe('S')
  })

  it('+ 付き選手名のキーから + が除去されている', () => {
    const row: BattingRow = ['+平川 蓮', '100', '350', '320', '40', '90', '15', '2', '5', '129', '30', '10', '3', '5', '2', '30', '2', '1', '60', '5', '.281', '.403', '.320']
    const html = makeBattingHtml([row])
    const map = parseNpbBattingHtml(html)
    expect(map.has('平川蓮')).toBe(true)
    expect(map.has('+平川蓮')).toBe(false)
  })
})

describe('parseNpbPitchingHtml – throwHand', () => {
  it('半角 * 付きは左投げ（L）として検出される', () => {
    const html = makePitchingHtml([['*床田 寛樹', '20', '8', '6']])
    const stats = parseNpbPitchingHtml(html).get('床田寛樹')
    expect(stats?.throwHand).toBe('L')
  })

  it('全角 ＊ 付きも左投げ（L）として検出される', () => {
    const trs = '<tr><td>＊森浦 大輔</td><td>40</td><td>2</td><td>2</td></tr>'
    const html = `<html><body>
      <table>
        <thead><tr><th>選手</th><th>登板</th><th>勝利</th><th>敗北</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </body></html>`
    const stats = parseNpbPitchingHtml(html).get('森浦大輔')
    expect(stats?.throwHand).toBe('L')
  })

  it('* なし選手は右投げ（R）として検出される', () => {
    const html = makePitchingHtml([['森下 暢仁', '22', '10', '5']])
    const stats = parseNpbPitchingHtml(html).get('森下暢仁')
    expect(stats?.throwHand).toBe('R')
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

  it('投手にも打撃成績がマージされる', async () => {
    const battingHtml = makeBattingHtml([['森下 暢仁', '10', '20', '18', '1', '3', '1', '0', '0', '4', '2', '0', '0', '2', '0', '0', '0', '0', '8', '0', '.167', '.222', '.167']])
    const pitchingHtml = makePitchingHtml([['森下 暢仁', '10', '5', '3']])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbStats('広島', pitcherPlayers)
    // 投手成績
    expect(result[0]?.appearances).toBe('10')
    expect(result[0]?.record).toBe('5勝3敗')
    // 打撃成績も含まれる
    expect(result[0]?.battingAvg).toBe('.167')
    expect(result[0]?.homeRuns).toBe('0')
    expect(result[0]?.rbi).toBe('2')
  })

  it('投手に打撃成績がない場合は投手成績のみ', async () => {
    const battingHtml = makeBattingHtml([])
    const pitchingHtml = makePitchingHtml([['森下 暢仁', '10', '5', '3']])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => battingHtml } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => pitchingHtml } as Response)

    const result = await fetchNpbStats('広島', pitcherPlayers)
    expect(result[0]?.appearances).toBe('10')
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

// ─────────────────────────────────────────────
// parseScorePageLineup
// ─────────────────────────────────────────────

/** スコアページ風HTMLを生成するヘルパー */
function makeScoreHtml(
  left: [number, string, string][],
  right: [number, string, string][],
): string {
  const makeTable = (entries: [number, string, string][]) => {
    const rows = entries
      .map(([order, pos, name]) => `<tr><th>${order}</th><th>${pos}</th><td><a>${name}</a></td></tr>`)
      .join('\n')
    return `<table>${rows}</table>`
  }
  return `<html><body>
    <div id="player-order">
      <div class="half_left">${makeTable(left)}</div>
      <div class="half_right">${makeTable(right)}</div>
    </div>
  </body></html>`
}

describe('parseScorePageLineup', () => {
  it('基本的なラインナップを正しく抽出する', () => {
    const html = makeScoreHtml(
      [[1, '中', '秋山'], [2, '遊', '小園'], [3, '投', '森下']],
      [[1, '左', '柳田'], [2, '指', '近藤']],
    )
    const [away, home] = parseScorePageLineup(html)
    expect(away).toHaveLength(3)
    expect(away[0]).toEqual({ order: 1, position: '中', name: '秋山' })
    expect(away[1]).toEqual({ order: 2, position: '遊', name: '小園' })
    expect(away[2]).toEqual({ order: 3, position: '投', name: '森下' })
    expect(home).toHaveLength(2)
    expect(home[0]).toEqual({ order: 1, position: '左', name: '柳田' })
    expect(home[1]).toEqual({ order: 2, position: 'DH', name: '近藤' })
  })

  it('代打「打」を代打として認識し打順を差し替える', () => {
    const html = makeScoreHtml(
      [
        [1, '中', '秋山'],
        [9, '右', '田村'],
        [9, '打', '松本'],  // 代打
      ],
      [],
    )
    const [away] = parseScorePageLineup(html)
    // 同じ打順の最後のエントリが有効
    const order9 = away.filter((e) => e.order === 9)
    expect(order9).toHaveLength(1)
    expect(order9[0]).toEqual({ order: 9, position: '代', name: '松本' })
  })

  it('代走「走」を代走として認識し打順を差し替える', () => {
    const html = makeScoreHtml(
      [
        [5, '一', 'マクブルーム'],
        [5, '走', '曽根'],  // 代走
      ],
      [],
    )
    const [away] = parseScorePageLineup(html)
    const order5 = away.filter((e) => e.order === 5)
    expect(order5).toHaveLength(1)
    expect(order5[0]).toEqual({ order: 5, position: '代', name: '曽根' })
  })

  it('指名打者「指」はDHにマップされる', () => {
    const html = makeScoreHtml(
      [[1, '指', '近藤']],
      [],
    )
    const [away] = parseScorePageLineup(html)
    expect(away[0]).toEqual({ order: 1, position: 'DH', name: '近藤' })
  })

  it('DH制の空打順に記載された投手を10番目として抽出する', () => {
    const html = `<html><body>
      <div id="player-order">
        <div class="half_left">
          <table>
            <tr><th>5</th><th>DH</th><td>櫻井</td></tr>
            <tr><th>&nbsp;</th><th>投</th><td>杉山</td></tr>
          </table>
        </div>
        <div class="half_right">
          <table>
            <tr><th>4</th><th>DH</th><td>佐々木</td></tr>
            <tr><th>&nbsp;</th><th>投</th><td>齊藤汰</td></tr>
          </table>
        </div>
      </div>
    </body></html>`

    const [away, home] = parseScorePageLineup(html)

    expect(away).toContainEqual({ order: 10, position: '投', name: '杉山' })
    expect(home).toContainEqual({ order: 10, position: '投', name: '齊藤汰' })
  })

  it('複数回の代打がある場合、最終的な選手のみ残る', () => {
    const html = makeScoreHtml(
      [
        [9, '右', '田村'],
        [9, '打', '松本'],
        [9, '打', '堂林'],  // 2回目の代打
      ],
      [],
    )
    const [away] = parseScorePageLineup(html)
    const order9 = away.filter((e) => e.order === 9)
    expect(order9).toHaveLength(1)
    expect(order9[0]).toEqual({ order: 9, position: '代', name: '堂林' })
  })

  it('player-orderがない場合は空配列', () => {
    const html = '<html><body><div>no order</div></body></html>'
    const [away, home] = parseScorePageLineup(html)
    expect(away).toHaveLength(0)
    expect(home).toHaveLength(0)
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

// ─────────────────────────────────────────────
// parseNpbGameRosterHtml
// ─────────────────────────────────────────────

/** 試合ベンチ入り選手ページのHTMLを生成するヘルパー */
function makeGameRosterHtml(teams: { name: string; players: { num: string; abbr: string; hand: string }[] }[]): string {
  const sections = teams.map(({ name, players }) => {
    const rows = players.map(({ num, abbr, hand }) =>
      `<tr><td class="num">${num}</td><td><a href="#">${abbr}</a></td><td class="w4">${hand}</td></tr>`
    ).join('\n')
    return `
      <div class="roster_section">
        <h5>${name}</h5>
        <table>
          <tbody>
            <tr><th colspan="3">投手</th></tr>
            ${rows}
          </tbody>
        </table>
      </div>`
  }).join('\n')
  return `<html><body><div class="wrap">${sections}</div></body></html>`
}

describe('parseNpbGameRosterHtml', () => {
  it('指定チームの背番号セットを返す', () => {
    const html = makeGameRosterHtml([
      { name: '中日ドラゴンズ', players: [{ num: '13', abbr: '橋本', hand: '左投左打' }, { num: '21', abbr: '金丸', hand: '左投左打' }] },
      { name: '読売ジャイアンツ', players: [{ num: '17', abbr: '西舘', hand: '右投右打' }] },
    ])
    const nums = parseNpbGameRosterHtml(html, '中日')
    expect(nums.size).toBe(2)
    expect(nums.has('13')).toBe(true)
    expect(nums.has('21')).toBe(true)
    expect(nums.has('17')).toBe(false)
  })

  it('チームが見つからない場合は空セットを返す', () => {
    const html = makeGameRosterHtml([
      { name: '中日ドラゴンズ', players: [{ num: '13', abbr: '橋本', hand: '左投左打' }] },
    ])
    const nums = parseNpbGameRosterHtml(html, '広島')
    expect(nums.size).toBe(0)
  })

  it('00番・0番など特殊背番号も正しく取得する', () => {
    const html = makeGameRosterHtml([
      { name: '広島東洋カープ', players: [{ num: '00', abbr: '勝田', hand: '右投右打' }, { num: '0', abbr: '勝田', hand: '右投右打' }] },
    ])
    const nums = parseNpbGameRosterHtml(html, '広島')
    expect(nums.has('00')).toBe(true)
    expect(nums.has('0')).toBe(true)
  })

  it('teamNameKeyword はh5内容の部分一致で照合される', () => {
    const html = makeGameRosterHtml([
      { name: '読売ジャイアンツ', players: [{ num: '6', abbr: '坂本', hand: '右投右打' }] },
    ])
    // NPB_TEAM_MAP['巨人'] === '読売ジャイアンツ'
    const nums = parseNpbGameRosterHtml(html, '読売ジャイアンツ')
    expect(nums.has('6')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// fetchNpbRoster – scoreUrl でフィルタリング
// ─────────────────────────────────────────────

describe('fetchNpbRoster – scoreUrl フィルタリング', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  const rosterHtml = makeHtml('広島東洋カープ', [
    ['投手', '19', '床田　寛樹'],
    ['投手', '20', '栗林　良吏'],
    ['捕手', '31', '坂倉　将吾'],
    ['内野手', '5', '小園　海斗'],
  ])

  it('scoreUrl指定時は試合rosterに含まれる選手のみ返す', async () => {
    const gameRosterHtml = makeGameRosterHtml([
      { name: '広島東洋カープ', players: [
        { num: '19', abbr: '床田', hand: '左投左打' },
        { num: '31', abbr: '坂倉', hand: '右投右打' },
      ]},
    ])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response) // 公示roster
      .mockResolvedValueOnce({ ok: true, text: async () => gameRosterHtml } as Response) // 試合roster
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // batting stats
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // pitching stats

    const result = await fetchNpbRoster('広島', 'https://npb.jp/scores/2026/0405/c-t-03/')
    const numbers = result.map((p) => p.number)
    expect(numbers).toContain('19')
    expect(numbers).toContain('31')
    expect(numbers).not.toContain('20')
    expect(numbers).not.toContain('5')
  })

  it('scoreUrl未指定時は公示rosterを全員返す', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response) // 公示roster
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // batting stats
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // pitching stats

    const result = await fetchNpbRoster('広島')
    expect(result).toHaveLength(4)
  })

  it('試合roster取得失敗時は公示rosterをそのまま返す', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response) // 公示roster
      .mockRejectedValueOnce(new Error('Network Error')) // 試合roster失敗
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // batting stats
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // pitching stats

    const result = await fetchNpbRoster('広島', 'https://npb.jp/scores/2026/0405/c-t-03/')
    expect(result).toHaveLength(4)
  })

  it('試合rosterがHTTPエラー時は公示rosterをそのまま返す', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response) // 公示roster
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // 試合roster HTTP error
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // batting stats
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // pitching stats

    const result = await fetchNpbRoster('広島', 'https://npb.jp/scores/2026/0405/c-t-03/')
    expect(result).toHaveLength(4)
  })

  it('試合rosterの背番号セットが空の場合は公示rosterをそのまま返す', async () => {
    const emptyGameRosterHtml = makeGameRosterHtml([
      { name: '阪神タイガース', players: [{ num: '1', abbr: '近本', hand: '右投左打' }] },
    ])
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, text: async () => rosterHtml } as Response) // 公示roster
      .mockResolvedValueOnce({ ok: true, text: async () => emptyGameRosterHtml } as Response) // 試合roster（広島なし）
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // batting stats
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // pitching stats

    const result = await fetchNpbRoster('広島', 'https://npb.jp/scores/2026/0405/c-t-03/')
    expect(result).toHaveLength(4)
  })
})
