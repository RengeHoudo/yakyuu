import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNpbScholarCache, fetchNpbScholarBatterStats, fetchNpbScholarPitcherStats } from '../npbScholar'

// Baseball Scholar の公開マニフェスト・圧縮JSONと同じ構造（数値はテスト用）。
const base = 'https://baseballscholar.com/'
const descriptor = (domain: string, kind?: string, season = 2026) => ({
  domain, kind, season, sport_id: 101, stats_scope_kind: 'level_total', package_id: 'test-package',
  path: `data/${season}-${domain}-${kind ?? 'annual'}.json`,
})
const batting = descriptor('batting')
const pitching = descriptor('pitching')
const battingHands = descriptor('batting', 'hand_splits')
const pitchingHands = descriptor('pitching', 'hand_splits')
const row = (domain: string, fields = {}) => ({
  player_id: 1, name: '高太一', team: '広島東洋カープ', season: 2026, sport_id: 101,
  domain, stats_scope_kind: 'level_total', ...fields,
})
const container = (rows: unknown[]) => ({ package_id: 'test-package', rows })
function fixture() {
  const files: Record<string, unknown> = {
    'data/local-updates/current.json': { schema_version: 1, files: {}, compressed_files: {} },
    'data/circuits/v1/manifest.json': {
      package_id: 'test-package', datasets: [descriptor('batting', undefined, 2025), batting, pitching],
      details: [battingHands, pitchingHands],
    },
    [batting.path]: container([row('batting', { AB: 100, H: 30 })]),
    [pitching.path]: container([row('pitching', { ERA: 2.5, WHIP: 1.12, BB_allowed: 12, HBP_allowed: 2 })]),
    [battingHands.path]: container([
      row('batting', { opponent_hand: 'R', AB: 80, H: 24, BA: 0.3 }),
      row('batting', { opponent_hand: 'L', AB: 20, H: 6, BA: 0.3 }),
      row('batting', { player_id: 2, opponent_hand: 'R', AB: 20, H: 20 }),
    ]),
    [pitchingHands.path]: container([
      row('pitching', { opponent_hand: 'R', AB: 100, H: 20, BB: 5, HBP: 1, SF: 2 }),
      row('pitching', { opponent_hand: 'L', AB: 50, H: 15, BB: 6, HBP: 1, SF: 0 }),
      row('pitching', { opponent_hand: 'U', AB: 10, H: 2, BB: 1, HBP: 0, SF: 0 }),
    ]),
  }
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(base, '')
    if (!(path in files)) return new Response('', { status: 404 })
    const value = files[path]
    return ArrayBuffer.isView(value)
      ? new Response(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
      : new Response(JSON.stringify(value))
  })
  return { files, fetcher }
}

beforeEach(clearNpbScholarCache)

