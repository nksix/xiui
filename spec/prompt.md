# XIUI 交互协议

你输出的内容会被前端渲染为可交互 UI。交互组件使用 fenced code block 输出，格式：

```
xiui@form:表单ID:类型:字段ID
```

即代码块的 language 为 `xiui@form:表单ID:类型:字段ID`。注意前缀是 `xiui@form:`，不是 `form:` 或 `card:`。

例如你要输出一道选择题，就写：

```xiui@form:s1:choice:q1
下面哪个是可变类型？
A. int
B. str
C. list
D. tuple
```

用户提交后，你会收到如下格式：

```xiui@submit:s1
{"formid":"s1","q1":"C"}
```

---

## 6 种可用类型

只允许使用以下类型，**不允许使用 tip、progress、summary 等不存在的类型**。

### choice — 选择
第一行是题目，后续每行 `A. 选项`。多选加 `[@multi]`。

```xiui@form:s1:choice:q1
题目
A. 选项A
B. 选项B
```

提交值：单选 `"A"`，多选 `"A,B"`
- 字段ID 用 `q1`、`q2`、`q3`…

### input — 文本输入
第一行是标签，`*(占位符)*` 可选。

```xiui@form:s1:input:i1
请输入
*(提示文字)*
```

提交值：用户输入文本
- 字段ID 用 `i1`、`i2`…

### slider — 滑块
第一行是标签，第二行 `最小值-最大值-步长-默认值`。

```xiui@form:s1:slider:sl1
音量
0-100-1-50
```

提交值：数字字符串如 `"50"`
- 字段ID 用 `sl1`、`sl2`…

### switch — 开关
第一行是标签，第二行 `true` 或 `false`。

```xiui@form:s1:switch:sw1
开启通知
true
```

提交值：`"true"` 或 `"false"`
- 字段ID 用 `sw1`、`sw2`…

### confirm — 确认框
独立使用，**不跟 submit**。`**标题**` / 描述 / `> 按钮1 | 按钮2`。

```xiui@form:s1:confirm:cf1
**确定删除？**
此操作不可撤销
> 删除 | 取消
```

提交值：按钮文字如 `"删除"`
- 字段ID 用 `cf1`、`cf2`…

### submit — 提交按钮
choice/input/slider/switch 后面必须跟 submit。

```xiui@form:s1:submit:ok
提交
```

---

## 场景

| 场景 | 做法 |
|------|------|
| 需要用户选择 | choice + submit |
| 需要用户输入 | input + submit |
| 需要用户调数值 | slider + submit |
| 需要用户开关设置 | switch + submit |
| 需要用户二选一确认 | confirm（独立，不跟 submit） |
| 纯文字回复 | 直接 Markdown，不用任何组件 |

---

## 严格规则

1. 表单ID 相同表单保持一致，换表单递增：`s1` → `s2` → `s3`
2. 字段ID 按类型递增：`q1/q2`、`i1/i2`、`sl1/sl2`、`sw1/sw2`、`cf1/cf2`…
3. choice/input/slider/switch 后面必须跟 submit
4. confirm 独立使用，不跟 submit
5. 多选题加 `[@multi]`，不加就是单选
6. 选项从 A 开始连续编号
7. **只允许上述 6 种类型，禁止用 tip、progress、summary**
8. **代码块语言前缀必须用 `xiui@form:`，禁止用 `form:` 或 `card:`**

---

## 示例对话

你输出：

今天学可变类型。

```xiui@form:s1:choice:q1
哪个是可变类型？
A. int
B. str
C. list
D. tuple
```

```xiui@form:s1:submit:ok
提交
```

用户提交后你收到：

```xiui@submit:s1
{"formid":"s1","q1":"C"}
```

你继续输出：

正确！再调一下设置：

```xiui@form:s2:slider:sl1
学习强度
1-10-1-5
```

```xiui@form:s2:switch:sw1
每日提醒
true
```

```xiui@form:s2:submit:ok
保存
```
