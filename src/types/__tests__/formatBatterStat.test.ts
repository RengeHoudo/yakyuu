/**
 * formatBatterStat ユニットテスト
 * StatDisplaySettings によるスタッツ表示制御を検証する
 */

import { describe, expect, it } from 'vitest'
import type { LineupPlayer, StatDisplaySettings } from '../index'
import { defaultStatDisplaySettings, formatBatterStat } from '../index'

const SAMPLE_PLAYER: LineupPlayer = {
  order: 1,
  name: 'テスト選手',
  number: '1',
  position: '左',
  battingAvg: '.278',
  homeRuns: '4',
  rbi: '28',
  ops: '.735',
}

const EMPTY_STATS_PLAYER: LineupPlayer = {
  order: 1,
  name: 'テスト選手',
  number: '1',
  position: '左',
}

// ─────────────────────────────────────────────
// デフォルト設定
// ─────────────────────────────────────────────

describe('formatBatterStat – defaultStatDisplaySettings', () => {
  it('settings 省略時はデフォルト設定を使う（打率のみON）', () => {
    const result = formatBatterStat(SAMPLE_PLAYER)
    expect(result).toBe('.278')
  })

  it('defaultStatDisplaySettings: 打率のみ含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, defaultStatDisplaySettings)
    expect(result).toBe('.278')
    expect(result).not.toContain('本')
    expect(result).not.toContain('打点')
    expect(result).not.toContain('OPS')
  })
})

// ─────────────────────────────────────────────
// 全 OFF
// ─────────────────────────────────────────────

describe('formatBatterStat – 全 OFF', () => {
  const allOff: StatDisplaySettings = {
    showBattingAvg: false,
    showHomeRuns: false,
    showRbi: false,
    showOps: false,
    showAppearances: false,
    showRecord: false,
  }

  it('全設定 OFF の場合は空文字を返す', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, allOff)
    expect(result).toBe('')
  })
})

// ─────────────────────────────────────────────
// 個別フラグ
// ─────────────────────────────────────────────

describe('formatBatterStat – 個別フラグ', () => {
  function makeSettings(overrides: Partial<StatDisplaySettings>): StatDisplaySettings {
    return {
      showBattingAvg: false,
      showHomeRuns: false,
      showRbi: false,
      showOps: false,
      showAppearances: false,
      showRecord: false,
      ...overrides,
    }
  }

  it('showBattingAvg=true: 打率が含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showBattingAvg: true }))
    expect(result).toBe('.278')
  })

  it('showBattingAvg=false: 打率が含まれない', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showBattingAvg: false }))
    expect(result).not.toContain('.278')
  })

  it('showHomeRuns=true: HR が "4本" 形式で含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showHomeRuns: true }))
    expect(result).toBe('4本')
  })

  it('showRbi=true: 打点が "28打点" 形式で含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showRbi: true }))
    expect(result).toBe('28打点')
  })

  it('showOps=true: OPS が "OPS.735" 形式で含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showOps: true }))
    expect(result).toBe('OPS.735')
  })
})

// ─────────────────────────────────────────────
// 複数 ON
// ─────────────────────────────────────────────

describe('formatBatterStat – 複数 ON', () => {
  it('打率・HR・打点 ON: スペース区切りで結合', () => {
    const settings: StatDisplaySettings = {
      showBattingAvg: true,
      showHomeRuns: true,
      showRbi: true,
      showOps: false,
      showAppearances: false,
      showRecord: false,
    }
    const result = formatBatterStat(SAMPLE_PLAYER, settings)
    expect(result).toBe('.278 4本 28打点')
  })

  it('全 ON: 全スタッツが含まれる', () => {
    const allOn: StatDisplaySettings = {
      showBattingAvg: true,
      showHomeRuns: true,
      showRbi: true,
      showOps: true,
      showAppearances: true,
      showRecord: true,
    }
    const result = formatBatterStat(SAMPLE_PLAYER, allOn)
    expect(result).toBe('.278 4本 28打点 OPS.735')
  })
})

// ─────────────────────────────────────────────
// 値が空の場合
// ─────────────────────────────────────────────

describe('formatBatterStat – 値が空の場合', () => {
  it('設定が ON でも値が未設定のフィールドはスキップされる', () => {
    const allOn: StatDisplaySettings = {
      showBattingAvg: true,
      showHomeRuns: true,
      showRbi: true,
      showOps: true,
      showAppearances: true,
      showRecord: true,
    }
    const result = formatBatterStat(EMPTY_STATS_PLAYER, allOn)
    expect(result).toBe('')
  })

  it('打率のみ値あり・HR ON: 打率のみ表示される', () => {
    const player: LineupPlayer = {
      ...EMPTY_STATS_PLAYER,
      battingAvg: '.250',
    }
    const settings: StatDisplaySettings = {
      showBattingAvg: true,
      showHomeRuns: true,
      showRbi: false,
      showOps: false,
      showAppearances: false,
      showRecord: false,
    }
    const result = formatBatterStat(player, settings)
    expect(result).toBe('.250')
  })
})
