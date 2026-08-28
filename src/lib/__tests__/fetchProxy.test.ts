import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCorsProxyUrl, fetchNpbRosterPage } from '../fetchProxy'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('buildCorsProxyUrl cache-busting', () => {
  it('URLに _cb クエリパラメータが付与される', () => {
    const result = buildCorsProxyUrl('https://npb.jp/scores/2026/0408/c-g-02/')
    // NPBのDOM構造を保持できるReaderプロキシから始まる
    expect(result).toMatch(/^https:\/\/r\.jina\.ai\/https:\/\/npb\.jp\//)
    const decoded = decodeURIComponent(result)
    expect(decoded).toContain('_cb=')
    // 元のURLパスも含まれる
    expect(decoded).toContain('https://npb.jp/scores/2026/0408/c-g-02/')
  })

  it('既にクエリパラメータがあるURLにも正しく付与される', () => {
    const result = buildCorsProxyUrl('https://npb.jp/page?foo=bar')
    const decoded = decodeURIComponent(result)
    // 既存のパラメータを保持しつつ _cb が付与
    expect(decoded).toContain('foo=bar')
    expect(decoded).toContain('_cb=')
  })

  it('_cb パラメータの値は数値文字列である', () => {
    const result = buildCorsProxyUrl('https://npb.jp/test/')
    const decoded = decodeURIComponent(result)
    const cbMatch = decoded.match(/_cb=(\d+)/)
    expect(cbMatch).not.toBeNull()
    // タイムスタンプとして妥当な範囲
    const ts = parseInt(cbMatch![1]!, 10)
    expect(ts).toBeGreaterThan(1700000000000)
  })
})

describe('production NPB fetch', () => {
  it('DOMを保持するHTML形式とキャッシュ無効化をReaderへ指定する', async () => {
    vi.stubEnv('PROD', true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))

    await fetchNpbRosterPage()

    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toMatch(/^https:\/\/r\.jina\.ai\/https:\/\/npb\.jp\/announcement\/roster\//)
    expect(options).toMatchObject({
      cache: 'no-store',
      headers: {
        'x-respond-with': 'html',
        'x-no-cache': 'true',
      },
    })
  })
})
