import type { PlatformAdapter } from '../core/platform'
import { deepseekAdapter } from './deepseek'

/**
 * 平台注册表。新增平台:新建目录实现 PlatformAdapter,然后在这里加一行。
 * 已有平台的代码不需要修改。
 */
export const adapters: PlatformAdapter[] = [deepseekAdapter]

export function getAdapter(platformId: string): PlatformAdapter | undefined {
  return adapters.find((a) => a.platform.id === platformId)
}

export function detectAdapter(names: string[]): PlatformAdapter | undefined {
  return adapters.find((a) => a.detectByNames(names))
}

export function agentName(platformId: string, agentId: string): string {
  const a = getAdapter(platformId)
  return a?.agents.find((x) => x.id === agentId)?.name ?? a?.platform.name ?? platformId
}
