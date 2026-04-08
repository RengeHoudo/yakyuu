import { describe, it, expect } from 'vitest'
import { buildCorsProxyUrl } from '../fetchProxy'

describe('buildCorsProxyUrl cache-busting', () => {
  it('URLに _cb クエリパラメータが付与される', () => {
    const result = buildCorsProxyUrl('https://npb.jp/scores/2026/0408/c-g-02/')
    // corsproxy.io のベースURLから始まる
    expect(result).toMatch(/^https:\/\/corsproxy\.io\/\?url=/)
    // エンコード済みURL部分をデコードして _cb= が含まれることを確認
    const encoded = result.replace('https://corsproxy.io/?url=', '')
    const decoded = decodeURIComponent(encoded)
    expect(decoded).toContain('_cb=')
    // 元のURLパスも含まれる
    expect(decoded).toContain('https://npb.jp/scores/2026/0408/c-g-02/')
  })

  it('既にクエリパラメータがあるURLにも正しく付与される', () => {
    const result = buildCorsProxyUrl('https://npb.jp/page?foo=bar')
    const encoded = result.replace('https://corsproxy.io/?url=', '')
    const decoded = decodeURIComponent(encoded)
    // 既存のパラメータを保持しつつ _cb が付与
    expect(decoded).toContain('foo=bar')
    expect(decoded).toContain('_cb=')
  })

  it('_cb パラメータの値は数値文字列である', () => {
    const result = buildCorsProxyUrl('https://npb.jp/test/')
    const encoded = result.replace('https://corsproxy.io/?url=', '')
    const decoded = decodeURIComponent(encoded)
    const cbMatch = decoded.match(/_cb=(\d+)/)
    expect(cbMatch).not.toBeNull()
    // タイムスタンプとして妥当な範囲
    const ts = parseInt(cbMatch![1]!, 10)
    expect(ts).toBeGreaterThan(1700000000000)
  })
})
