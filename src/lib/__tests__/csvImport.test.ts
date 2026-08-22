import { describe, expect, it } from 'vitest'
import { parseLineupCsv, parseRosterCsv } from '../csvImport'

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

// ─────────────────────────────────────────────
// parseLineupCsv — 投手列拡張 (F1)
// ─────────────────────────────────────────────

describe('parseLineupCsv \u2013 \u6295\u624b\u5217\u62e1\u5f35 (F1)', () => {
  it('10行目に saves, holds, era が含まれる', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,セーブ,ホールド,防御率
10,森下,18,投,,,,,,5勝3敗,20,10,2.45`
    const result = parseLineupCsv(csv)
    const pitcher = result.find((p) => p.order === 10)
    expect(pitcher?.saves).toBe('20')
    expect(pitcher?.holds).toBe('10')
    expect(pitcher?.era).toBe('2.45')
  })

  it('勝敗列から wins/losses が分離される', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,セーブ,ホールド,防御率
10,森下,18,投,,,,,,5勝3敗,,,`
    const result = parseLineupCsv(csv)
    const pitcher = result.find((p) => p.order === 10)
    expect(pitcher?.wins).toBe('5')
    expect(pitcher?.losses).toBe('3')
  })

  it('投手列が空でも正常動作', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,セーブ,ホールド,防御率
10,森下,18,投,,,,,,,,, `
    const result = parseLineupCsv(csv)
    const pitcher = result.find((p) => p.order === 10)
    expect(pitcher?.saves).toBeUndefined()
    expect(pitcher?.holds).toBeUndefined()
    expect(pitcher?.era).toBeUndefined()
  })

  it('既存の野手行フォーマットに影響しない', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,セーブ,ホールド,防御率
1,秋山,55,左,.278,4,28,.735,,,,, `
    const result = parseLineupCsv(csv)
    const batter = result.find((p) => p.order === 1)
    expect(batter?.battingAvg).toBe('.278')
    expect(batter?.homeRuns).toBe('4')
    expect(batter?.rbi).toBe('28')
    expect(batter?.ops).toBe('.735')
  })
})

// ─────────────────────────────────────────────
// parseLineupCsv — 投打左右
// ─────────────────────────────────────────────

describe('parseLineupCsv handedness', () => {
  it('投・打列を打者と投手へ反映する', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,投,打
1,長友 悠成,8,中,,,,,,,右,左
10,長井 心海,18,投,,,,,,,右,右`
    const result = parseLineupCsv(csv)

    expect(result[0]).toMatchObject({
      throwHand: 'R',
      batHand: 'L',
      switchHitter: false,
    })
    expect(result[9]).toMatchObject({
      throwHand: 'R',
      batHand: 'R',
      switchHitter: false,
    })
  })

  it('両打をスイッチヒッターとして反映する', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,投,打
7,川原 一将,6,遊,,,,,,,右,両`
    const result = parseLineupCsv(csv)

    expect(result[6]).toMatchObject({ batHand: 'S', switchHitter: true })
  })

  it('投打列を追加しても投手成績列と衝突しない', () => {
    const csv = `順番,名前,背番号,守備,打率,HR,打点,OPS,登板数,勝敗,セーブ,ホールド,防御率,投,打
10,森下,18,投,,,,,,5勝3敗,20,10,2.45,右,右`
    const result = parseLineupCsv(csv)

    expect(result[9]).toMatchObject({
      wins: '5',
      losses: '3',
      saves: '20',
      holds: '10',
      era: '2.45',
      throwHand: 'R',
      batHand: 'R',
    })
  })

  it('指をDHとして読み込む', () => {
    const csv = `順番,名前,背番号,守備
6,東村 悠晴,14,指`
    const result = parseLineupCsv(csv)

    expect(result[5]!.position).toBe('DH')
  })
})

// ─────────────────────────────────────────────
// parseRosterCsv — 投手カテゴリ列拡張 (F1)
// ─────────────────────────────────────────────

