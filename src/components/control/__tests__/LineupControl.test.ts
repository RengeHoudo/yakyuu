import { describe, it, expect } from 'vitest'
import { formatRosterOptionLabel, sortedRoster } from '../LineupControl'
import type { PositionCategory, RosterPlayer } from '../../../types'

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
