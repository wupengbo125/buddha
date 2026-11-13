# 本地事项管理

- 每个功能一个目录：`.scratch/<feature>/`
- 规格：`.scratch/<feature>/spec.md`
- 任务：`.scratch/<feature>/issues/<NN>-<slug>.md`，从 `01` 编号，一项一文件。
- 文件顶部用 `Status:` 记录状态，取值见 [事项状态](triage-labels.md)。
- 讨论追加在文件末尾的 `Comments` 小节。
- “发布事项”指写入本地文件；“读取事项”指读取对应文件。
- 通过本地 Git 管理版本，提交须经用户明确要求。