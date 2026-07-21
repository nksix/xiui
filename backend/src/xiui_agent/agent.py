"""LangGraph 自适应学习 Agent."""

import json
import os
from pathlib import Path
from typing import TypedDict, Annotated

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage


# ── LLM 工厂 ─────────────────────────────────────────────────
def _create_llm(streaming: bool = False) -> ChatOpenAI:
    """从环境变量创建 LLM 实例."""
    return ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.7,
        streaming=streaming,
        base_url=os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1"),
    )


# ── 提示词 ────────────────────────────────────────────────────
_PROMPT_PATH = Path(__file__).parent.parent.parent.parent / "spec" / "prompt.md"
_XIUI_PROTOCOL = _PROMPT_PATH.read_text(encoding="utf-8")

_TEACHING_FLOW = """
你是专业的一对一自适应学习辅导老师，遵循五阶段自适应教学引擎。

**你既是老师，也是引擎。你自己控制阶段流转，不要等用户说'下一步'。**

## 五阶段流程

| 阶段 | 做什么 | 怎么输出XIUI |
|------|--------|-------------|
| **1. 设定目标** | 确定学什么、到什么程度。先问学生想学什么，给出学习目标建议 | choice 让用户选择学习范围 + submit |
| **2. 诊断** | 测当前水平，找薄弱点和误区。出 1-2 道诊断题 | choice 选择题 + submit |
| **3. 教学** | 针对诊断出的薄弱点讲解，建立正确认知。讲完一个概念后用 confirm 确认理解 | confirm 确认理解 |
| **4. 靶向练习** | 针对薄弱点出题，刻意练习。难度略高于诊断。答对继续，答错回到教学 | choice/input 练习题 + submit |
| **5. 评估** | 测掌握度变化，决定下一步 | confirm 确认是否继续 |

## 自适应逻辑（你必须自主执行）

- **诊断 → 教学**：根据诊断答错的知识点，决定教学内容和难度。答对的跳过不教
- **练习 → 教学/评估**：练习连续答对 → 推进到评估；答错 → 回到教学，换个角度再讲
- **评估 → 诊断/完成**：评估通过 → 回到诊断开始新知识点；未通过 → 回到教学重点补习

## 阶段流转规则

收到用户 XIUI 提交后，**自动推进阶段**：
- 目标设定提交 → 进入诊断
- 诊断提交 → 进入教学
- 教学 confirm"懂了" → 进入靶向练习；confirm"没懂" → 继续教学
- 靶向练习提交且答对 → 继续练习或推进评估；答错 → 回到教学
- 评估 confirm"继续" → 进入新知识点的诊断；confirm"复习" → 回到教学

**不要输出"让我们进入XX阶段"这种话，直接在该阶段的行为中体现即可。**
"""

XIUI_SYSTEM_PROMPT = _XIUI_PROTOCOL + "\n\n" + _TEACHING_FLOW


# ── State ─────────────────────────────────────────────────────
class TutorState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    phase: str  # goal_setting | diagnose | teach | practice | evaluate


PHASES = ["goal_setting", "diagnose", "teach", "practice", "evaluate"]


def _next_phase(current: str) -> str:
    idx = PHASES.index(current)
    return PHASES[(idx + 1) % len(PHASES)]


# ── Agent Node ────────────────────────────────────────────────
def _build_messages(state: TutorState) -> list[BaseMessage]:
    """将 state 转换为 LLM 消息列表，加入阶段提示."""
    phase = state.get("phase", "goal_setting")
    messages: list[BaseMessage] = [SystemMessage(content=XIUI_SYSTEM_PROMPT)]

    phase_hints = {
        "goal_setting": '\n\n【当前阶段：设定目标】先问学生想学什么，给出学习范围选项让学生选择。用 choice + submit。',
        "diagnose": '\n\n【当前阶段：诊断】出一道诊断选择题，测试学生的当前水平。用 choice + submit。一次 1-2 题。',
        "teach": '\n\n【当前阶段：教学】针对诊断中的薄弱点进行讲解。讲完后用 confirm 确认学生是否理解。不要出题，只讲概念。',
        "practice": '\n\n【当前阶段：靶向练习】出练习题，难度略高于诊断题。答对了简短表扬后继续出题，连续答对 2 题后推进到评估。答错了回到教学。用 choice/input + submit。',
        "evaluate": '\n\n【当前阶段：评估】总结学生掌握情况，用 confirm 询问"继续学习新知识点"还是"再复习一遍"。',
    }
    messages.append(SystemMessage(content=phase_hints.get(phase, "")))

    # 保留最近 20 条消息避免上下文过长
    history = state.get("messages", [])[-20:]
    for m in history:
        if isinstance(m, SystemMessage):
            continue
        messages.append(m)

    return messages


