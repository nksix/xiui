"""FastAPI 服务端 — 静态文件 + /api/chat 流式接口."""

import json
import asyncio
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
# npm 包映射（markdown-it, katex, highlight.js）
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

    PHASE_LABELS = {
        "goal_setting": "正在设定学习目标...",
        "diagnose": "正在诊断知识水平...",
        "teach": "正在针对性教学...",
        "practice": "正在出靶向练习题...",
        "evaluate": "正在评估掌握情况...",
    }

    PHASE_REASONING = {
        "goal_setting": "先了解学生想学什么，确定学习范围和目标。",
        "diagnose": "通过诊断题测试学生当前水平，找出薄弱点和误区。",
        "teach": "针对诊断出的薄弱点进行讲解，建立正确认知。",
        "practice": "出靶向练习题，刻意练习薄弱点，根据表现决定推进还是回退。",
        "evaluate": "总结掌握情况，根据评估结果决定继续新知识点还是复习。",
    }

    async def event_stream():
        try:
            phase = "goal_setting"
            thinking_sent = False

            # 发送阶段状态
            yield f"data: {json.dumps({'status': 'thinking', 'message': PHASE_LABELS.get(phase, '思考中...')})}\n\n"

            # 构建消息
            user_message = message + "\n\n严格遵循 XIUI 协议 回复"
            messages = parsed_history + [{"role": "user", "content": user_message}]

            async for chunk in stream_agent(messages, phase):
                if isinstance(chunk, dict) and "phase" in chunk:
                    # 阶段更新
                    new_phase = chunk["phase"]
                    if new_phase != phase:
                        phase = new_phase
                        yield f"data: {json.dumps({'status': 'thinking', 'message': PHASE_LABELS.get(phase, '思考中...')})}\n\n"
                else:
                    if not thinking_sent:
                        # 把思考过程作为对话内容输出，保证用户能看到
                        thinking_sent = True
                        thinking_text = PHASE_REASONING.get(phase, '分析中...')
                        yield f"data: {json.dumps({'content': f'*🤔 {thinking_text}*'})}\n\n"
                    yield f"data: {json.dumps({'content': chunk})}\n\n"

            yield f"data: {json.dumps({'done': True, 'phase': phase})}\n\n"
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
