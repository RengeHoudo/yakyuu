import { describe, expect, it } from 'vitest'
import { parseRosterCsv } from '../csvImport'

// ─────────────────────────────────────────────
// parseRosterCsv — 正常系
// ─────────────────────────────────────────────

describe('parseRosterCsv 正常系', () => {
  it('ヘッダーありCSVをパースできる', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS
投手,18,森下 暢仁,,,,
捕手,31,坂倉 将吾,.288,16,62,.838`
    const result = parseRosterCsv(csv)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      positionCategory: '投手',
      number: '18',
      name: '森下 暢仁',
    })
    expect(result[1]).toMatchObject({
      positionCategory: '捕手',
      number: '31',
      name: '坂倉 将吾',
      battingAvg: '.288',
      homeRuns: '16',
      rbi: '62',
      ops: '.838',
    })
  })

  it('ヘッダーなし（1列目が有効カテゴリ）でもパースできる', () => {
    const csv = `内野手,51,小園 海斗,.291,14,58,.815`
    const result = parseRosterCsv(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('小園 海斗')
  })

  it('打率・HR・打点・OPSが空の場合 undefined になる', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS
投手,14,大瀬良 大地,,,,`
    const result = parseRosterCsv(csv)
    expect(result[0]!.battingAvg).toBeUndefined()
    expect(result[0]!.homeRuns).toBeUndefined()
    expect(result[0]!.rbi).toBeUndefined()
    expect(result[0]!.ops).toBeUndefined()
  })

  it('打率・HR・打点・OPSが省略（列自体ない）の場合 undefined になる', () => {
    const csv = `守備位置,背番号,名前
外野手,55,秋山 翔吾`
    const result = parseRosterCsv(csv)
    expect(result[0]!.battingAvg).toBeUndefined()
    expect(result[0]!.ops).toBeUndefined()
  })

  it('4種すべての守備位置カテゴリを受け付ける', () => {
    const csv = `守備位置,背番号,名前
投手,1,A投手
捕手,2,B捕手
内野手,3,C内野手
外野手,4,D外野手`
    const result = parseRosterCsv(csv)
    expect(result.map((r) => r.positionCategory)).toEqual(['投手', '捕手', '内野手', '外野手'])
  })

  it('CRLF改行でもパースできる', () => {
    const csv = '守備位置,背番号,名前\r\n外野手,37,野間 峻祥'
    const result = parseRosterCsv(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('野間 峻祥')
  })
})

// ─────────────────────────────────────────────
// parseRosterCsv — 名前正規化
// ─────────────────────────────────────────────

describe('parseRosterCsv 名前正規化', () => {
  it('全角スペースを半角スペースに変換する', () => {
    const csv = `内野手,42,マクブルーム　ライアン`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('マクブルーム ライアン')
  })

  it('連続スペースを1つに圧縮する', () => {
    const csv = `外野手,55,秋山  翔吾`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('秋山 翔吾')
  })

  it('全角英字を半角に変換したあと先頭のアルファベット+ピリオドを除去する（例: Ｓ.ビシエド）', () => {
    const csv = `内野手,32,Ｓ.ビシエド`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('ビシエド')
  })

  it('全角ピリオド・ドットを半角に変換したあとアルファベット+ピリオドを除去する', () => {
    const csv = `内野手,99,Ａ．スミス`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('スミス')
  })

  it('先頭・末尾の空白をトリムする', () => {
    const csv = `外野手,10, 田中　選手 `
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('田中 選手')
  })

  it('先頭が半角アルファベット+ピリオドの名前を除去する（E.モンテロ → モンテロ）', () => {
    const csv = `外野手,53,E.モンテロ`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('モンテロ')
  })

  it('複数文字のアルファベット+ピリオドも除去する（JD.マルティネス → マルティネス）', () => {
    const csv = `外野手,28,JD.マルティネス`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('マルティネス')
  })

  it('ピリオドがなければそのまま（純粋なカタカナ名）', () => {
    const csv = `外野手,99,マクブルーム`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('マクブルーム')
  })

  it('日本語氏名はそのまま（アルファベット除去対象外）', () => {
    const csv = `内野手,51,小園 海斗`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('小園 海斗')
  })

  it('先頭の半角 * を除去する（左打・左右打のマーク）', () => {
    const csv = `外野手,55,*秋山 翔吾`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('秋山 翔吾')
  })

  it('全角 ＊ も除去する', () => {
    const csv = `内野手,3,＊小園 海斗`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('小園 海斗')
  })

  it('* + アルファベットピリオドの両方がある場合も正しく除去する', () => {
    const csv = `内野手,44,*B.コルデロ`
    const result = parseRosterCsv(csv)
    expect(result[0]!.name).toBe('コルデロ')
  })
})

// ─────────────────────────────────────────────
// parseRosterCsv — 異常系
// ─────────────────────────────────────────────

describe('parseRosterCsv 異常系', () => {
  it('空文字列を渡すと "CSVが空です" エラーを投げる', () => {
    expect(() => parseRosterCsv('')).toThrow('CSVが空です')
  })

  it('ヘッダー行のみで有効データなし場合 "有効な選手データがありません" エラーを投げる', () => {
    const csv = `守備位置,背番号,名前`
    expect(() => parseRosterCsv(csv)).toThrow('有効な選手データがありません')
  })

  it('無効な守備位置カテゴリの行はスキップされる', () => {
    const csv = `守備位置,背番号,名前
外野手,55,秋山 翔吾
コーチ,999,謎の人`
    const result = parseRosterCsv(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('秋山 翔吾')
  })

  it('名前が空の行はスキップされる', () => {
    const csv = `内野手,51,`
    expect(() => parseRosterCsv(csv)).toThrow('有効な選手データがありません')
  })

  it('全行が無効でも "有効な選手データがありません" エラーを投げる', () => {
    const csv = `守備位置,背番号,名前
コーチ,1,田中`
    expect(() => parseRosterCsv(csv)).toThrow('有効な選手データがありません')
  })
})
