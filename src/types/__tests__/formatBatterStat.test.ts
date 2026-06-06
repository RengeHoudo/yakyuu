/**
 * formatBatterStat ユニットテスト
 * StatDisplaySettings によるスタッツ表示制御を検証する
 */

import { describe, expect, it } from 'vitest'
import type { LineupPlayer, PitcherGameStats, StatDisplaySettings } from '../index'
import { defaultStatDisplaySettings, formatBatterStat, formatPitcherRecord, formatPitcherStat, formatPitcherGameSummary, parseInningsPitched, computeLiveEra, computeLiveWhip, getDisplayNameInContext } from '../index'

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
  it('settings 省略時はデフォルト設定を使う（打率・OPS ON）', () => {
    const result = formatBatterStat(SAMPLE_PLAYER)
    expect(result).toBe('.278 OPS.735')
  })

  it('defaultStatDisplaySettings: 打率と OPS が含まれ HR/打点は含まれない', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, defaultStatDisplaySettings)
    expect(result).toBe('.278 OPS.735')
    expect(result).not.toContain('本')
    expect(result).not.toContain('打点')
  })

  it('defaultStatDisplaySettings: showOps が true である', () => {
    expect(defaultStatDisplaySettings.showOps).toBe(true)
  })

  it('defaultStatDisplaySettings: showEra が true である', () => {
    expect(defaultStatDisplaySettings.showEra).toBe(true)
  })

  it('defaultStatDisplaySettings: showWhip が true である', () => {
    expect(defaultStatDisplaySettings.showWhip).toBe(true)
  })

  it('defaultStatDisplaySettings: 打率と OPS が含まれる', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, defaultStatDisplaySettings)
    expect(result).toContain('.278')
    expect(result).toContain('OPS.735')
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
    showSaves: false,
    showHolds: false,
    showEra: false,
    showWhip: false,
    showHandedness: false,
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
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,      showHandedness: false,      ...overrides,
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
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,
      showHandedness: false,
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
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,
      showHandedness: false,
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
      showRecord: true,      showSaves: true,
      showHolds: true,
      showEra: true,
      showWhip: true,
      showHandedness: false,
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
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,
      showHandedness: false,
    }
    const result = formatBatterStat(player, settings)
    expect(result).toBe('.250')
  })
})

// ─────────────────────────────────────────────
// formatPitcherStat
// ─────────────────────────────────────────────

const SAMPLE_PITCHER: LineupPlayer = {
  order: 10,
  name: '森下 暢仁',
  number: '18',
  position: '投',
  appearances: '22',
  record: '5勝3敗',
}

const EMPTY_PITCHER: LineupPlayer = {
  order: 10,
  name: '森下 暢仁',
  number: '18',
  position: '投',
}

describe('formatPitcherStat – デフォルト設定', () => {
  it('デフォルト設定では空文字（showAppearances/showRecord ともに false）', () => {
    const result = formatPitcherStat(SAMPLE_PITCHER)
    expect(result).toBe('')
  })

  it('defaultStatDisplaySettings: ERA/WHIP を持つ投手では防御率と WHIP が含まれる', () => {
    const pitcher: LineupPlayer = { ...SAMPLE_PITCHER, era: '3.50', whip: '1.25' }
    const result = formatPitcherStat(pitcher)
    expect(result).toContain('防御率 3.50')
    expect(result).toContain('WHIP 1.25')
  })
})

