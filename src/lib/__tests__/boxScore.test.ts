import { describe, it, expect } from 'vitest'
import { buildBoxScoreUrl, normalizeResultText, classifyResult, parseBoxScoreHtml } from '../boxScore'

describe('buildBoxScoreUrl', () => {
  it('スコアURLにbox.htmlを付加する', () => {
    expect(buildBoxScoreUrl('https://npb.jp/scores/2026/0718/c-t-14/')).toBe(
      'https://npb.jp/scores/2026/0718/c-t-14/box.html',
    )
  })

  it('末尾スラッシュなしでも動作する', () => {
    expect(buildBoxScoreUrl('https://npb.jp/scores/2026/0718/c-t-14')).toBe(
      'https://npb.jp/scores/2026/0718/c-t-14/box.html',
    )
  })

  it('空文字はnullを返す', () => {
    expect(buildBoxScoreUrl('')).toBeNull()
  })
})

describe('normalizeResultText', () => {
  it('全角スペースを除去する', () => {
    expect(normalizeResultText('四\u3000球')).toBe('四球')
    expect(normalizeResultText('三\u3000振')).toBe('三振')
  })

  it('半角スペースも除去する', () => {
    expect(normalizeResultText('三 振')).toBe('三振')
  })

  it('スペースなしはそのまま返す', () => {
    expect(normalizeResultText('三邪飛')).toBe('三邪飛')
    expect(normalizeResultText('右前安')).toBe('右前安')
    expect(normalizeResultText('投犠打')).toBe('投犠打')
  })
})

describe('classifyResult', () => {
  it('hit Red → hit', () => {
    expect(classifyResult(' hit Red')).toBe('hit')
    expect(classifyResult(' hit Red rbi')).toBe('hit')
  })

  it('walk Blue → walk', () => {
    expect(classifyResult(' walk Blue')).toBe('walk')
  })

  it('Green → sacrifice', () => {
    expect(classifyResult(' Green')).toBe('sacrifice')
    expect(classifyResult(' Green rbi')).toBe('sacrifice')
  })

  it('空クラス・rbiのみ → out', () => {
    expect(classifyResult('')).toBe('out')
    expect(classifyResult(' rbi')).toBe('out')
  })
})

// テスト用のミニマルなbox.html HTMLを生成するヘルパー
function makeBoxHtml(
  awayRows: Array<{ order: string; name: string; cells: Array<{ cls: string; text: string }> }>,
  homeRows: Array<{ order: string; name: string; cells: Array<{ cls: string; text: string }> }>,
): string {
  const toTr = (r: (typeof awayRows)[0]) => {
    const innCells = r.cells
      .map((c) => `<td class="${c.cls}">${c.text}</td>`)
      .join('')
    return `<tr>
      <td>${r.order}</td>
      <td>(中)</td>
      <td class="player"><a>${r.name}</a></td>
      <td>3</td><td>0</td><td>1</td><td>0</td><td>0</td>
      ${innCells}
    </tr>`
  }
  const awayTbody = awayRows.map(toTr).join('\n')
  const homeTbody = homeRows.map(toTr).join('\n')
  return `<html><body>
    <div id="table_top_b"><table id="tablefix_t_b"><tbody>${awayTbody}</tbody></table></div>
    <div id="table_bottom_b"><table id="tablefix_b_b"><tbody>${homeTbody}</tbody></table></div>
  </body></html>`
}

