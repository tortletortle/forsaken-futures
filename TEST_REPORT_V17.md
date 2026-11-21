# V1.7 测试报告

## 新增专项测试

运行：`node tests/v17.test.cjs`

通过项目：
- DSL schema 与非法操作拒绝；
- 条件表达式安全编译；
- DAG 拓扑排序和循环依赖拒绝；
- 参数裁剪与依赖修复；
- 模块变异和同依赖结构交叉；
- 编译器不修改父代 genome；
- 新增评分头直接改变候选动作评分；
- 两模块组合可读取前驱模块输出；
- 确定性候选合成；
- 等局数、等分配抽象预算实验核算。

## 主实验

- 5 seeds × 3 玩家等级 = 15 配对任务单元；
- 3 策略臂；每臂 4 候选 + 1 基线候选；
- 1,950 局模拟；4,680,000 分配 abstract work units；
- V1.7 生成 60 个候选程序、90 个唯一技能模块；
- 14,082 次技能评分头运行；
- 预设 +0.01 晋级阈值下 0 个新模块晋级。

原始数据：`tests/v17-benchmark.json`。
汇总数据：`tests/v17-benchmark-summary.json`。
阈值敏感性：`tests/v17-threshold-sensitivity.json`（事后探索性分析）。
技能库：`tests/v17-skill-library.json`。

## 浏览器验收

运行：`python tests/v17_browser.py`

- 打开 V1.7 对话框；
- 3 种子 × 3 玩家等级的小型配对实验；
- 三策略臂结果表生成；
- 技能 DSL 卡片渲染；
- JSON 下载成功；
- 390px 移动端无页面级水平溢出；
- Chromium pageerror 为 0。

截图：
- `tests/v17-lab-desktop.png`
- `tests/v17-lab-mobile.png`

## 历史回归

15 个 Node 测试套件全部通过：engine、evolution、players、multi、robust、coevo、ecology、memory、migration、modular、expansion、v14、v15、v16、v17。

备注：这些是当前工程内的回归脚本，不等于对所有历史版本所有路径做形式化验证。
