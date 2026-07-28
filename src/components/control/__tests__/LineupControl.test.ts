import { describe, it, expect } from 'vitest'
import { applyScorePageLineup, formatRosterOptionLabel, sortedRoster, rosterPitcherToLineupFields } from '../LineupControl'
import type { LineupPlayer, PositionCategory, RosterPlayer } from '../../../types'

describe('formatRosterOptionLabel', () => {
  it('内野手: 姓 名  [ 番号 ] の形式でフォーマットされる', () => {
    expect(formatRosterOptionLabel('内野手', '菊池 涼介', '33')).toBe('内: 菊池 涼介  [ 33 ]')
  })

  it('投手: 投 prefix でフォーマットされる', () => {
    expect(formatRosterOptionLabel('投手', '大瀬良 大地', '14')).toBe('投: 大瀬良 大地  [ 14 ]')
  })

  it('捕手: 捕 prefix でフォーマットされる', () => {
    expect(formatRosterOptionLabel('捕手', '坂倉 将吾', '27')).toBe('捕: 坂倉 将吾  [ 27 ]')
  })

  it('外野手: 外 prefix でフォーマットされる', () => {
    expect(formatRosterOptionLabel('外野手', '西川 龍馬', '8')).toBe('外: 西川 龍馬  [ 8 ]')
  })

  it('カテゴリと名前の間のスペースは1つ', () => {
    const label = formatRosterOptionLabel('投手', '田中 将大', '18')
    expect(label.startsWith('投: ')).toBe(true)
  })

  it('名前と [ の間のスペースは2つ', () => {
    const label = formatRosterOptionLabel('投手', '田中 将大', '18')
    expect(label).toContain('田中 将大  [ ')
  })

  it('すべてのPositionCategoryに対応する', () => {
    const cats: PositionCategory[] = ['投手', '捕手', '内野手', '外野手']
    const shorts = ['投', '捕', '内', '外']
    for (let i = 0; i < cats.length; i++) {
      const label = formatRosterOptionLabel(cats[i]!, 'テスト 選手', '99')
      expect(label.startsWith(`${shorts[i]}: `)).toBe(true)
    }
  })
})

const makePlayer = (number: string, positionCategory: PositionCategory = '投手'): RosterPlayer => ({
  number,
  name: `選手${number}`,
  positionCategory,
})

describe('sortedRoster', () => {
  it('背番号の数値昇順にソートされる', () => {
    const roster = [makePlayer('33'), makePlayer('8'), makePlayer('14'), makePlayer('3')]
    const result = sortedRoster(roster)
    expect(result.map((r) => r.number)).toEqual(['3', '8', '14', '33'])
  })

  it('異なる守備位置カテゴリが混在しても背番号順になる', () => {
    const roster = [
      makePlayer('33', '内野手'),
      makePlayer('14', '投手'),
      makePlayer('27', '捕手'),
      makePlayer('8', '外野手'),
    ]
    const result = sortedRoster(roster)
    expect(result.map((r) => r.number)).toEqual(['8', '14', '27', '33'])
  })

  it('元の配列を変更しない', () => {
    const roster = [makePlayer('99'), makePlayer('1')]
    const original = [...roster]
    sortedRoster(roster)
    expect(roster.map((r) => r.number)).toEqual(original.map((r) => r.number))
  })

  it('00 は 0 より前に来る', () => {
    const roster = [makePlayer('0'), makePlayer('00'), makePlayer('1')]
    const result = sortedRoster(roster)
    expect(result.map((r) => r.number)).toEqual(['00', '0', '1'])
  })

  it('00, 0, 通常番号の混在でも正しく並ぶ', () => {
    const roster = [makePlayer('14'), makePlayer('0'), makePlayer('00'), makePlayer('3')]
    const result = sortedRoster(roster)
    expect(result.map((r) => r.number)).toEqual(['00', '0', '3', '14'])
  })
})

// ─────────────────────────────────────────────
// rosterPitcherToLineupFields
// ─────────────────────────────────────────────