describe('formatPitcherStat – 個別フラグ', () => {
  function makeSettings(overrides: Partial<StatDisplaySettings>): StatDisplaySettings {
    return {
      showBattingAvg: false,
      showHomeRuns: false,
      showRbi: false,
      showOps: false,
      showAppearances: false,
      showRecord: false,
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,      showHandedness: false,      ...overrides,
    }
  }

  it('showAppearances=true: 登板数が "22登板" 形式で含まれる', () => {
    const result = formatPitcherStat(SAMPLE_PITCHER, makeSettings({ showAppearances: true }))
    expect(result).toBe('22登板')
  })

  it('showRecord=true: 勝敗が含まれる', () => {
    const result = formatPitcherStat(SAMPLE_PITCHER, makeSettings({ showRecord: true }))
    expect(result).toBe('5勝3敗')
  })

  it('showAppearances + showRecord: スペース区切りで結合', () => {
    const result = formatPitcherStat(SAMPLE_PITCHER, makeSettings({ showAppearances: true, showRecord: true }))
    expect(result).toBe('22登板 5勝3敗')
  })

  it('値が未設定のフィールドはスキップ', () => {
    const result = formatPitcherStat(EMPTY_PITCHER, makeSettings({ showAppearances: true, showRecord: true }))
    expect(result).toBe('')
  })
})

// ─────────────────────────────────────────────
// formatPitcherRecord (F4)
// ─────────────────────────────────────────────

describe('formatPitcherRecord', () => {
  it('全項目あり: W/L/H/S 形式', () => {
    expect(formatPitcherRecord({ wins: '2', losses: '1', holds: '40', saves: '20' })).toBe('2W/1L/40H/20S')
  })

  it('勝敗のみ', () => {
    expect(formatPitcherRecord({ wins: '10', losses: '3' })).toBe('10W/3L')
  })

  it('0の項目は省略', () => {
    expect(formatPitcherRecord({ wins: '0', losses: '1' })).toBe('1L')
  })

  it('全て0なら空文字', () => {
    expect(formatPitcherRecord({ wins: '0', losses: '0', holds: '0', saves: '0' })).toBe('')
  })

  it('未定義フィールドは0扱い', () => {
    expect(formatPitcherRecord({ wins: '5' })).toBe('5W')
  })

  it('セーブのみ (クローザー)', () => {
    expect(formatPitcherRecord({ wins: '1', losses: '2', saves: '30' })).toBe('1W/2L/30S')
  })

  it('ホールドのみ (セットアッパー)', () => {
    expect(formatPitcherRecord({ holds: '25' })).toBe('25H')
  })
})

// ─────────────────────────────────────────────
// formatPitcherStat 拡張 (F3, F5)
// ─────────────────────────────────────────────

const PITCHER_FULL: LineupPlayer = {
  order: 10,
  name: '森下 暢仁',
  number: '18',
  position: '投',
  appearances: '22',
  wins: '5',
  losses: '3',
  saves: '20',
  holds: '40',
  era: '2.45',
  whip: '1.12',
}

describe('formatPitcherStat – 拡張フィールド', () => {
  function makeSettings(overrides: Partial<StatDisplaySettings>): StatDisplaySettings {
    return {
      showBattingAvg: false,
      showHomeRuns: false,
      showRbi: false,
      showOps: false,
      showAppearances: false,
      showRecord: false,
      showSaves: false,
      showHolds: false,
      showEra: false,
      showWhip: false,
      showHandedness: false,
      ...overrides,
    }
  }

  it('showRecord=true で formatPitcherRecord 形式', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showRecord: true }))
    expect(result).toBe('5W/3L')
  })

  it('showRecord=true、wins/losses 未定義、record あり → record をフォールバック', () => {
    const pitcher: LineupPlayer = { ...EMPTY_PITCHER, record: '5勝3敗' }
    const result = formatPitcherStat(pitcher, makeSettings({ showRecord: true }))
    expect(result).toBe('5勝3敗')
  })

  it('showSaves=true', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showSaves: true }))
    expect(result).toBe('20S')
  })

  it('showSaves=true、saves=0 → 非表示', () => {
    const pitcher: LineupPlayer = { ...PITCHER_FULL, saves: '0' }
    const result = formatPitcherStat(pitcher, makeSettings({ showSaves: true }))
    expect(result).toBe('')
  })

  it('showHolds=true', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showHolds: true }))
    expect(result).toBe('40H')
  })

  it('showHolds=true、holds=0 → 非表示', () => {
    const pitcher: LineupPlayer = { ...PITCHER_FULL, holds: '0' }
    const result = formatPitcherStat(pitcher, makeSettings({ showHolds: true }))
    expect(result).toBe('')
  })

  it('showEra=true', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showEra: true }))
    expect(result).toBe('防御率 2.45')
  })

  it('showEra=true、era 未設定 → 非表示', () => {
    const result = formatPitcherStat(EMPTY_PITCHER, makeSettings({ showEra: true }))
    expect(result).toBe('')
  })

  it('showWhip=true', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showWhip: true }))
    expect(result).toBe('WHIP 1.12')
  })

  it('showWhip=true、whip 未設定 → 非表示', () => {
    const result = formatPitcherStat(EMPTY_PITCHER, makeSettings({ showWhip: true }))
    expect(result).toBe('')
  })

  it('showAppearances + showRecord + showEra: スペース区切りで結合', () => {
    const result = formatPitcherStat(PITCHER_FULL, makeSettings({ showAppearances: true, showRecord: true, showEra: true }))
    expect(result).toBe('22登板 5W/3L 防御率 2.45')
  })
})

