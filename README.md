# 回忆小抽屉

把 AI 聊天平台导出的聊天记录,变成一本温暖的手账本。只在你自己的设备上翻看,不上传、不联网读取任何内容。

当前版本支持 DeepSeek 的导出包。后续可能会陆续支持更多平台。

## 特点

- 手机桌面风格的入口,手账拼贴风格的聊天阅读页,有搜索、时间和对象筛选
- 心情日记与备忘录
- 导出手账风网页,或导出备份包
- 五种情绪色彩:宁静(蓝)、轻松(绿)、想念(粉紫)、快乐(亮黄)、夜深(银灰),另有安静模式
- 所有内容只保存在本机浏览器里
- 平台适配采用可扩展结构,新增平台不影响已有功能

## 隐私约定

- 只读取聊天记录本身,**完全不读取 `user.json` 等账号相关文件**。导入时有白名单,不在名单里的文件不会被读取,也不会被解压
- 不上传任何数据
- 仓库里**不得**提交任何真实账号的聊天导出数据。根目录 `.gitignore` 已忽略 `testdata/`(各平台导出的原始样本)、各平台导出文件夹和 `*.zip`
- 开发和测试只使用 `app/src/test/fixtures.ts` 里的虚构数据

## 开发

```bash
cd app
npm install
npm run dev      # 本地开发
npm test         # 运行测试(vitest)
npm run build    # 构建正式版本
```

技术栈:Vite + React + TypeScript + Dexie(IndexedDB)。

## 许可协议

Copyright © 2026 [ForOneIce](https://github.com/ForOneIce)

本项目的代码、界面文案、贴纸与图标图案均为作者原创,
采用 [知识共享 署名—非商业性使用—相同方式共享 4.0 国际许可协议(CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 授权。全文见 [`LICENSE`](LICENSE)。

简单来说:

- 可以自由使用、修改和分享
- 分享时需要**署名**(注明作者 ForOneIce 并附上协议链接),并说明是否做过修改
- 不得用于**商业目的**
- 修改后再分享,需要继续使用**相同的协议**

使用者在应用里导入的聊天记录属于使用者本人,不在本协议范围内,本项目不会收集它们。

## 第三方依赖

下列开源软件由各自作者按其自身协议授权,**不适用上面的 CC BY-NC-SA 4.0**。
本项目没有修改它们,使用时遵守它们各自的协议即可。

### 运行时依赖(会打包进网页)

| 名称 | 版本 | 协议 | 用途 |
| --- | --- | --- | --- |
| [react](https://react.dev/) / react-dom | 19.3.1 | MIT | 界面 |
| [dexie](https://dexie.org) | 4.4.7 | Apache-2.0 | 本机数据库(IndexedDB)封装 |
| [dexie-react-hooks](https://dexie.org) | 4.4.0 | Apache-2.0 | 数据库与界面联动 |
| [fflate](https://101arrowz.github.io/fflate) | 0.8.3 | MIT | 读写 zip(导入导出包、备份包) |
| [react-markdown](https://github.com/remarkjs/react-markdown) | 10.1.0 | MIT | 显示聊天里的 Markdown |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | 4.0.1 | MIT | 表格、删除线等扩展语法 |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | 2.0.0 | MIT | 离线使用、添加到主屏幕 |

它们各自还依赖一些间接依赖,协议均为 MIT、ISC、BSD 或 Apache-2.0 等宽松协议。

### 开发与构建工具(不会随网页分发)

| 名称 | 版本 | 协议 |
| --- | --- | --- |
| [vite](https://vite.dev) | 8.3.x | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.3.0 | MIT |
| [typescript](https://www.typescriptlang.org/) | 7.0.2 | Apache-2.0 |
| [vitest](https://vitest.dev) | 5.1.0 | MIT |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | 6.2.8 | Apache-2.0 |
| @types/node、@types/react、@types/react-dom | - | MIT |

构建链路里的间接依赖还有少量其他协议,例如 `lightningcss`(MPL-2.0)和
`caniuse-lite`(CC-BY-4.0)。它们只在构建时使用,不在最终的网页里。

### 查看完整清单

在 `app` 目录运行下面的命令,可以看到所有依赖及其协议:

```bash
npx license-checker --production --summary
```

(`license-checker` 是临时下载运行的,不会写进项目依赖。)
