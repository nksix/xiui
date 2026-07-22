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
    return FileResponse(FRONTEND_DIR / "src" / path)


@app.get("/lib/{path:path}")
async def lib_files(path: str):
    return FileResponse(FRONTEND_DIR / "lib" / path)


@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "examples" / "index.html")


# ── API ───────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── 知识图谱 ──────────────────────────────────────────────────
_COURSE_CACHE = {}
_STUDENTS_DIR = PROJECT_ROOT / "data" / "students"


@app.get("/api/course")
async def get_course():
    """返回课程知识图谱配置."""
    course_file = PROJECT_ROOT / "data" / "courses" / "computer_vision.json"
    if "cv" not in _COURSE_CACHE:
        _COURSE_CACHE["cv"] = json.loads(course_file.read_text(encoding="utf-8"))
    return _COURSE_CACHE["cv"]


@app.get("/api/course/progress")
async def get_progress(student: str = ""):
    """返回学生在课程上的学习进度."""
    if not student:
        return {"error": "student param required"}
    course_file = PROJECT_ROOT / "data" / "courses" / "computer_vision.json"
    course = json.loads(course_file.read_text(encoding="utf-8"))
    node_ids = [n["id"] for n in course["nodes"]]
    edges = course.get("edges", [])

    # 通过读取学生目录来判断进度
    student_dir = _STUDENTS_DIR / student
    completed = []
    current = None

    if student_dir.exists():
        # 从 _index.md 读取当前主题
        index_file = student_dir / "_index.md"
        if index_file.exists():
            index_text = index_file.read_text(encoding="utf-8")
            for line in index_text.splitlines():
                if "当前" in line and "：" in line:
                    topic_name = line.split("：")[-1].strip()
                    for node in course["nodes"]:
                        if topic_name in node["name"] or node["name"] in topic_name:
                            current = node["id"]
                            break
                    break

        # 已完成的：非 _index.md 的 topic 文件
        topic_files = list(student_dir.glob("*.md"))
        for tf in topic_files:
            if tf.name == "_index.md":
                continue
            text = tf.read_text(encoding="utf-8")
            for node in course["nodes"]:
                if node["name"] in text or f"#{node['id']}" in text:
                    if node["id"] not in completed and node["id"] != current:
                        completed.append(node["id"])
                    break

    # 锁定的：前置依赖未完成
    locked = []
    for node in course["nodes"]:
        if node["id"] in completed or node["id"] == current:
            continue
        prereqs = [e["from"] for e in edges if e["to"] == node["id"]]
        if prereqs and not all(p in completed for p in prereqs):
            locked.append(node["id"])

    return {
        "nodes": node_ids,
        "completed": completed,
        "current": current or node_ids[0],
        "locked": locked,
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
                if isinstance(chunk, dict) and "tool" in chunk:
                    # 工具调用 → 显示在思考面板
                    label = chunk["label"]
                    yield "data: " + json.dumps({"reasoning_content": "🔧 " + label}) + "\n\n"
                elif isinstance(chunk, dict) and "reasoning" in chunk:
                    # 模型推理过程 → 思考面板
                    yield "data: " + json.dumps({"reasoning_content": chunk["reasoning"]}) + "\n\n"
                else:
                    # 文本内容
                    yield f"data: {json.dumps({'content': chunk})}\n\n"

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