// ─────────────────────────────────────────────
// parseInningsPitched (F2)
// ─────────────────────────────────────────────

describe('parseInningsPitched', () => {
  it('整数（端数なし）: 142.0 → 142', () => {
    expect(parseInningsPitched('142.0')).toBe(142)
  })

  it('1/3 イニング: 142.1 → ≈142.333', () => {
    expect(parseInningsPitched('142.1')).toBeCloseTo(142 + 1 / 3)
  })

  it('2/3 イニング: 142.2 → ≈142.667', () => {
    expect(parseInningsPitched('142.2')).toBeCloseTo(142 + 2 / 3)
  })

  it('小さい値: 3.2 → ≈3.667', () => {
    expect(parseInningsPitched('3.2')).toBeCloseTo(3 + 2 / 3)
  })

  it('0イニング: 0.0 → 0', () => {
    expect(parseInningsPitched('0.0')).toBe(0)
  })

  it('ドットなし: 100 → 100', () => {
    expect(parseInningsPitched('100')).toBe(100)
  })

  it('0.1（リリーフ1アウト）→ ≈0.333', () => {
    expect(parseInningsPitched('0.1')).toBeCloseTo(1 / 3)
  })
})

// ─────────────────────────────────────────────
// computeLiveEra / computeLiveWhip
// ─────────────────────────────────────────────

const SEASON_PITCHER: LineupPlayer = {
  order: 10, name: '森下', number: '18', position: '投',
  inningsPitched: '90.0', earnedRuns: '20', hitsAllowed: '70', walksAllowed: '30',
  era: '2.00', whip: '1.11',
}

describe('computeLiveEra', () => {
  it('シーズンのみ（gameStatsなし）→ シーズンERAを返す', () => {
    // (20 * 9) / 90 = 2.00
    expect(computeLiveEra(SEASON_PITCHER)).toBe('2.00')
  })

  it('シーズン + 試合中成績を統合して計算', () => {
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    // totalIP = 90 + 3 = 93, totalER = 20 + 3 = 23
    // ERA = (23 * 9) / 93 = 2.2258... → '2.23'
    expect(computeLiveEra(SEASON_PITCHER, gs)).toBe('2.23')
  })

  it('シーズンデータなしの投手 + 試合中3自責点/3IP', () => {
    const emptyPitcher: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投' }
    const gs: PitcherGameStats = { hitsAllowed: 4, walksAllowed: 1, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    // ERA = (3 * 9) / 3 = 9.00
    expect(computeLiveEra(emptyPitcher, gs)).toBe('9.00')
  })

  it('シーズンも試合もデータなし → undefined', () => {
    const emptyPitcher: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投' }
    expect(computeLiveEra(emptyPitcher)).toBeUndefined()
  })

  it('totalIP=0 → シーズンeraをフォールバック', () => {
    const p: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投', era: '3.50' }
    const gs: PitcherGameStats = { hitsAllowed: 0, walksAllowed: 0, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 0 }
    expect(computeLiveEra(p, gs)).toBe('3.50')
  })

  it('earnedRunsAllowed のみERAに反映（非自責点は除外）', () => {
    // シーズン: 90IP, 20ER → ERA 2.00
    // 試合: 3IP(9outs), 3失点うち自責点2
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 2, outsRecorded: 9 }
    // totalIP = 90 + 3 = 93, totalER = 20 + 2 = 22
    // ERA = (22 * 9) / 93 = 2.1290... → '2.13'
    expect(computeLiveEra(SEASON_PITCHER, gs)).toBe('2.13')
  })
})

