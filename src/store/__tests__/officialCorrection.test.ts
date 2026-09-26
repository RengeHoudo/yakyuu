import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../useGameStore'
import { initialGameState, defaultPitcherGameStats } from '../../types'
import { officialBatting } from '../../lib/officialCorrection'
import { parseBoxScoreHtml } from '../../lib/boxScore'

vi.mock('../../lib/sync', () => ({ broadcastState: vi.fn() }))
vi.mock('../../lib/idbBackup', () => ({ backupToIDB: vi.fn(), restoreFromIDB: vi.fn().mockResolvedValue(null) }))
const s = () => useGameStore.getState()
const official = (texts: string[]) => ({ away: [{ order: 1, name: '山田', results: texts.map(text => ({ text, type: 'hit' as const })) }], home: [], fetchedAt: Date.now() })
beforeEach(() => {
  useGameStore.setState({ ...structuredClone(initialGameState), autoChangeEffect: false,
    awayLineup: [{ ...initialGameState.awayLineup[0]!, order: 1, name: '山田 太郎', npbDisplayName: '山田', number: '1', atBats: '10', hits: '2', totalBases: '2' }],
    pitcher: { ...initialGameState.pitcher, name: '井上', number: '97' },
  })
})
describe('公式記録補正', () => {
  it('二塁打を単打へ修正しても走者位置を維持し、元記録を保存する', () => {
    s().recordDouble()
    const runners = s().runners
    s().setBoxScoreData(official(['遊 安']))
    expect(s().batterGameStats['away-1']).toMatchObject({ gameSingles: 1, gameDoubles: 0 })
    expect(s().runners).toEqual(runners)
    expect(s().awayLineup[0]).toMatchObject({ battingAvg: '.273', ops: '.545' })
    expect(s().plateAppearanceRecords[0]).toMatchObject({ original: { gameDoubles: 1 }, stats: { gameSingles: 1 }, officialText: '遊 安' })
    expect(s().officialCorrections).toHaveLength(1)
    s().setBoxScoreData(official(['遊 安']))
    expect(s().officialCorrections).toHaveLength(1)
  })
  it('未掲載の打席を維持し、安打から失策への訂正を状況別成績にも反映する', () => {
    useGameStore.setState({ pitcher: { ...s().pitcher, throwHand: 'L' }, count: { balls: 1, strikes: 2, outs: 0 } })
    s().recordDouble()
    useGameStore.setState({ awayBatterIndex: 0 })
    s().recordSingle()
    s().setBoxScoreData(official(['遊ゴ失']))
    expect(s().batterGameStats['away-1']).toMatchObject({ gameAtBats: 2, gameSingles: 1, gameDoubles: 0 })
    expect(s().awayHits).toBe(1)
    expect(s().batterSituationalGameStats['away-1']?.Empty).toMatchObject({ hits: 0 })
    expect(s().batterPitcherHandGameStats['away-1']?.L).toMatchObject({ atBats: 2, hits: 1 })
    expect(s().batterCountGameStats['away-1']?.['1-2']).toMatchObject({ atBats: 1, hits: 0 })
    s().setBoxScoreData(official(['左前安①', '左線２']))
    expect(s().batterGameStats['away-1']).toMatchObject({ gameSingles: 1, gameDoubles: 1 })
  })
  it('投手の補正は公式が追いつくまで保留し、対象4項目だけを変更する', () => {
    s().recordSingle()
    useGameStore.setState({ awayBatterIndex: 0 })
    s().recordSingle()
    const data = { ...official(['遊安']), pitchers: { away: [], home: [{ name: '井上', hitsAllowed: 1, walksAllowed: 0, hitByPitchAllowed: 0, earnedRunsAllowed: 0 }] } }
    s().setPitcherGameStats('home-97', { ...defaultPitcherGameStats, hitsAllowed: 2, earnedRunsAllowed: 2, runsAllowed: 2, outsRecorded: 5 })
    s().setBoxScoreData(data)
    expect(s().pitcherGameStats['home-97']?.earnedRunsAllowed).toBe(2)
    s().setBoxScoreData({ ...data, ...official(['遊安', '遊ゴ失']) })
    expect(s().pitcherGameStats['home-97']).toMatchObject({ hitsAllowed: 1, earnedRunsAllowed: 0, runsAllowed: 2, outsRecorded: 5 })
  })
  it('別イニングの結果は誤って紐付けない', () => {
    s().recordDouble()
    s().setBoxScoreData({ ...official(['遊安']), away: [{ ...official(['遊安']).away[0]!, resultInnings: [3] }] })
    expect(s().batterGameStats['away-1']?.gameDoubles).toBe(1)
  })
  it('投手表の被安打・四球・死球・自責点を解析する', () => {
    const html = '<table id="tablefix_t_p"><tbody><tr><td>●</td><td><a>井上</a></td><td>111</td><td>30</td><td><table><tbody><tr><th>7</th><td>.2</td></tr></tbody></table></td><td>7</td><td>0</td><td>2</td><td>1</td><td>10</td><td>1</td><td>0</td><td>3</td><td>1</td></tr></tbody></table>'
    expect(parseBoxScoreHtml(html).pitchers?.away).toEqual([{ name: '井上', hitsAllowed: 7, walksAllowed: 2, hitByPitchAllowed: 1, earnedRunsAllowed: 1 }])
  })
  it.each([
    ['遊　安', 'gameSingles'], ['左前安①', 'gameSingles'], ['左線２③', 'gameDoubles'],
    ['右中３', 'gameTriples'], ['左本②', 'gameHomeRuns'], ['四球', 'gameWalks'],
    ['死球', 'gameHitByPitch'], ['右犠飛①', 'gameSacFlies'], ['投犠打', 'gameSacBunts'],
  ] as const)('%sを%sとして集計する', (text, field) => {
    expect(officialBatting(text)?.[field]).toBe(1)
  })
  it('取得失敗や未知の結果では記録を変更しない', () => {
    s().recordDouble()
    s().setBoxScoreData(official(['不明']))
    s().setBoxScoreData(null)
    expect(s().batterGameStats['away-1']?.gameDoubles).toBe(1)
    expect(s().officialCorrections).toHaveLength(0)
  })
  it('試合URLの変更後は旧試合の記録を照合しない', () => {
    s().recordDouble()
    s().setScoreUrl('https://npb.jp/scores/2026/0926/c-g-25/')
    s().setBoxScoreData(official(['遊安']))
    expect(s().batterGameStats['away-1']?.gameDoubles).toBe(1)
  })
  it('交代前の打者も選手番号で補正し、新打者の成績を変更しない', () => {
    s().recordDouble()
    useGameStore.setState({ awayLineup: [{ ...s().awayLineup[0]!, number: '2', name: '田中', npbDisplayName: '田中', gameDoubles: 0 }] })
    s().setBoxScoreData(official(['遊安']))
    expect(s().batterGameStats['away-1']?.gameSingles).toBe(1)
    expect(s().awayLineup[0]?.gameDoubles).toBe(0)
  })
  it('同じ略称の別選手がいる場合は補正を保留する', () => {
    s().recordDouble()
    useGameStore.setState({ awayLineup: [{ ...s().awayLineup[0]!, number: '2' }] })
    s().setBoxScoreData(official(['遊安']))
    expect(s().batterGameStats['away-1']?.gameDoubles).toBe(1)
  })
  it('保存・復元後も同じ補正を重複適用せず、新規試合で履歴を消去する', () => {
    s().recordDouble()
    s().setBoxScoreData(official(['遊安']))
    const saved = JSON.parse(localStorage.getItem('yakyuu-game-state')!).state
    s().newGame()
    expect(s().plateAppearanceRecords).toHaveLength(0)
    s().replaceState(saved)
    s().setBoxScoreData(official(['遊安']))
    expect(s().batterGameStats['away-1']?.gameSingles).toBe(1)
    expect(s().officialCorrections).toHaveLength(1)
  })
  it('交代済み投手のフルネームを一意な姓で照合する', () => {
    s().recordSingle()
    useGameStore.setState({ pitcher: { ...s().pitcher, name: '森田', number: '47' },
      pitcherHistory: [{ name: '井上 温大', number: '97', team: 'home', order: 0, isActive: false }],
    })
    s().setBoxScoreData({ ...official(['遊安']), pitchers: { away: [], home: [{ name: '井上', hitsAllowed: 1, walksAllowed: 2, hitByPitchAllowed: 1, earnedRunsAllowed: 0 }] } })
    expect(s().pitcherGameStats['home-97']).toMatchObject({ walksAllowed: 2, hitByPitchAllowed: 1 })
  })
  it('打席数が一致しても得点の反映待ちなら投手補正を保留する', () => {
    s().recordSingle()
    s().setPitcherGameStats('home-97', { ...defaultPitcherGameStats, earnedRunsAllowed: 1 })
    useGameStore.setState({ awayTotal: 1 })
    s().setBoxScoreData({ ...official(['遊安']), totals: { away: 0, home: 0 }, pitchers: { away: [], home: [{ name: '井上', hitsAllowed: 1, walksAllowed: 0, hitByPitchAllowed: 0, earnedRunsAllowed: 0 }] } })
    expect(s().pitcherGameStats['home-97']?.earnedRunsAllowed).toBe(1)
  })
})