def _detect_phase_from_messages(state: TutorState) -> str:
    """根据最近的消息内容推断下一阶段."""
    messages = state.get("messages", [])
    phase = state.get("phase", "goal_setting")

    # 查找最近的用户提交
    has_submit = False
    last_user_data: dict[str, str] = {}
    last_ai = ""

    for m in reversed(messages):
        content = m.content if hasattr(m, "content") else str(m)
        if isinstance(m, HumanMessage) and "xiui@submit" in content:
            has_submit = True
            try:
                json_start = content.index("{")
                json_end = content.rindex("}") + 1
                last_user_data = json.loads(content[json_start:json_end])
            except (ValueError, json.JSONDecodeError):
                pass
            break
        if isinstance(m, AIMessage) and not last_ai:
            last_ai = content[:500] if content else ""

    if not has_submit:
        return phase

    # 五阶段流转逻辑
    if phase == "goal_setting":
        return "diagnose"

    if phase == "diagnose":
        return "teach"

    if phase == "teach":
        # confirm 提交的数据中 cf* 字段表示用户的选择
        for k, v in last_user_data.items():
            if k.startswith("cf"):
                if "懂" in str(v) or "是" in str(v) or "会" in str(v):
                    return "practice"
                return "teach"  # 没懂，继续教
        # 没有 confirm 数据，默认推进到练习
        return "practice"

    if phase == "practice":
        # 检查是否提到了评估/总结
        if "评估" in last_ai or "总结" in last_ai or "掌握" in last_ai:
            return "evaluate"
        # 检查提交的答案是否正确（通过 AI 上一轮的暗示）
        if "对" in last_ai or "正确" in last_ai or "很好" in last_ai:
            return "evaluate"
        return "teach"  # 答错，回到教学

    if phase == "evaluate":
        for k, v in last_user_data.items():
            if k.startswith("cf"):
                if "继续" in str(v) or "新" in str(v):
                    return "diagnose"  # 进入新知识点
                return "teach"  # 复习
        return "diagnose"

    return phase


def agent_node(state: TutorState) -> dict:
    """核心 Agent 节点：调用 LLM 生成响应."""
    llm = _create_llm(streaming=False)
    messages = _build_messages(state)
    response = llm.invoke(messages)

    # 自动检测下一阶段
    next_phase = _detect_phase_from_messages(state)

    return {
        "messages": [response],
        "phase": next_phase,
    }


# ── Graph 构建 ────────────────────────────────────────────────
def build_graph() -> StateGraph:
    """构建自适应学习 Agent 图."""
    builder = StateGraph(TutorState)

    builder.add_node("agent", agent_node)

    builder.add_edge(START, "agent")
    builder.add_edge("agent", END)

    return builder.compile(checkpointer=MemorySaver())


def create_agent():
    """创建 Agent 实例."""
    return build_graph()


# ── 便捷调用 ──────────────────────────────────────────────────
async def run_agent(messages: list[dict], phase: str = "goal_setting") -> dict:
    """运行 Agent，返回 AI 响应和更新后的阶段."""
    graph = build_graph()

    # 转换消息格式
    converted = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "user":
            converted.append(HumanMessage(content=content))
        elif role == "assistant":
            converted.append(AIMessage(content=content))
        elif role == "system":
            converted.append(SystemMessage(content=content))

    config = {"configurable": {"thread_id": "default"}}
    result = await graph.ainvoke(
        {"messages": converted, "phase": phase},
        config=config,
    )

    last_msg = result["messages"][-1]
    return {
        "content": last_msg.content,
        "phase": result["phase"],
    }


async def stream_agent(messages: list[dict], phase: str = "goal_setting"):
    """流式运行 Agent，逐块 yield 内容."""
    llm = _create_llm(streaming=True)

    # 构建消息
    phase_hints = {
        "goal_setting": "【当前阶段：设定目标】先问学生想学什么，用 choice + submit。",
        "diagnose": "【当前阶段：诊断】出一道诊断选择题测试水平，用 choice + submit。",
        "teach": "【当前阶段：教学】针对薄弱点讲解，讲完用 confirm 确认理解。不要出题。",
        "practice": "【当前阶段：靶向练习】出练习题，答对推进、答错回教学。用 choice/input + submit。",
        "evaluate": "【当前阶段：评估】总结掌握情况，用 confirm 询问继续还是复习。",
    }

    llm_messages: list[BaseMessage] = [
        SystemMessage(content=XIUI_SYSTEM_PROMPT),
        SystemMessage(content=phase_hints.get(phase, "")),
    ]
    for m in messages[-20:]:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "user":
            llm_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            llm_messages.append(AIMessage(content=content))

    # 流式调用
    chunks = []
    async for chunk in llm.astream(llm_messages):
        text = chunk.content if hasattr(chunk, "content") else ""
        if text:
            chunks.append(text)
            yield text

    # 推断下一阶段
    full = "".join(chunks)
    phase = _detect_phase_from_messages({
        "messages": [AIMessage(content=full)],
        "phase": phase,
    })
    yield {"phase": phase}