describe('computeLiveWhip', () => {
  it('シーズンのみ（gameStatsなし）→ シーズンWHIPを計算', () => {
    // (70 + 30) / 90 = 1.11
    expect(computeLiveWhip(SEASON_PITCHER)).toBe('1.11')
  })

  it('シーズン + 試合中成績を統合', () => {
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    // totalIP = 93, totalH+BB = (70+5) + (30+2) = 107
    // WHIP = 107 / 93 = 1.1505... → '1.15'
    expect(computeLiveWhip(SEASON_PITCHER, gs)).toBe('1.15')
  })

  it('シーズンデータなし + 試合中2H+1BB/3IP', () => {
    const emptyPitcher: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投' }
    const gs: PitcherGameStats = { hitsAllowed: 2, walksAllowed: 1, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 9 }
    // WHIP = 3 / 3 = 1.00
    expect(computeLiveWhip(emptyPitcher, gs)).toBe('1.00')
  })

  it('シーズンも試合もデータなし → undefined', () => {
    const emptyPitcher: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投' }
    expect(computeLiveWhip(emptyPitcher)).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// formatPitcherStat with gameStats
// ─────────────────────────────────────────────

describe('formatPitcherStat – ライブ更新', () => {
  function makeSettings(overrides: Partial<StatDisplaySettings>): StatDisplaySettings {
    return {
      showBattingAvg: false, showHomeRuns: false, showRbi: false, showOps: false,
      showAppearances: false, showRecord: false, showSaves: false, showHolds: false,
      showEra: false, showWhip: false, showHandedness: false,
      ...overrides,
    }
  }

  it('showEra + gameStats → ライブERAを計算して表示', () => {
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    const result = formatPitcherStat(SEASON_PITCHER, makeSettings({ showEra: true }), gs)
    expect(result).toBe('防御率 2.23')
  })

  it('showWhip + gameStats → ライブWHIPを計算して表示', () => {
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    const result = formatPitcherStat(SEASON_PITCHER, makeSettings({ showWhip: true }), gs)
    expect(result).toBe('WHIP 1.15')
  })

  it('gameStatsなしでもシーズンデータから計算', () => {
    const result = formatPitcherStat(SEASON_PITCHER, makeSettings({ showEra: true }))
    expect(result).toBe('防御率 2.00')
  })

  it('データなし投手 + gameStatsだけで試合中ERA表示', () => {
    const emptyP: LineupPlayer = { order: 10, name: 'X', number: '1', position: '投' }
    const gs: PitcherGameStats = { hitsAllowed: 4, walksAllowed: 1, runsAllowed: 3, earnedRunsAllowed: 3, outsRecorded: 9 }
    const result = formatPitcherStat(emptyP, makeSettings({ showEra: true }), gs)
    expect(result).toBe('防御率 9.00')
  })
})

// ─────────────────────────────────────────────
// formatPitcherGameSummary
// ─────────────────────────────────────────────

describe('formatPitcherGameSummary', () => {
  it('全スタッツありのサマリー', () => {
    const gs: PitcherGameStats = { hitsAllowed: 5, walksAllowed: 2, runsAllowed: 3, earnedRunsAllowed: 2, outsRecorded: 18 }
    expect(formatPitcherGameSummary(gs)).toBe('6回 被安打5 与四球2 自責2 失点3')
  })

  it('0回 (初登板直後)', () => {
    const gs: PitcherGameStats = { hitsAllowed: 0, walksAllowed: 0, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 0 }
    expect(formatPitcherGameSummary(gs)).toBe('0回')
  })

  it('端数あり: 9アウト = 3回', () => {
    const gs: PitcherGameStats = { hitsAllowed: 3, walksAllowed: 1, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 9 }
    expect(formatPitcherGameSummary(gs)).toBe('3回 被安打3 与四球1')
  })

  it('端数あり: 10アウト = 3.1回', () => {
    const gs: PitcherGameStats = { hitsAllowed: 0, walksAllowed: 0, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 10 }
    expect(formatPitcherGameSummary(gs)).toBe('3.1回')
  })

  it('端数あり: 11アウト = 3.2回', () => {
    const gs: PitcherGameStats = { hitsAllowed: 1, walksAllowed: 0, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 11 }
    expect(formatPitcherGameSummary(gs)).toBe('3.2回 被安打1')
  })

  it('1アウト = 0.1回', () => {
    const gs: PitcherGameStats = { hitsAllowed: 0, walksAllowed: 1, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 1 }
    expect(formatPitcherGameSummary(gs)).toBe('0.1回 与四球1')
  })

  it('与四球のみ (四球が記録に反映される)', () => {
    const gs: PitcherGameStats = { hitsAllowed: 0, walksAllowed: 3, runsAllowed: 0, earnedRunsAllowed: 0, outsRecorded: 6 }
    expect(formatPitcherGameSummary(gs)).toBe('2回 与四球3')
  })

  it('自責点と失点が同じ場合は失点を省略', () => {
    const gs: PitcherGameStats = { hitsAllowed: 2, walksAllowed: 0, runsAllowed: 1, earnedRunsAllowed: 1, outsRecorded: 9 }
    expect(formatPitcherGameSummary(gs)).toBe('3回 被安打2 自責1')
  })

  it('非自責点がある場合は失点も表示', () => {
    const gs: PitcherGameStats = { hitsAllowed: 2, walksAllowed: 0, runsAllowed: 3, earnedRunsAllowed: 1, outsRecorded: 9 }
    expect(formatPitcherGameSummary(gs)).toBe('3回 被安打2 自責1 失点3')
  })
})

// ─────────────────────────────────────────────
// getDisplayNameInContext
// ─────────────────────────────────────────────

describe('getDisplayNameInContext', () => {
  it('空文字は空文字を返す', () => {
    expect(getDisplayNameInContext('', [])).toBe('')
  })

  it('同姓なし → 姓のみ', () => {
    const team = ['山本 祐大', '田中 将大', '鈴木 誠也']
    expect(getDisplayNameInContext('山本 祐大', team)).toBe('山本')
  })

  it('同姓あり → 姓+名先頭1文字', () => {
    const team = ['山本 祐大', '山本 恵大', '田中 将大']
    expect(getDisplayNameInContext('山本 祐大', team)).toBe('山本祐')
    expect(getDisplayNameInContext('山本 恵大', team)).toBe('山本恵')
  })

  it('姓+名先頭1文字も同じ → 姓+名先頭2文字', () => {
    const team = ['山本 祐大', '山本 祐太', '田中 将大']
    expect(getDisplayNameInContext('山本 祐大', team)).toBe('山本祐大')
    expect(getDisplayNameInContext('山本 祐太', team)).toBe('山本祐太')
  })

  it('外国人選手 "A.カタカナ" スタイル → カタカナ部分のみ', () => {
    const team = ['S.サンタナ', '山本 祐大']
    expect(getDisplayNameInContext('S.サンタナ', team)).toBe('サンタナ')
  })

  it('スペースなし（カタカナ名） → そのまま返す', () => {
    const team = ['マクブルーム', '山本 祐大']
    expect(getDisplayNameInContext('マクブルーム', team)).toBe('マクブルーム')
  })

  it('チームに自分しかいない → 姓のみ', () => {
    expect(getDisplayNameInContext('山本 祐大', ['山本 祐大'])).toBe('山本')
  })

  it('teamNamesが空配列でも動作する', () => {
    expect(getDisplayNameInContext('山本 祐大', [])).toBe('山本')
  })
})

// ─────────────────────────────────────────────
// showHandedness（左右表示）
// ─────────────────────────────────────────────

describe('formatBatterStat – showHandedness', () => {
  const makeSettings = (overrides: Partial<StatDisplaySettings>): StatDisplaySettings => ({
    ...defaultStatDisplaySettings,
    ...overrides,
  })

  it('batHand L + showHandedness true → [L] が先頭に付く', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'L' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: true }))
    expect(result).toMatch(/^\[L\]/)
  })

  it('batHand S + showHandedness true → <S> が先頭に付く', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'S' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: true }))
    expect(result).toMatch(/^<S>/)
  })

  it('batHand R + showHandedness true → (R) が先頭に付く', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'R' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: true }))
    expect(result).toMatch(/^\(R\)/)
  })

  it('batHand undefined + showHandedness true → 手指標なし', () => {
    const result = formatBatterStat(SAMPLE_PLAYER, makeSettings({ showHandedness: true }))
    expect(result).not.toContain('[L]')
    expect(result).not.toContain('(R)')
  })

  it('showHandedness false → batHand があっても表示しない', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'L' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: false }))
    expect(result).not.toContain('[L]')
    expect(result).not.toContain('(R)')
  })

  it('表示順: 左右 → 打率 → OPS', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'L' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: true, showBattingAvg: true, showOps: true }))
    expect(result).toBe('[L] .278 OPS.735')
  })

  it('左右のみ表示（打率・OPS OFF）', () => {
    const player = { ...SAMPLE_PLAYER, batHand: 'R' as const }
    const result = formatBatterStat(player, makeSettings({ showHandedness: true, showBattingAvg: false, showOps: false }))
    expect(result).toBe('(R)')
  })
})

