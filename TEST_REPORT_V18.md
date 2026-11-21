# V1.8 测试记录

## 已执行

- Node.js 22：node --check src/chronicle.js
- Node.js 22：node --check src/chronicle-ui.js
- Node.js 22：node tests/v18.test.cjs
- 结果：18 项断言通过。

## 覆盖内容

- 未选择节点的两个假设分支；
- 已选择节点从历史决策前状态重建分支；
- 被放弃未来形成的设施对自身通道和远端复合通道的资源成本影响；
- 已有同类设施时的来源合并与非重复收益；
- 分析不修改当前游戏状态；
- 非法站点索引拒绝。

## 尚未执行

- 完整 python build.py 构建；
- Chromium / Playwright 浏览器验收；
- 390px 移动视口与真实设备测试；
- 键盘可访问性、屏幕阅读器和视觉回归；
- 真人试玩。

因此本报告只证明纯逻辑模块在 Node 测试夹具中的正确性，不宣称 V1.8 已通过完整产品验收。
