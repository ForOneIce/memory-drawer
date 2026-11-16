/**
 * 仅开发时使用,不会进入正式构建。
 * 隐私约定:这里只允许使用 src/test/fixtures.ts 里的"虚构示例数据"。
 * 严禁在代码里引用、拷贝任何真实账号的聊天记录或导出包。
 */
import { getDB } from './core/db'
import { importFromSource, openFromRaw } from './core/importer'
import { invalidateSearch } from './core/search'
import { syntheticExport } from './test/fixtures'

export function installDevTools() {
  ;(window as unknown as Record<string, unknown>).__dev = {
    /** 放入虚构的示例数据,用来看有内容时的界面 */
    async seedDemo() {
      return importFromSource(await openFromRaw(syntheticExport()))
    },
    db: () => getDB(),
    /** 清空本机浏览器里的所有数据,回到"第一次打开"的样子 */
    async wipe() {
      const db = getDB()
      await Promise.all([db.conversations.clear(), db.messages.clear(), db.assets.clear(), db.diaries.clear()])
      invalidateSearch()
    },
  }
}
