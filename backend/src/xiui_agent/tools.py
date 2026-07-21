"""ReAct Agent 文件工具 — 读写学生状态，持久化学习进度."""

import json
from pathlib import Path
from datetime import datetime
from typing import Any

DATA_DIR = Path(__file__).parent.parent.parent / "data"
STATE_FILE = DATA_DIR / "student_state.json"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_state() -> dict:
    """从文件加载学生状态."""
    _ensure_data_dir()
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {
        "student_name": "",
        "topics": {},
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }


def _save_state(state: dict) -> None:
    """保存状态到文件."""
    _ensure_data_dir()
    state["updated_at"] = datetime.now().isoformat()
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 工具函数（暴露给 Agent）───────────────────────────────────

def get_student_state() -> str:
    """读取当前学生的完整学习状态。
    
    返回 JSON 格式的状态，包含：
    - student_name: 学生名字
    - topics: 按知识点组织的学习记录，每个知识点包含 goal/status/level/notes/history
    """
    state = _load_state()
    return json.dumps(state, ensure_ascii=False, indent=2)


def update_student_state(key: str, value: str) -> str:
    """更新学生状态的顶层字段。key 可选：student_name"""
    state = _load_state()
    if key == "student_name":
        state["student_name"] = value
    else:
        return f"错误：不支持的 key '{key}'，目前只支持 'student_name'"
    _save_state(state)
    return f"已更新 {key} = {value}"


def start_topic(topic: str, goal: str) -> str:
    """开始或切换到一个知识点。如果知识点不存在则创建，否则切换到该知识点。
    
    Args:
        topic: 知识点名称，如 '勾股定理'、'二次函数'
        goal: 学习目标描述
    """
    state = _load_state()
    if topic not in state["topics"]:
        state["topics"][topic] = {
            "goal": goal,
            "status": "learning",
            "diagnose_result": None,
            "weak_points": [],
            "practice_correct": 0,
            "practice_wrong": 0,
            "started_at": datetime.now().isoformat(),
            "history": [],
        }
    state["current_topic"] = topic
    _save_state(state)
    return f"已切换到知识点「{topic}」，目标：{goal}"


def record_diagnose(topic: str, result: str) -> str:
    """记录诊断结果。
    
    Args:
        topic: 知识点名称
        result: 诊断结果描述，如 '基础概念掌握，但应用题薄弱' 或 '不知道勾股定理公式'
    """
    state = _load_state()
    if topic not in state.get("topics", {}):
        return f"错误：知识点「{topic}」不存在，请先调用 start_topic"
    state["topics"][topic]["diagnose_result"] = result
    state["topics"][topic]["history"].append({
        "action": "diagnose",
        "result": result,
        "time": datetime.now().isoformat(),
    })
    _save_state(state)
    return f"已记录「{topic}」的诊断结果"


def update_weak_points(topic: str, points: str) -> str:
    """更新知识点的薄弱环节。
    
    Args:
        topic: 知识点名称
        points: 逗号分隔的薄弱点列表，如 '公式记忆,实际应用,证明过程'
    """
    state = _load_state()
    if topic not in state.get("topics", {}):
        return f"错误：知识点「{topic}」不存在"
    points_list = [p.strip() for p in points.split(",") if p.strip()]
    state["topics"][topic]["weak_points"] = points_list
    _save_state(state)
    return f"已更新「{topic}」的薄弱点：{points_list}"


def record_practice(topic: str, correct: bool, note: str = "") -> str:
    """记录一次练习结果。
    
    Args:
        topic: 知识点名称
        correct: 是否答对
        note: 备注（答对的亮点或答错的原因）
    """
    state = _load_state()
    if topic not in state.get("topics", {}):
        return f"错误：知识点「{topic}」不存在"
    t = state["topics"][topic]
    if correct:
        t["practice_correct"] += 1
    else:
        t["practice_wrong"] += 1
    t["history"].append({
        "action": "practice",
        "correct": correct,
        "note": note,
        "time": datetime.now().isoformat(),
    })
    _save_state(state)
    total = t["practice_correct"] + t["practice_wrong"]
    return f"已记录。当前正确 {t['practice_correct']}/{total}，错误 {t['practice_wrong']}/{total}"


def mark_topic_complete(topic: str, summary: str) -> str:
    """标记知识点为已完成。
    
    Args:
        topic: 知识点名称
        summary: 学习总结
    """
    state = _load_state()
    if topic not in state.get("topics", {}):
        return f"错误：知识点「{topic}」不存在"
    state["topics"][topic]["status"] = "completed"
    state["topics"][topic]["completed_at"] = datetime.now().isoformat()
    state["topics"][topic]["summary"] = summary
    state["topics"][topic]["history"].append({
        "action": "complete",
        "summary": summary,
        "time": datetime.now().isoformat(),
    })
    _save_state(state)
    return f"已标记「{topic}」为已完成"
