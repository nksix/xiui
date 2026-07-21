"""ReAct Agent — 自适应学习智能体，使用文件工具持久化学生状态."""

import os
from pathlib import Path
from typing import AsyncIterator

from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage

from .tools import (
    get_student_state,
    update_student_state,
    start_topic,
    record_diagnose,
    update_weak_points,
    record_practice,
    mark_topic_complete,
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

1. **先了解再教学**：第一次对话先问学生想学什么，用 start_topic 记录知识点和目标。
2. **诊断先行**：开始新知识点时，用 get_student_state 检查状态。如果该知识点没有诊断记录，先出诊断题。
3. **靶向教学**：根据诊断结果（薄弱点），针对性讲解。讲完用 confirm 确认理解。
4. **刻意练习**：出练习题巩固，用 record_practice 记录对错。连续答对推进，答错回到教学。
5. **闭环评估**：知识点掌握后用 mark_topic_complete 标记完成，用 confirm 询问继续还是学新知识点。

## 工具使用指南

- **对话开始时**先调用 `get_student_state()` 了解当前状态
- 确定学习目标后调用 `start_topic(topic, goal)` 创建知识点记录
- 每次诊断后调用 `record_diagnose(topic, result)` 和 `update_weak_points(topic, points)`
- 每次练习后调用 `record_practice(topic, correct, note)`
- 完成知识点后调用 `mark_topic_complete(topic, summary)`

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
TOOLS = [
    get_student_state,
    update_student_state,
    start_topic,
    record_diagnose,
    update_weak_points,
    record_practice,
    mark_topic_complete,
]


# ── 工具名称 → 中文描述 ────────────────────────────────────────
TOOL_LABELS = {
    "get_student_state": "正在查询学习进度...",
    "update_student_state": "正在更新学生信息...",
    "start_topic": "正在创建学习知识点...",
    "record_diagnose": "正在记录诊断结果...",
    "update_weak_points": "正在更新薄弱点...",
    "record_practice": "正在记录练习结果...",
    "mark_topic_complete": "正在标记知识点完成...",
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

    async for event in agent.astream(
        {"messages": lc_messages},
        config=config,
        stream_mode="messages",
    ):
        if isinstance(event, tuple):
            chunk, meta = event

            # 检测工具调用
            tool_calls = getattr(chunk, "tool_calls", None)
            if tool_calls:
                for tc in tool_calls:
                    name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                    if name and name not in seen_tools:
                        seen_tools.add(name)
                        yield {"tool": name, "label": TOOL_LABELS.get(name, f"正在执行 {name}...")}

            # 输出文本内容（跳过工具调用块和工具回复块）
            content = getattr(chunk, "content", "")
            if content and isinstance(content, str) and not tool_calls:
                # 跳过 ToolMessage 的回显
                msg_type = getattr(chunk, "type", "")
                if msg_type != "tool":
                    yield content
