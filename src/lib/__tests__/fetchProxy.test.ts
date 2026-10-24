import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCorsProxyUrl, fetchNf3Page, fetchNpbRosterPage } from '../fetchProxy'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('nf3 fetch', () => {
  it('開発時はViteプロキシを使用する', async () => {
    vi.stubEnv('PROD', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    await fetchNf3Page('/Central/C/f/0_stat.htm')
    expect(fetch).toHaveBeenCalledWith('/api/nf3/Central/C/f/0_stat.htm', { cache: 'no-store' })
  })

  it('本番ではHTMLを保持するCORSプロキシを使用し、専用設定を反映する', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_NF3_PROXY_BASE', 'https://proxy.example/')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    await fetchNf3Page('/Central/C/f/0_stat.htm')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/proxy\.example\/https:\/\/nf3\.sakura\.ne\.jp\/Central\/C\/f\/0_stat\.htm\?_cb=\d+$/),
      { cache: 'no-store', headers: { 'x-respond-with': 'html', 'x-no-cache': 'true' } },
    )
  })
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
  it('Readerの422タイムアウトを、取得先と中継サービスを含むエラーとして伝える', async () => {
    vi.stubEnv('PROD', true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'AssertionFailureError',
      message: 'Request failed: Timeout was reached',
    }), { status: 422 })))

    await expect(fetchNpbRosterPage()).rejects.toThrow(
      'NPB取得プロキシ（r.jina.ai）でタイムアウトしました (HTTP 422)。取得先: https://npb.jp/announcement/roster/',
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    [422, JSON.stringify({ message: 'Invalid input' })],
    [502, '<html>Bad Gateway</html>'],
    [429, JSON.stringify({ message: 'Rate limit exceeded' })],
  ])('HTTP %sをタイムアウトと決めつけず、HTMLのエラー本文も表示しない', async (status, body) => {
    vi.stubEnv('PROD', true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })))

    await expect(fetchNpbRosterPage()).rejects.toThrow(
      `NPB取得プロキシ（r.jina.ai）へのアクセスに失敗しました (HTTP ${status})。取得先: https://npb.jp/announcement/roster/`,
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('専用プロキシ設定を反映する', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_NPB_PROXY_BASE', ' https://proxy.example/npb ')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await fetchNpbRosterPage()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/proxy\.example\/npb\/https:\/\/npb\.jp\/announcement\/roster\//),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('クライアント側の待ち時間に上限を設け、時間切れを説明する', async () => {
    vi.stubEnv('PROD', true)
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')))

    try {
      await expect(fetchNpbRosterPage()).rejects.toThrow('NPB取得プロキシ（r.jina.ai）でタイムアウトしました')
      expect(timeout).toHaveBeenCalledWith(30_000)
      expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }))
    } finally {
      timeout.mockRestore()
    }
  })

  it('通信エラーでも取得先と中継サービスを示す', async () => {
    vi.stubEnv('PROD', true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchNpbRosterPage()).rejects.toThrow(
      'NPB取得プロキシ（r.jina.ai）と通信できませんでした。取得先: https://npb.jp/announcement/roster/',
    )
  })

  it('開発時はNPBへのViteプロキシを使い、HTTP応答をそのまま返す', async () => {
    vi.stubEnv('PROD', false)
    const response = new Response('unavailable', { status: 503 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    expect(await fetchNpbRosterPage()).toBe(response)
    expect(fetch).toHaveBeenCalledWith('/api/npb-roster', { cache: 'no-store' })
  })

  it('DOMを保持するHTML形式とキャッシュ無効化をReaderへ指定する', async () => {
    vi.stubEnv('PROD', true)
    const html = '<table><tr><td>選手名</td></tr></table>'
    const response = new Response(html)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    const result = await fetchNpbRosterPage()

    expect(result).toBe(response)
    expect(await result.text()).toBe(html)
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