describe('formatPitcherStat – showHandedness', () => {
  const PITCHER: LineupPlayer = {
    order: 10,
    name: '森下 暢仁',
    number: '18',
    position: '投',
    era: '2.50',
    whip: '1.10',
  }
  const makeSettings = (overrides: Partial<StatDisplaySettings>): StatDisplaySettings => ({
    showBattingAvg: false,
    showHomeRuns: false,
    showRbi: false,
    showOps: false,
    showAppearances: false,
    showRecord: false,
    showSaves: false,
    showHolds: false,
    showEra: false,
    showWhip: false,
    showHandedness: false,
    ...overrides,
  })

  it('throwHand L + showHandedness true → [L] が先頭に付く', () => {
    const player = { ...PITCHER, throwHand: 'L' as const }
    const result = formatPitcherStat(player, makeSettings({ showHandedness: true }))
    expect(result).toMatch(/^\[L\]/)
  })

  it('throwHand R + showHandedness true → (R) が先頭に付く', () => {
    const player = { ...PITCHER, throwHand: 'R' as const }
    const result = formatPitcherStat(player, makeSettings({ showHandedness: true }))
    expect(result).toMatch(/^\(R\)/)
  })

  it('throwHand undefined + showHandedness true → 手指標なし', () => {
    const result = formatPitcherStat(PITCHER, makeSettings({ showHandedness: true }))
    expect(result).toBe('')
  })

  it('showHandedness false → throwHand があっても表示しない', () => {
    const player = { ...PITCHER, throwHand: 'L' as const }
    const result = formatPitcherStat(player, makeSettings({ showHandedness: false }))
    expect(result).not.toContain('[L]')
  })

  it('表示順: 左右 → 防御率 → WHIP', () => {
    const player = { ...PITCHER, throwHand: 'L' as const }
    const result = formatPitcherStat(player, makeSettings({ showHandedness: true, showEra: true, showWhip: true }))
    expect(result).toBe('[L] 防御率 2.50 WHIP 1.10')
  })
})
