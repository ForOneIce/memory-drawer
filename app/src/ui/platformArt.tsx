import { SparkleSticker, WhaleSticker } from './stickers'

/**
 * 每个平台在聊天页里的"小印章"。
 * 拟人形象本身只在桌面入口作为图标出现(它不能再回答,所以聊天页里没有脸),
 * 对方的发言用平台的小贴纸标记,例如 DeepSeek 的鲸鱼发夹。
 */
export function PlatformSticker({ platformId, size = 32 }: { platformId: string; size?: number }) {
  switch (platformId) {
    case 'deepseek':
      return <WhaleSticker size={size} title="DeepSeek" />
    default:
      return <SparkleSticker size={size} />
  }
}
