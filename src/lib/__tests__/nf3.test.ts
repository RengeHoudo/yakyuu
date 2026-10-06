import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNf3Cache, fetchNf3BatterStats, parseNf3BatterStats } from '../nf3'

// nf3 のランナー別表と同じ構造。数値はテスト用。
const lines = [
  ['無し', '100', '20'], ['1塁', '20', '8'], ['2塁', '10', '3'], ['3塁', '0', '0'],
  ['1・2塁', '12', '3'], ['1・3塁', '10', '5'], ['2・3塁', '9', '3'], ['満塁', '8', '1'],
  ['得点圏', '49', '15'],
]
function table(rows = lines, title = 'ランナ−別成績') {
  return `<table class="Base_P"><caption><div class="Title">${title}</div></caption>
    <tr class="Index"><th>条件</th><th>打率</th><th>打席</th><th>打数</th><th>安打</th></tr>
    ${rows.map(([label, ab, h]) => `<tr><th>${label}</th><td>-</td><td>999</td><td>${ab}</td><td>${h}</td></tr>`).join('')}
    </table>`
}

describe('nf3 ランナー別成績の解析', () => {
  it('別の表と混同せず8種類の塁状況・得点圏・非得点圏を読み取る', () => {
    const stats = parseNf3BatterStats(table([['得点圏', '1', '1']], '代打成績') + table())
    expect(stats?.risp).toEqual({ average: '.306', atBats: 49, hits: 15 })
    expect(stats?.nonRisp).toEqual({ average: '.233', atBats: 120, hits: 28 })
    expect(Object.keys(stats?.byBaseState ?? {})).toHaveLength(8)
    expect(stats?.byBaseState['1st+3rd']).toEqual({ average: '.500', atBats: 10, hits: 5 })
    expect(stats?.byBaseState['3rd']).toEqual({ average: '.000', atBats: 0, hits: 0 })
  })

  it('列順変更・全角数字に対応し、打席ではなく打数を使う', () => {
    const html = `<table><caption>ランナー別成績</caption>
      <tr><th>条件</th><th>安打</th><th>打席</th><th>打数</th></tr>
      <tr><th>１・３塁</th><td>２</td><td>１２</td><td>８</td></tr></table>`
    expect(parseNf3BatterStats(html)?.byBaseState['1st+3rd']).toEqual({ average: '.250', atBats: 8, hits: 2 })
  })

  it('得点圏行がなければ6種類の塁状況から合算し、不完全なら未取得とする', () => {
    expect(parseNf3BatterStats(table(lines.slice(0, 8)))?.risp?.hits).toBe(15)
    const stats = parseNf3BatterStats(table([['無し', '20', '5'], ['2塁', '-', '-']]))
    expect(stats?.risp).toBeUndefined()
    expect(stats?.nonRisp).toBeUndefined()
    expect(stats?.byBaseState['2nd']).toBeUndefined()
  })

  it('対象の表がないページやヘッダーだけの表をデータありとしない', () => {
    expect(parseNf3BatterStats('<html>メンテナンス中</html>')).toBeNull()
    expect(parseNf3BatterStats(table([]))).toBeNull()
  })
})

describe('nf3 選手成績の取得', () => {
  beforeEach(clearNf3Cache)
  const index = `<base href="https://nf3.sakura.ne.jp/">
    <a href="./Central/C/f/0_stat.htm">勝田成</a>
    <a href="./Central/C/f/00_stat.htm">髙 太一</a>
    <a href="./Central/C/p/0_stat.htm">勝田成</a>`

  it.each([
    ['阪神タイガース', 'T', '0'], ['横浜ＤｅＮＡベイスターズ', 'DB', '0'], ['巨人', 'G', '0'],
    ['中日ドラゴンズ', 'D', '0'], ['広島東洋カープ', 'C', '0'], ['東京ヤクルトスワローズ', 'S', '0'],
    ['福岡ソフトバンクホークス', 'H', '1'], ['北海道日本ハムファイターズ', 'F', '1'],
    ['オリックス・バファローズ', 'B', '1'], ['東北楽天ゴールデンイーグルス', 'E', '1'],
    ['埼玉西武ライオンズ', 'L', '1'], ['千葉ロッテマリーンズ', 'M', '1'],
  ])('12球団の所属名から正しい一覧を選ぶ: %s', async (team, code, league) => {
    const fetchPage = vi.fn().mockResolvedValue(new Response(
      `<a href="./${league === '0' ? 'Central' : 'Pacific'}/${code}/f/1_stat.htm">別選手</a>`,
    ))
    expect(await fetchNf3BatterStats('未登録', team, fetchPage)).toBeNull()
    expect(fetchPage).toHaveBeenCalledWith(`/php/stat_disp/stat_disp.php?y=0&leg=${league}&tm=${code}&fp=0&dn=1&dk=0`)
  })

  it('所属と氏名からリンクを照合し、背番号0を含むページを取得する', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(new Response(index)).mockResolvedValueOnce(new Response(table()))
    const stats = await fetchNf3BatterStats('勝田 成', '広島東洋カープ', fetchPage)
    expect(stats?.risp?.average).toBe('.306')
    expect(fetchPage).toHaveBeenNthCalledWith(1, '/php/stat_disp/stat_disp.php?y=0&leg=0&tm=C&fp=0&dn=1&dk=0')
    expect(fetchPage).toHaveBeenNthCalledWith(2, '/Central/C/f/0_stat.htm')
    await fetchNf3BatterStats('勝田成', '広島', fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('同時取得を共有し、字体を正規化して照合する', async () => {
    const fetchPage = vi.fn().mockImplementation(async (path: string) => new Response(path.includes('php') ? index : table()))
    await Promise.all([
      fetchNf3BatterStats('高 太一', '広島', fetchPage),
      fetchNf3BatterStats('髙太一', '広島', fetchPage),
    ])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenLastCalledWith('/Central/C/f/00_stat.htm')
  })

  it('外部サイト・他球団のリンクや氏名の部分一致は採用しない', async () => {
    const fetchPage = vi.fn().mockResolvedValue(new Response(`<a href="https://example.com/Central/C/f/0_stat.htm">勝田成</a>
      <a href="./Central/G/f/0_stat.htm">勝田成</a><a href="./Central/C/f/0_stat.htm">勝田成二</a>`))
    expect(await fetchNf3BatterStats('勝田成', '広島', fetchPage)).toBeNull()
    expect(fetchPage).toHaveBeenCalledOnce()
    expect(await fetchNf3BatterStats('勝田成', '高校', fetchPage)).toBeNull()
    expect(await fetchNf3BatterStats('', '広島', fetchPage)).toBeNull()
    expect(fetchPage).toHaveBeenCalledOnce()
  })

  it('失敗したページだけを再取得する', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(new Response(index))
      .mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(table()))
    await expect(fetchNf3BatterStats('勝田成', '広島', fetchPage)).rejects.toThrow('503')
    expect((await fetchNf3BatterStats('勝田成', '広島', fetchPage))?.risp).toBeDefined()
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('HTTP200のエラーページも再取得できる', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(new Response(index))
      .mockResolvedValueOnce(new Response('メンテナンス中')).mockResolvedValueOnce(new Response(table()))
    await expect(fetchNf3BatterStats('勝田成', '広島', fetchPage)).rejects.toThrow()
    expect((await fetchNf3BatterStats('勝田成', '広島', fetchPage))?.risp).toBeDefined()
  })
})
