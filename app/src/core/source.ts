/**
 * 文件来源抽象 + 隐私白名单。
 *
 * 红线:只做历史记录展示,不读取任何个人隐私信息(例如 user.json)。
 * 做法:
 *   1. RawSource 只"列名字",不读内容;
 *   2. 平台适配器声明允许读取的路径(allowPath);
 *   3. SafeSource 只暴露白名单内的路径,读取白名单外的路径会直接抛错;
 *   4. ZIP 实现中,白名单外的文件连解压都不会发生。
 */
import { unzipSync } from 'fflate'

export class PrivacyGuardError extends Error {
  readonly path: string
  constructor(path: string) {
    super(`这个文件不在允许读取的范围内:${path}`)
    this.name = 'PrivacyGuardError'
    this.path = path
  }
}

export interface RawSource {
  /** 所有文件的相对路径(已去掉最外层文件夹)。只有名字,没有内容 */
  names(): string[]
  /** 读取文件内容。调用方必须先经过白名单 */
  read(path: string): Promise<Uint8Array>
  size(path: string): number | undefined
  label: string
}

export interface SafeSource {
  /** 白名单内的路径 */
  names(): string[]
  has(path: string): boolean
  read(path: string): Promise<Uint8Array>
  readText(path: string): Promise<string>
  readJson<T = unknown>(path: string): Promise<T>
  size(path: string): number | undefined
}

export function createSafeSource(raw: RawSource, allowPath: (path: string) => boolean): SafeSource {
  const allowed = new Set(raw.names().filter(allowPath))
  const guard = (path: string) => {
    if (!allowed.has(path)) throw new PrivacyGuardError(path)
  }
  const decoder = new TextDecoder('utf-8')
  const read = async (path: string) => {
    guard(path)
    return raw.read(path)
  }
  return {
    names: () => [...allowed],
    has: (p) => allowed.has(p),
    read,
    readText: async (p) => decoder.decode(await read(p)).replace(/^\uFEFF/, ''),
    readJson: async <T,>(p: string) => JSON.parse(decoder.decode(await read(p)).replace(/^\uFEFF/, '')) as T,
    size: (p) => (allowed.has(p) ? raw.size(p) : undefined),
  }
}

/** 统一路径写法,并去掉可能的最外层文件夹(如 deepseek_data-2026-11-16/) */
export function normalizePaths(paths: string[], markers: string[]): { map: Map<string, string> } {
  const clean = paths.map((p) => p.replace(/\\/g, '/').replace(/^\.?\//, ''))
  let prefix = ''
  outer: for (const p of clean) {
    for (const m of markers) {
      if (p.startsWith(m)) {
        prefix = ''
        break outer
      }
      const idx = p.indexOf('/' + m)
      if (idx >= 0) {
        prefix = p.slice(0, idx + 1)
        break outer
      }
    }
  }
  const map = new Map<string, string>()
  paths.forEach((orig, i) => {
    const c = clean[i]
    if (c.endsWith('/')) return
    if (prefix && !c.startsWith(prefix)) return
    map.set(c.slice(prefix.length), orig)
  })
  return { map }
}

/**
 * 从 ZIP 文件创建 RawSource。
 * 只有被白名单放行并被 read() 调用的文件才会被解压;其余文件(如 user.json)保持原样不动。
 */
export async function rawFromZip(file: File | Blob, markers: string[], label = 'ZIP'): Promise<RawSource> {
  const data = new Uint8Array(await file.arrayBuffer())
  const original: string[] = []
  const sizes = new Map<string, number>()
  // filter 始终返回 false:这一遍只读取目录里的名字和大小,不解压任何内容
  unzipSync(data, {
    filter: (info) => {
      original.push(info.name)
      sizes.set(info.name, info.originalSize)
      return false
    },
  })
  const { map } = normalizePaths(original, markers)
  return {
    label,
    names: () => [...map.keys()],
    size: (p) => {
      const o = map.get(p)
      return o ? sizes.get(o) : undefined
    },
    read: async (p) => {
      const o = map.get(p)
      if (!o) throw new Error(`找不到文件:${p}`)
      const out = unzipSync(data, { filter: (info) => info.name === o })
      const bytes = out[o]
      if (!bytes) throw new Error(`读取不到文件:${p}`)
      return bytes
    },
  }
}

/** 从文件夹选择(webkitdirectory)创建 RawSource */
export function rawFromFiles(files: File[], markers: string[], label = '文件夹'): RawSource {
  const rel = files.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
  const { map } = normalizePaths(rel, markers)
  const byOrig = new Map<string, File>()
  files.forEach((f, i) => byOrig.set(rel[i], f))
  return {
    label,
    names: () => [...map.keys()],
    size: (p) => {
      const o = map.get(p)
      return o ? byOrig.get(o)?.size : undefined
    },
    read: async (p) => {
      const o = map.get(p)
      const f = o ? byOrig.get(o) : undefined
      if (!f) throw new Error(`找不到文件:${p}`)
      return new Uint8Array(await f.arrayBuffer())
    },
  }
}

/** 测试用的内存来源,会记录被读取过的路径 */
export function rawFromMemory(entries: Record<string, string | Uint8Array>): RawSource & { reads: string[] } {
  const reads: string[] = []
  const enc = new TextEncoder()
  return {
    label: '内存',
    reads,
    names: () => Object.keys(entries),
    size: (p) => {
      const v = entries[p]
      return v === undefined ? undefined : typeof v === 'string' ? enc.encode(v).length : v.length
    },
    read: async (p) => {
      reads.push(p)
      const v = entries[p]
      if (v === undefined) throw new Error(`找不到文件:${p}`)
      return typeof v === 'string' ? enc.encode(v) : v
    },
  }
}