describe('parseRosterCsv \u2013 \u6295\u624b\u30ab\u30c6\u30b4\u30ea\u5217\u62e1\u5f35 (F1)', () => {
  it('投手カテゴリの追加列を読み取る', () => {
    const csv = `守備位置,背番号,名前,登板,勝,敗,セーブ,ホールド,防御率
投手,18,森下 暢仁,22,10,4,20,10,2.45`
    const result = parseRosterCsv(csv)
    expect(result[0]?.appearances).toBe('22')
    expect(result[0]?.wins).toBe('10')
    expect(result[0]?.losses).toBe('4')
    expect(result[0]?.saves).toBe('20')
    expect(result[0]?.holds).toBe('10')
    expect(result[0]?.era).toBe('2.45')
  })

  it('投手以外のカテゴリは従来通り打撃成績', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS
外野手,55,秋山 翔吾,.278,4,28,.735`
    const result = parseRosterCsv(csv)
    expect(result[0]?.battingAvg).toBe('.278')
  })
})

// ─────────────────────────────────────────────
// parseRosterCsv — 投打左右
// ─────────────────────────────────────────────

describe('parseRosterCsv 投打左右', () => {
  it('「投」「打」列から右投げ・左打ちを読み取る', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS,投,打
外野手,55,秋山 翔吾,.278,4,28,.735,右,左`
    const result = parseRosterCsv(csv)
    expect(result[0]?.throwHand).toBe('R')
    expect(result[0]?.batHand).toBe('L')
  })

  it('投手成績の後ろにある「投」「打」列を読み取る', () => {
    const csv = `守備位置,背番号,名前,登板,勝,敗,セーブ,ホールド,防御率,投,打
投手,18,森下 暢仁,22,10,4,0,0,2.45,右,右`
    const result = parseRosterCsv(csv)
    expect(result[0]).toMatchObject({ throwHand: 'R', batHand: 'R' })
  })

  it('従来の名簿ヘッダー末尾に追加した投打列を投手成績として扱わない', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS,投,打
投手,21,左投手,,,,,左,左`
    const result = parseRosterCsv(csv)
    expect(result[0]).toMatchObject({ throwHand: 'L', batHand: 'L' })
    expect(result[0]?.holds).toBeUndefined()
    expect(result[0]?.era).toBeUndefined()
  })

  it('R / L / S 表記と列順の入れ替えに対応する', () => {
    const csv = `守備位置,背番号,名前,打,投,打率,HR,打点,OPS
内野手,0,スイッチ 選手,S,L,.250,1,10,.650`
    const result = parseRosterCsv(csv)
    expect(result[0]).toMatchObject({
      throwHand: 'L',
      batHand: 'S',
      battingAvg: '.250',
      homeRuns: '1',
      rbi: '10',
      ops: '.650',
    })
  })

  it('「投打」列の右投左打を読み取る', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS,投打
外野手,7,テスト 選手,.300,2,15,.750,右投左打`
    const result = parseRosterCsv(csv)
    expect(result[0]).toMatchObject({ throwHand: 'R', batHand: 'L' })
  })

  it('名前先頭の NPB マークから左打ち・両打ちを引き継ぐ', () => {
    const csv = `守備位置,背番号,名前
外野手,55,*秋山 翔吾
内野手,0,+スイッチ 選手`
    const result = parseRosterCsv(csv)
    expect(result[0]).toMatchObject({ name: '秋山 翔吾', batHand: 'L' })
    expect(result[1]).toMatchObject({ name: 'スイッチ 選手', batHand: 'S' })
  })

  it('無効な投打表記は未設定として扱う', () => {
    const csv = `守備位置,背番号,名前,打率,HR,打点,OPS,投,打
捕手,31,坂倉 将吾,.288,16,62,.838,上,下`
    const result = parseRosterCsv(csv)
    expect(result[0]?.throwHand).toBeUndefined()
    expect(result[0]?.batHand).toBeUndefined()
  })
})
