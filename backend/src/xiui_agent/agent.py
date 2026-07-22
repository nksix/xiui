"""ReAct Agent — 自适应学习智能体，使用文件工具持久化学生状态."""

import os
from pathlib import Path
from typing import AsyncIterator

from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage

from .tools import (
    read_student_index,
    write_student_index,
    read_topic_file,
    write_topic_file,
)

# ── LLM ───────────────────────────────────────────────────────
def _create_llm(streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.7,
        streaming=streaming,
        base_url=os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1"),
    )


# ── 提示词 ────────────────────────────────────────────────────
_PROMPT_PATH = Path(__file__).parent.parent.parent.parent / "spec" / "prompt.md"
_XIUI_PROTOCOL = _PROMPT_PATH.read_text(encoding="utf-8")

_SYSTEM_PROMPT = f"""{_XIUI_PROTOCOL}

---

你是专业的一对一自适应学习辅导老师。你拥有文件工具来记录和读取学生的学习状态。

## 核心教学原则

1. **先了解再教学**：第一次对话先问学生想学什么，用 `read_student_index` 了解背景。
2. **诊断先行**：开始新知识点时，用 `read_topic_file` 检查详情。没有诊断记录就先出诊断题。
3. **靶向教学**：根据诊断结果（薄弱点），针对性讲解。讲完用 confirm 确认理解。
4. **刻意练习**：出练习题巩固，用 `write_topic_file` 记录对错。连续答对推进，答错回到教学。
5. **闭环评估**：知识点掌握后用 `write_topic_file` 标记完成，同步更新 `write_student_index` 中的状态。

## 工具使用指南

你有 4 个工具管理学生的学习状态，数据存储在 `students/{{学生名}}/` 目录下：

- `read_student_index()` — 读取 **索引文件**，查看所有知识点的概览表格。**对话开始时先调用。**
- `write_student_index(content)` — 写入索引文件。新建学生或更新知识点列表状态时使用。
- `read_topic_file(topic)` — 读取**单个知识点**的详细文件（目标、诊断、薄弱点、练习、历史）。
- `write_topic_file(topic, content)` — 写入知识点文件。新建或更新当前知识点的详细信息。

### 典型流程

1. `read_student_index()` 看整体进度
2. `read_topic_file("当前知识点")` 看详情
3. 教学交互（诊断、讲解、练习）
4. `write_topic_file("当前知识点", content)` 更新进度
5. `write_student_index(content)` 同步索引表格（状态、正确/错误数）
6. 完成后回到步骤 2，切换知识点

### 文件格式约定

**索引文件（_index.md）：**
```markdown
# 张三 的学习状态

> 创建于 ... | 更新于 ...

## 知识点列表

| 知识点 | 状态 | 正确 | 错误 | 薄弱点 |
|--------|------|------|------|--------|
| 勾股定理 | 学习中 | 5 | 2 | 公式记忆 |
| 二次函数 | 已完成 | 10 | 3 | 无 |

---
当前：勾股定理
```

**知识点文件：**
```markdown
# 勾股定理

- **状态**：学习中
- **目标**：...
- **诊断**：...
- **薄弱点**：...
- **练习**：正确 N | 错误 M

## 历史

| 时间 | 类型 | 正确 | 内容 |
|------|------|------|------|
| ... | 诊断/练习/完成 | ✅/❌/- | ... |
```

## 对话风格

- 你是老师，主动引导学生，不要等学生说「下一步」
- 讲解清晰易懂，适当举例
- XIUI 组件和普通 Markdown 配合使用，讲解在外面，交互在里面
- 有 choice/input/slider/switch 时加 submit；纯二选一确认用 confirm

## XIUI 格式提醒

choice + submit 是两个独立的代码块，不是合在一起的：
```xiui@form:s1:choice:q1
题目
A. ...
B. ...
```
```xiui@form:s1:submit:ok
提交
```

confirm 自带提交，不需要 submit：
```xiui@form:s1:confirm:cf1
**标题**

> 按钮1 | 按钮2
```
"""


# ── 工具列表 ───────────────────────────────────────────────────
TOOLS = [read_student_index, write_student_index, read_topic_file, write_topic_file]


TOOL_LABELS = {
    "read_student_index": "正在读取学习进度...",
    "write_student_index": "正在保存学习进度...",
    "read_topic_file": "正在读取知识点...",
    "write_topic_file": "正在保存知识点...",
}


# ── Agent 创建 ─────────────────────────────────────────────────
def create_agent(streaming: bool = False):
    """创建 ReAct agent 实例."""
    llm = _create_llm(streaming=streaming)
    return create_react_agent(
        model=llm,
        tools=TOOLS,
        checkpointer=MemorySaver(),
        prompt=_SYSTEM_PROMPT,
    )


# ── 流式调用 ───────────────────────────────────────────────────
async def stream_agent(messages: list[dict]) -> AsyncIterator:
    """流式运行 ReAct agent，逐块 yield 文本或工具调用信息."""
    agent = create_agent(streaming=True)

    lc_messages: list[BaseMessage] = []
    for m in messages[-20:]:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))

    config = {"configurable": {"thread_id": "default"}}

    seen_tools: set[str] = set()
    tool_result_summary = ""  # 最近一次工具返回的摘要

    async for event in agent.astream(
        {"messages": lc_messages},
        config=config,
        stream_mode="messages",
    ):
        if isinstance(event, tuple):
            chunk, meta = event

            # 捕获推理模型的思考过程（DeepSeek-R1 / o1 等）
            addl = getattr(chunk, "additional_kwargs", {}) or {}
            reasoning = addl.get("reasoning_content", "")
            if reasoning:
                yield {"reasoning": reasoning}

            # 检测工具调用
            tool_calls = getattr(chunk, "tool_calls", None)
            if tool_calls:
                for tc in tool_calls:
                    name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                    if name and name not in seen_tools:
                        seen_tools.add(name)
                        label = TOOL_LABELS.get(name, name)
                        yield {"tool": name, "label": f"调用工具：{label}"}

            # 工具返回 → 摘取摘要送入思考面板
            node = meta.get("langgraph_node", "")
            if node == "tools":
                tc = getattr(chunk, "content", "")
                if tc and isinstance(tc, str) and tool_result_summary != tc[:200]:
                    tool_result_summary = tc[:200]
                    # 取第一行有效内容作为摘要
                    first_line = tc.strip().split("\n")[0].strip()
                    if first_line and not first_line.startswith("#"):
                        first_line = first_line[:100]
                        yield {"reasoning": f"获取结果：{first_line}..."}

            # 输出文本内容（跳过工具调用块和工具回复块）
            content = getattr(chunk, "content", "")
            if content and isinstance(content, str) and not tool_calls:
                # 跳过 ToolMessage 的回显
                msg_type = getattr(chunk, "type", "")
                if msg_type != "tool":
                    yield content
