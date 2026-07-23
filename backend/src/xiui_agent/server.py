"""FastAPI 服务端 — 静态文件 + /api/chat 流式接口."""

import json
import re
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from .agent import stream_agent

# 加载 .env（从项目根目录）
load_dotenv(Path(__file__).parent.parent.parent.parent / ".env")

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

app = FastAPI(title="XIUI Agent", description="自适应学习智能体后端")


# ── 静态文件 ──────────────────────────────────────────────────
NODE_MODULES = FRONTEND_DIR / "node_modules"
if NODE_MODULES.exists():
    app.mount("/npm", StaticFiles(directory=str(NODE_MODULES)), name="npm")


@app.get("/examples/")
@app.get("/examples/index.html")
async def examples_index():
    return FileResponse(FRONTEND_DIR / "examples" / "index.html")


@app.get("/src/{path:path}")
async def src_files(path: str):
    return FileResponse(FRONTEND_DIR / "src" / path,
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/lib/{path:path}")
async def lib_files(path: str):
    return FileResponse(FRONTEND_DIR / "lib" / path,
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "examples" / "index.html")


# ── API ───────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── 知识图谱 ──────────────────────────────────────────────────
_COURSE_CACHE = {}
_STUDENTS_DIR = PROJECT_ROOT / "backend" / "data" / "students"
_DATA_DIR = PROJECT_ROOT / "backend" / "data"


@app.get("/api/course")
async def get_course():
    """返回课程知识图谱配置."""
    course_file = _DATA_DIR / "courses" / "computer_vision.json"
    if "cv" not in _COURSE_CACHE:
        _COURSE_CACHE["cv"] = json.loads(course_file.read_text(encoding="utf-8"))
    return _COURSE_CACHE["cv"]


def _parse_topic_stats(text: str) -> dict:
    """从 topic markdown 文件中提取统计数据."""
    stats = {"status": "未开始", "correct": 0, "wrong": 0, "last_time": "", "diagnosis": "", "weak_points": ""}

    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if line.startswith("- **状态**："):
            stats["status"] = line.split("：", 1)[-1].strip()
        elif line.startswith("- **诊断**："):
            stats["diagnosis"] = line.split("：", 1)[-1].strip()
        elif line.startswith("- **薄弱点**："):
            stats["weak_points"] = line.split("：", 1)[-1].strip()
        elif line.startswith("- **练习**："):
            parts = line.split("|")
            if len(parts) >= 2:
                try:
                    stats["correct"] = int(parts[0].split("正确")[-1].strip())
                except: pass
                try:
                    stats["wrong"] = int(parts[1].split("错误")[-1].strip())
                except: pass
        elif line.startswith("| 2") and "|" in line and stats["last_time"] == "":
            # 取历史表格第一行的时间
            cols = [c.strip() for c in line.split("|") if c.strip()]
            if cols:
                stats["last_time"] = cols[0]

    return stats


def _match_node(node, topic_name: str) -> bool:
    """判断 node 是否匹配 topic 名称."""
    return topic_name in node["name"] or node["name"] in topic_name or node["id"] in topic_name


@app.get("/api/course/progress")
async def get_progress(student: str = ""):
    """返回学生在课程上的学习进度（带节点统计数据）."""
    if not student:
        return {"error": "student param required"}
    course_file = _DATA_DIR / "courses" / "computer_vision.json"
    course = json.loads(course_file.read_text(encoding="utf-8"))
    edges = course.get("edges", [])

    # 读取学生目录下的 topic 文件
    student_dir = _STUDENTS_DIR / student
    topic_stats = {}  # node_id → stats

    if student_dir.exists():
        # 读取 _index.md 获取当前主题
        index_file = student_dir / "_index.md"
        current_topic_name = None
        if index_file.exists():
            index_text = index_file.read_text(encoding="utf-8")
            for line in index_text.splitlines():
                if "当前" in line and "：" in line:
                    current_topic_name = line.split("：", 1)[-1].strip()
                    break

        # 读取每个 topic 文件并匹配 node
        topic_files = list(student_dir.glob("*.md"))
        for tf in topic_files:
            if tf.name == "_index.md":
                continue
            text = tf.read_text(encoding="utf-8")
            for node in course["nodes"]:
                if _match_node(node, tf.stem) or _match_node(node, text[:100]):
                    topic_stats[node["id"]] = _parse_topic_stats(text)
                    break

        # 标记当前节点
        if current_topic_name:
            for node in course["nodes"]:
                if _match_node(node, current_topic_name) and node["id"] not in topic_stats:
                    topic_stats[node["id"]] = {"status": "学习中", "correct": 0, "wrong": 0, "last_time": "", "diagnosis": "", "weak_points": ""}
                    break

    # 已完成的节点列表
    completed = [nid for nid, s in topic_stats.items() if "完成" in s["status"] or s["status"] == "诊断完成"]

    # 计算 progress% 和 stage
    def calc_progress(s: dict) -> int:
        total = s["correct"] + s["wrong"]
        if total == 0:
            return 0
        return round(s["correct"] / total * 100)

    def determine_stage(s: dict, node_id: str) -> str:
        if s["status"] == "未开始":
            return "locked"
        if "完成" in s["status"]:
            return "completed"
        if "诊断" in s["status"] and "中" not in s["status"]:
            return "diagnosed"
        if "学习" in s["status"]:
            return "learning"
        return "unlocked"

    # 构建返回的节点列表
    node_list = []
    for node in course["nodes"]:
        nid = node["id"]
        s = topic_stats.get(nid, {"status": "未开始", "correct": 0, "wrong": 0, "last_time": "", "diagnosis": "", "weak_points": ""})

        # 判断是否锁定
        stage = determine_stage(s, nid)
        if stage == "locked":
            prereqs = [e["from"] for e in edges if e["to"] == nid]
            if not prereqs or any(p in completed for p in prereqs):
                stage = "unlocked"

        total_attempts = s["correct"] + s["wrong"]
        node_list.append({
            "id": nid,
            "name": node["name"],
            "brief": node["brief"],
            "x": node["x"],
            "y": node["y"],
            "stage": stage,
            "progress": calc_progress(s) if total_attempts > 0 else 0,
            "correct": s["correct"],
            "wrong": s["wrong"],
            "totalAttempts": total_attempts,
            "lastActivity": s["last_time"] or "—",
            "diagnosis": s["diagnosis"] or "",
        })

    return {
        "courseId": course["id"],
        "courseName": course["name"],
        "nodes": node_list,
        "edges": edges,
    }


@app.post("/api/chat")
async def chat(request: Request):
    """流式聊天接口（SSE）."""
    body = await request.json()
    message = body.get("message", "")
    history = body.get("history", [])

    parsed_history = []
    if isinstance(history, str):
        try:
            parsed_history = json.loads(history)
        except json.JSONDecodeError:
            parsed_history = []
    elif isinstance(history, list):
        parsed_history = history

    async def event_stream():
        try:
            # 发送初始状态
            yield f"data: {json.dumps({'status': 'thinking', 'message': '正在思考...'})}\n\n"

            # 构建消息
            user_message = message + "\n\n严格遵循 XIUI 协议 回复"
            messages = parsed_history + [{"role": "user", "content": user_message}]

            async for chunk in stream_agent(messages):
                yield "data: " + json.dumps(chunk) + "\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── 启动入口 ──────────────────────────────────────────────────
def main():
    import uvicorn
    uvicorn.run("xiui_agent.server:app", host="0.0.0.0", port=3000, reload=True)