describe('rosterPitcherToLineupFields', () => {
  it('投手の投球成績を LineupPlayer フィールドにマップする', () => {
    const r: RosterPlayer = {
      positionCategory: '投手', number: '18', name: '森下 暢仁',
      appearances: '22', record: '10勝5敗', wins: '10', losses: '5',
      era: '2.50', whip: '1.10',
    }
    const fields = rosterPitcherToLineupFields(r)
    expect(fields.name).toBe('森下 暢仁')
    expect(fields.number).toBe('18')
    expect(fields.appearances).toBe('22')
    expect(fields.record).toBe('10勝5敗')
    expect(fields.wins).toBe('10')
    expect(fields.losses).toBe('5')
    expect(fields.era).toBe('2.50')
    expect(fields.whip).toBe('1.10')
  })

  it('投手の打撃成績も LineupPlayer フィールドにマップされる（セ・リーグ対応）', () => {
    const r: RosterPlayer = {
      positionCategory: '投手', number: '18', name: '森下 暢仁',
      appearances: '22', wins: '10', losses: '5',
      battingAvg: '.167', homeRuns: '0', rbi: '2', ops: '.389',
      atBats: '18', hits: '3', batHand: 'R',
    }
    const fields = rosterPitcherToLineupFields(r)
    expect(fields.battingAvg).toBe('.167')
    expect(fields.homeRuns).toBe('0')
    expect(fields.rbi).toBe('2')
    expect(fields.ops).toBe('.389')
    expect(fields.atBats).toBe('18')
    expect(fields.hits).toBe('3')
    expect(fields.batHand).toBe('R')
  })

  it('打撃成績がない投手では battingAvg が undefined', () => {
    const r: RosterPlayer = {
      positionCategory: '投手', number: '14', name: '大瀬良 大地',
      appearances: '15', wins: '7', losses: '5',
    }
    const fields = rosterPitcherToLineupFields(r)
    expect(fields.battingAvg).toBeUndefined()
    expect(fields.ops).toBeUndefined()
  })

  it('appearances が undefined のときは空文字にフォールバックする', () => {
    const r: RosterPlayer = {
      positionCategory: '投手', number: '14', name: '大瀬良 大地',
    }
    const fields = rosterPitcherToLineupFields(r)
    expect(fields.appearances).toBe('')
    expect(fields.record).toBe('')
  })
})

const emptyLineup = (): LineupPlayer[] => Array.from({ length: 10 }, (_, index) => ({
  order: index + 1,
  name: '',
  number: '',
  position: index === 9 ? '投' : '',
}))

describe('applyScorePageLineup', () => {
  it('オールスターで名簿がなくても打順外の投手名を10番目に反映する', () => {
    const result = applyScorePageLineup(
      emptyLineup(),
      [
        { order: 5, position: 'DH', name: '櫻井' },
        { order: 10, position: '投', name: '杉山' },
      ],
      [],
    )

    expect(result[4]).toMatchObject({
      order: 5,
      position: 'DH',
      name: '櫻井',
    })
    expect(result[9]).toMatchObject({
      order: 10,
      position: '投',
      name: '杉山',
    })
  })

  it('DH制では10番目の投手を更新し、DH打者を打順内に保持する', () => {
    const roster: RosterPlayer[] = [
      {
        positionCategory: '外野手',
        number: '12',
        name: '櫻井 ユウヤ',
        battingAvg: '.300',
      },
      {
        positionCategory: '投手',
        number: '15',
        name: '杉山 遙希',
        appearances: '10',
        wins: '5',
        losses: '1',
        era: '1.50',
      },
    ]

    const result = applyScorePageLineup(
      emptyLineup(),
      [
        { order: 5, position: 'DH', name: '櫻井' },
        { order: 10, position: '投', name: '杉山' },
      ],
      roster,
    )

    expect(result[4]).toMatchObject({
      order: 5,
      position: 'DH',
      name: '櫻井 ユウヤ',
      number: '12',
    })
    expect(result[9]).toMatchObject({
      order: 10,
      position: '投',
      name: '杉山 遙希',
      number: '15',
      appearances: '10',
      wins: '5',
      losses: '1',
      era: '1.50',
    })
  })

  it('セ・リーグ型では打順内の投手を打者欄と10番目の両方に反映する', () => {
    const roster: RosterPlayer[] = [{
      positionCategory: '投手',
      number: '18',
      name: '森下 暢仁',
      battingAvg: '.167',
      appearances: '22',
      wins: '10',
      losses: '5',
    }]

    const result = applyScorePageLineup(
      emptyLineup(),
      [{ order: 9, position: '投', name: '森下' }],
      roster,
    )

    expect(result[8]).toMatchObject({
      order: 9,
      position: '投',
      name: '森下 暢仁',
      number: '18',
      battingAvg: '.167',
    })
    expect(result[9]).toMatchObject({
      order: 10,
      position: '投',
      name: '森下 暢仁',
      number: '18',
      appearances: '22',
      wins: '10',
      losses: '5',
    })
  })

  it('アルファベット付き登録名はイニシャルを除いた名前を反映する', () => {
    const roster: RosterPlayer[] = [{
      positionCategory: '投手',
      number: '11',
      name: 'キハダ',
      throwHand: 'L',
      batHand: 'L',
    }]

    const result = applyScorePageLineup(
      emptyLineup(),
      [{ order: 10, position: '投', name: 'キハダ' }],
      roster,
    )

    expect(result[9]).toMatchObject({
      name: 'キハダ',
      number: '11',
      throwHand: 'L',
      batHand: 'L',
    })
  })
})
