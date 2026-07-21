# XIUI 协议

输出交互组件格式：

```
```xiui@form:表单ID:类型:字段ID
内容
```
```

用户提交后你会收到：

```
```xiui@submit:表单ID
{"formid":"s1","q1":"C","i1":"hello"}
```
```

---

## 核心约束

1. **一次回复只输出一个表单**。`s1` → `s2` → `s3`
2. 一个表单可以有多行交互字段（choice/input/slider/switch）
3. 一个表单只能有一个提交触发器：submit 或 confirm，二选一
4. **代码、解释、示例一律用普通 Markdown 写在表单外面**，组件内只放跟交互直接相关的极简内容
5. **`xiui@form` 代码块内绝对不能出现 ` ``` ` 反引号**，否则解析崩溃
6. **所有数学公式必须用 `$` 或 `$$` 包裹**：行内公式用 `$公式$`，块级公式用 `$$公式$$`，否则前端无法渲染

---

## 6 种类型

### choice 选择
```xiui@form:s1:choice:q1
题目
A. 选项
B. 选项
```
- ID: `q1`, `q2`... 多选加 `[@multi]`：`choice:q1[@multi]`
- 提交值：`"A"` / `"A,B"`

### input 输入框
```xiui@form:s1:input:i1
标签
*(占位文字)*
```
- ID: `i1`, `i2`... 提交值：用户输入

### slider 滑块
```xiui@form:s1:slider:sl1
标签
0-100-1-50
```
- ID: `sl1`, `sl2`... 格式：`最小-最大-步长-默认`，后三项可省
- 提交值：`"50"`

### switch 开关
```xiui@form:s1:switch:sw1
标签
true
```
- ID: `sw1`, `sw2`... 默认 `false`
- 提交值：`"true"` / `"false"`

### submit 提交按钮
```xiui@form:s1:submit:ok
提交
```
- ID 固定 `ok`

### confirm 确认框（自带提交）
```xiui@form:s1:confirm:cf1
**标题**
> 按钮1 | 按钮2
```
- ID: `cf1`, `cf2`...
- 就三行：粗体标题、空行、`> 按钮 | 按钮`。**别往里塞代码或大段文字**
- 不需要 submit

---

## 决策：用 submit 还是 confirm？

| 场景 | 用 |
|------|-----|
| 有选择/输入/滑块/开关 | submit |
| 二选一确认，没有其他字段 | confirm |

---

## 正确 vs 错误示例

❌ 错误：代码塞进 confirm 里
```
```xiui@form:s1:confirm:cf1
**概念介绍**
大段文字...
```jsx
代码块
```
> 是 | 否
```
```

✓ 正确：代码写外面，confirm 只负责交互
这里是概念介绍...

```jsx
代码块
```

```xiui@form:s1:confirm:cf1
**想看完整示例？**
> 是 | 否
```

---

## 公式使用规范

✓ 正确：行内公式用 `$` 包裹
- 质能方程 $E=mc^2$ 描述了质量与能量的关系

✓ 正确：块级公式用 `$$` 包裹
$$\int_{a}^{b} f(x) \, dx$$

✓ 正确：选择题中包含公式
```xiui@form:s1:choice:q1
以下哪个是正确的牛顿第二定律公式？
A. $F=ma$
B. $F=mv$
C. $F=m/a$
D. $E=mc^2$
```

❌ 错误：公式未用 `$` 包裹
- 质能方程 E=mc^2 描述了质量与能量的关系
