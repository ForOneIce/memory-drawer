/**
 * 平台适配器接口与注册表。
 * 新增平台 = 新增一个目录并在 platforms/index.ts 里注册,不需要修改已有平台的代码。
 */
import type { Agent, Conversation, Platform } from './model'
import type { SafeSource } from './source'

export interface ImportGuideStep {
  title: string
  detail?: string
}

export interface ImportGuide {
  intro: string
  steps: ImportGuideStep[]
  tips: string[]
}

export interface ParsedConversation {
  conversation: Conversation
  /** 解析时遇到的小问题(例如未认识的片段类型),只用于汇总提示,不会阻止导入 */
  warnings: number
}

export interface PlatformInspect {
  /** 导出格式的版本号,用来选择对应的解析器 */
  formatVersion: string
  /** 预计的会话数量 */
  conversationCount: number
}

export interface ParseProgress {
  done: number
  total: number
}

export interface PlatformAdapter {
  platform: Platform
  agents: Agent[]
  /** 桌面图标(public 下的相对路径) */
  icon: string
  /** 平台的代表色(用于桌面、手账页上的小点缀) */
  accent: string
  /** 需要作为"目录标记"的路径片段,用来定位导出包的根目录 */
  rootMarkers: string[]
  /** 只凭文件名判断是不是这个平台的导出包,不读取任何内容 */
  detectByNames(names: string[]): boolean
  /** 白名单:只有返回 true 的路径才允许被读取 */
  allowPath(path: string): boolean
  /** 读取版本等基础信息(只会读白名单内的文件) */
  inspect(src: SafeSource): Promise<PlatformInspect>
  /** 逐个会话解析。出错的会话会被跳过并计入失败数,不会中断整个导入 */
  parse(
    src: SafeSource,
    onProgress?: (p: ParseProgress) => void,
    signal?: AbortSignal,
  ): AsyncGenerator<ParsedConversation | { failed: string }, void, void>
  guide: ImportGuide
}