describe('parseBoxScoreHtml', () => {
  it('打順番号のある打者の結果を取得する', () => {
    const html = makeBoxHtml(
      [
        {
          order: '1',
          name: '近本',
          cells: [
            { cls: '', text: '三邪飛' },
            { cls: '-', text: '-' },
            { cls: ' hit Red', text: '右前安' },
          ],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away).toHaveLength(1)
    expect(result.away[0]!.order).toBe(1)
    expect(result.away[0]!.name).toBe('近本')
    expect(result.away[0]!.results).toHaveLength(2)
    expect(result.away[0]!.results[0]).toEqual({ text: '三邪飛', type: 'out' })
    expect(result.away[0]!.results[1]).toEqual({ text: '右前安', type: 'hit' })
  })

  it('打順番号がない行でも打席結果がある代打・打者交代は直前の打順番号で含まれる', () => {
    const html = makeBoxHtml(
      [
        {
          order: '1',
          name: '近本',
          cells: [{ cls: '', text: '三邪飛' }],
        },
        {
          order: '',
          name: '代打選手',
          cells: [{ cls: ' hit Red', text: '右前安' }],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away).toHaveLength(2)
    expect(result.away[0]!.name).toBe('近本')
    expect(result.away[1]!.name).toBe('代打選手')
    expect(result.away[1]!.order).toBe(1)
    expect(result.away[1]!.results[0]).toEqual({ text: '右前安', type: 'hit' })
  })

  it('打順番号がなく打席結果もない行（投手交代等）はスキップされる', () => {
    const html = makeBoxHtml(
      [
        {
          order: '9',
          name: '床田',
          cells: [{ cls: '', text: '三振' }],
        },
        {
          order: '',
          name: '辻',
          cells: [],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away).toHaveLength(1)
    expect(result.away[0]!.name).toBe('床田')
  })

  it('全角スペースを含む結果テキストを正規化する', () => {
    const html = makeBoxHtml(
      [
        {
          order: '1',
          name: '大山',
          cells: [{ cls: ' walk Blue', text: '四\u3000球' }],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away[0]!.results[0]!.text).toBe('四球')
  })

  it('四死球はwalkに分類される', () => {
    const html = makeBoxHtml(
      [
        {
          order: '1',
          name: '選手A',
          cells: [
            { cls: ' walk Blue', text: '四\u3000球' },
            { cls: ' walk Blue', text: '死\u3000球' },
          ],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away[0]!.results[0]!.type).toBe('walk')
    expect(result.away[0]!.results[1]!.type).toBe('walk')
  })

  it('犠打・犠飛はsacrificeに分類される', () => {
    const html = makeBoxHtml(
      [
        {
          order: '1',
          name: '選手B',
          cells: [
            { cls: ' Green', text: '投犠打' },
            { cls: ' Green rbi', text: '右犠飛①' },
          ],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away[0]!.results[0]!.type).toBe('sacrifice')
    expect(result.away[0]!.results[1]!.type).toBe('sacrifice')
  })

  it('ホームチームの結果も取得できる', () => {
    const html = makeBoxHtml(
      [],
      [
        {
          order: '3',
          name: '坂倉',
          cells: [
            { cls: ' hit Red', text: '左越本①' },
          ],
        },
      ],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.home).toHaveLength(1)
    expect(result.home[0]!.order).toBe(3)
    expect(result.home[0]!.name).toBe('坂倉')
    expect(result.home[0]!.results[0]!.type).toBe('hit')
  })

  it('テーブルが存在しない場合は空配列を返す', () => {
    const result = parseBoxScoreHtml('<html><body></body></html>')
    expect(result.away).toHaveLength(0)
    expect(result.home).toHaveLength(0)
  })

  it('打者交代（岸田→大城）のケースで大城の成績が含まれる', () => {
    const html = makeBoxHtml(
      [],
      [
        {
          order: '3',
          name: '岸田',
          cells: [{ cls: '', text: '遊ゴロ' }],
        },
        {
          order: '',
          name: '大城',
          cells: [
            { cls: ' hit Red', text: '右前安' },
            { cls: ' hit Red', text: '右前安' },
            { cls: '', text: '三振' },
          ],
        },
      ],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.home).toHaveLength(2)
    expect(result.home[0]!.name).toBe('岸田')
    expect(result.home[0]!.order).toBe(3)
    expect(result.home[1]!.name).toBe('大城')
    expect(result.home[1]!.order).toBe(3)
    expect(result.home[1]!.results).toHaveLength(3)
    expect(result.home[1]!.results[0]).toEqual({ text: '右前安', type: 'hit' })
  })

  it('複数回の選手交代でも各選手の成績が正しく登録される', () => {
    const html = makeBoxHtml(
      [
        {
          order: '9',
          name: '床田',
          cells: [
            { cls: '', text: '三飛' },
            { cls: '', text: '三振' },
          ],
        },
        {
          order: '',
          name: '前川',
          cells: [{ cls: ' walk Blue', text: '四球' }],
        },
        {
          order: '',
          name: '辻',
          cells: [],
        },
      ],
      [],
    )
    const result = parseBoxScoreHtml(html)
    expect(result.away).toHaveLength(2)
    expect(result.away[0]!.name).toBe('床田')
    expect(result.away[1]!.name).toBe('前川')
    expect(result.away[1]!.order).toBe(9)
    expect(result.away[1]!.results[0]).toEqual({ text: '四球', type: 'walk' })
  })
})
