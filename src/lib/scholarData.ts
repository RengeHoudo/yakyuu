/** Baseball Scholar の公開スナップショット（通常JSON・gzip・分割行）を読む。 */
const BASE_URL = 'https://baseballscholar.com/'
const POINTER_PATH = 'data/local-updates/current.json'
export type ScholarFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type ScholarRow = Record<string, unknown>
interface Pointer {
  schema_version: number
  files: Record<string, string>
  compressed_files?: Record<string, string>
}
export interface ScholarDescriptor {
  path: string
  package_id: string
  season: number
  sport_id: number
  domain: string
  kind?: string
  stats_scope_kind: string
}
export interface ScholarManifest {
  package_id: string
  datasets: ScholarDescriptor[]
  details: ScholarDescriptor[]
}
interface RowContainer {
  package_id: string
  rows?: ScholarRow[]
  row_parts?: string[]
}
const caches = new Map<ScholarFetch, Map<string, Promise<unknown>>>()

function safePath(path: unknown): path is string {
  return typeof path === 'string' && /^data\/[\w/.-]+\.json(?:\.gz)?$/.test(path)
    && !path.split('/').includes('..')
}

function cached<T>(fetcher: ScholarFetch, key: string, load: () => Promise<T>): Promise<T> {
  let cache = caches.get(fetcher)
  if (!cache) { cache = new Map(); caches.set(fetcher, cache) }
  const existing = cache.get(key)
  if (existing) return existing as Promise<T>
  const promise = load().catch((error) => { cache.delete(key); throw error })
  cache.set(key, promise)
  return promise
}

async function request(fetcher: ScholarFetch, path: string): Promise<Response> {
  if (!safePath(path)) throw new Error('Baseball Scholar のデータパスが不正です')
  const response = await fetcher(`${BASE_URL}${path}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Baseball Scholar 成績の取得に失敗しました (${response.status})`)
  return response
}

function pointer(fetcher: ScholarFetch): Promise<Pointer> {
  return cached(fetcher, 'pointer', async () => {
    const data = await (await request(fetcher, POINTER_PATH)).json() as Pointer
    if (data.schema_version !== 1 || !data.files
      || Object.entries(data.files).some(([key, value]) => !safePath(key) || !safePath(value))
      || Object.entries(data.compressed_files ?? {}).some(([key, value]) => !safePath(key) || !safePath(value))) {
      throw new Error('Baseball Scholar の更新情報が不正です')
    }
    return data
  })
}

async function readJson<T>(fetcher: ScholarFetch, path: string, ancestors: string[] = []): Promise<T> {
  if (ancestors.includes(path)) throw new Error('Baseball Scholar の分割データが循環しています')
  return cached(fetcher, path, async () => {
    const current = await pointer(fetcher)
    const target = current.files[path] ?? path
    const compressed = current.compressed_files?.[target]
    const response = await request(fetcher, compressed ?? target)
    const data = compressed
      ? await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).json()
      : await response.json()
    if (data.row_parts !== undefined) {
      if (!Array.isArray(data.row_parts) || data.row_parts.some((part: unknown) => !safePath(part))) {
        throw new Error('Baseball Scholar の分割データが不正です')
      }
      const parts = await Promise.all(data.row_parts.map((part: string) =>
        readJson<RowContainer>(fetcher, part, [...ancestors, path])))
      if (parts.some((part: RowContainer) => part.package_id !== data.package_id || !Array.isArray(part.rows))) {
        throw new Error('Baseball Scholar の分割データの版が一致しません')
      }
      data.rows = parts.flatMap((part: RowContainer) => part.rows!)
    }
    return data as T
  })
}

export async function fetchScholarManifest(fetcher: ScholarFetch): Promise<ScholarManifest> {
  const manifest = await readJson<ScholarManifest>(fetcher, 'data/circuits/v1/manifest.json')
  if (!manifest.package_id || !Array.isArray(manifest.datasets) || !Array.isArray(manifest.details)) {
    throw new Error('Baseball Scholar の成績一覧が不正です')
  }
  return manifest
}

export async function fetchScholarRows(fetcher: ScholarFetch, descriptor: ScholarDescriptor): Promise<ScholarRow[]> {
  const data = await readJson<RowContainer>(fetcher, descriptor.path)
  if (data.package_id !== descriptor.package_id || !Array.isArray(data.rows)) {
    // 壊れたレスポンスも再試行できるようにする。
    caches.get(fetcher)?.delete(descriptor.path)
    throw new Error('Baseball Scholar の成績データの版が一致しません')
  }
  return data.rows
}

export function clearScholarDataCache(): void {
  caches.clear()
}