describe('Baseball Scholar 移転後の成績取得', () => {
  it.each([
    ['髙橋　遥人', '高橋遥人'], ['髙橋 宏斗', '高橋宏斗'], ['山﨑 颯一郎', '山崎颯一郎'],
    ['齋藤 綱記', '斎藤綱記'], ['澤田 圭佑', '沢田圭佑'], ['髙寺 望夢', '高寺望夢'],
    ['宮﨑 敏郎', '宮崎敏郎'], ['渡邊 佳明', '渡辺佳明'], ['山縣 秀', '山県秀'],
  ])('既存の字体照合を新形式でも維持する: %s', async (npbName, scholarName) => {
    const { files, fetcher } = fixture()
    files[batting.path] = container([row('batting', { name: scholarName })])
    files[pitching.path] = container([row('pitching', { name: scholarName, ERA: 2.5 })])
    expect((await fetchNpbScholarBatterStats(npbName, '広島', fetcher))?.byPitcherHand.R).toBeDefined()
    expect((await fetchNpbScholarPitcherStats(npbName, '広島', fetcher))?.byBatterHand.R).toBeDefined()
  })

  it('最新NPBシーズンの氏名・字体・所属を照合し、数値の左右別打率を取得する', async () => {
    const { fetcher } = fixture()
    const stats = await fetchNpbScholarBatterStats('髙 太一', '広島', fetcher)
    expect(stats?.byPitcherHand).toEqual({
      R: { average: '.300', atBats: 80, hits: 24 },
      L: { average: '.300', atBats: 20, hits: 6 },
    })
    // 新サイトが配信していない状況別成績を打率ゼロにしない。
    expect(stats?.risp).toBeUndefined()
    expect(stats?.nonRisp).toBeUndefined()
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith(base))).toBe(true)
  })

  it('投手の年間成績と左右不明を含む被打撃集計を表示用の形式へ変換する', async () => {
    const { fetcher } = fixture()
    expect(await fetchNpbScholarPitcherStats('高太一', '広島', fetcher)).toMatchObject({
      era: '2.50', whip: '1.12', walks: 12, hitByPitch: 2,
      average: { average: '.231', atBats: 160, hits: 37 }, onBasePct: '.290',
      byBatterHand: {
        R: { average: '.200', atBats: 100, hits: 20 },
        L: { average: '.300', atBats: 50, hits: 15 },
      },
    })
  })

  it('更新ポインターのリダイレクト・gzip・分割行を読み込む', async () => {
    const { files, fetcher } = fixture()
    files['data/local-updates/current.json'] = {
      schema_version: 1, files: { [battingHands.path]: 'data/new-hands.json' },
      compressed_files: { 'data/new-hands.json': 'data/new-hands.json.gz' },
    }
    const stream = new Response(JSON.stringify({
      package_id: 'test-package', row_parts: ['data/part.json'],
    })).body!.pipeThrough(new CompressionStream('gzip'))
    files['data/new-hands.json.gz'] = new Uint8Array(await new Response(stream).arrayBuffer())
    files['data/part.json'] = files[battingHands.path]
    expect((await fetchNpbScholarBatterStats('高太一', '', fetcher))?.byPitcherHand.R?.hits).toBe(24)
    expect(fetcher).toHaveBeenCalledWith(`${base}data/new-hands.json.gz`, { cache: 'no-store' })
  })

  it('同時取得と選手切り替えで同じファイルの通信を共有する', async () => {
    const { fetcher } = fixture()
    await Promise.all([
      fetchNpbScholarBatterStats('髙 太一', '', fetcher),
      fetchNpbScholarBatterStats('高太一', '', fetcher),
      fetchNpbScholarPitcherStats('高太一', '', fetcher),
    ])
    expect(fetcher).toHaveBeenCalledTimes(6)
    await fetchNpbScholarBatterStats('未登録', '', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('通信失敗をキャッシュせず再試行する', async () => {
    const { files, fetcher } = fixture()
    const saved = files[battingHands.path]
    delete files[battingHands.path]
    await expect(fetchNpbScholarBatterStats('高太一', '', fetcher)).rejects.toThrow('404')
    files[battingHands.path] = saved
    expect((await fetchNpbScholarBatterStats('高太一', '', fetcher))?.byPitcherHand.R?.hits).toBe(24)
  })

  it('別パッケージの成績や不正なパスを黙って採用しない', async () => {
    const { files, fetcher } = fixture()
    files[battingHands.path] = { package_id: 'stale', rows: [] }
    await expect(fetchNpbScholarBatterStats('高太一', '', fetcher)).rejects.toThrow()
    clearNpbScholarCache()
    files['data/local-updates/current.json'] = { schema_version: 1, files: { [batting.path]: '../private.json' } }
    await expect(fetchNpbScholarBatterStats('高太一', '', fetcher)).rejects.toThrow()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('../'))).toBe(false)
  })

  it('同姓同名は所属で選び、曖昧な場合や空の名前は取得しない', async () => {
    const { files, fetcher } = fixture()
    files[batting.path] = container([
      row('batting', { player_id: 2, team: '読売ジャイアンツ' }), row('batting'),
    ])
    expect((await fetchNpbScholarBatterStats('高太一', '広島', fetcher))?.byPitcherHand.R?.hits).toBe(24)
    expect(await fetchNpbScholarBatterStats('高太一', '', fetcher)).toBeNull()
    expect(await fetchNpbScholarBatterStats('', '', fetcher)).toBeNull()
  })

  it('左右別の項目が未収録でも投手の年間成績を表示し、欠損をゼロにしない', async () => {
    const { files, fetcher } = fixture()
    files[pitchingHands.path] = container([])
    expect(await fetchNpbScholarPitcherStats('高太一', '', fetcher)).toMatchObject({
      era: '2.50', whip: '1.12', average: undefined, byBatterHand: {}, onBasePct: null,
      walks: 12, hitByPitch: 2,
    })
  })
})
