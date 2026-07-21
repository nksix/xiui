"""ReAct Agent 文件工具 — 按学生分目录，索引+分文件管理学习状态."""

import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
STUDENTS_DIR = DATA_DIR / "students"

_INDEX_FILE = "_index.md"
# 文件名中不允许的字符
_FILENAME_CLEAN_RE = re.compile(r'[\\/:*?"<>|]')


def _get_student_dir() -> Path | None:
    """找到当前学生目录。只有 1 个学生时直接用，多个时选 _index.md 最新的."""
    if not STUDENTS_DIR.exists():
        return None
    dirs = [d for d in STUDENTS_DIR.iterdir() if d.is_dir() and (d / _INDEX_FILE).exists()]
    if not dirs:
        return None
    if len(dirs) == 1:
        return dirs[0]
    # 多个学生：选 _index.md 修改时间最新的
    return max(dirs, key=lambda d: (d / _INDEX_FILE).stat().st_mtime)


def _get_or_create_student_dir(student_name: str) -> Path:
    """获取或创建学生目录."""
    safe_name = _FILENAME_CLEAN_RE.sub('_', student_name.strip())
    if not safe_name:
        safe_name = "学生"
    d = STUDENTS_DIR / safe_name
    d.mkdir(parents=True, exist_ok=True)
    return d


def _make_topic_filename(topic: str) -> str:
    """将知识点名称转为安全的文件名."""
    safe = _FILENAME_CLEAN_RE.sub('_', topic.strip())
    return f"{safe}.md" if safe else "unknown.md"


# ── 工具函数 ───────────────────────────────────────────────────

def read_student_index() -> str:
    """读取当前学生的索引文件（_index.md），了解所有知识点的概览。

    包含学生名、创建时间、知识点列表表格（状态/正确/错误/薄弱点）。
    **每次对话开始时先调用本工具。**
    """
    STUDENTS_DIR.mkdir(parents=True, exist_ok=True)
    student_dir = _get_student_dir()
    if student_dir is None:
        return (
            "暂无学生记录。请先询问学生名字，然后告诉学生你需要用 "
            "`write_student_index` 创建索引文件，格式参考：\n\n"
            "# 张三 的学习状态\n\n"
            "> 创建于 (时间) | 无学习记录\n\n"
            "---\n\n"
            "> 暂无学习记录。请开始第一个知识点。"
        )
    index_path = student_dir / _INDEX_FILE
    if index_path.exists():
        return index_path.read_text(encoding="utf-8")
    return "索引文件不存在，请用 write_student_index 创建。"


def write_student_index(content: str) -> str:
    """写入当前学生的索引文件。

    用于首次创建学生档案，或更新知识点列表中的状态信息。
    内容格式参考 read_student_index 返回的格式。

    如果还没有学生目录，会自动创建。学生名从 Markdown 标题（# xxx 的学习状态）中提取。
    """
    STUDENTS_DIR.mkdir(parents=True, exist_ok=True)

    # 从头部的 '# xxx 的学习状态' 提取学生名
    name_match = re.match(r'^#\s+(.+?)的?学习状态', content.strip())
    if name_match:
        student_name = name_match.group(1).strip()
    else:
        student_dir = _get_student_dir()
        if student_dir is None:
            return "错误：无法确定学生名。请在第一行写 '# 学生名 的学习状态'。"
        student_name = student_dir.name

    student_dir = _get_or_create_student_dir(student_name)
    (student_dir / _INDEX_FILE).write_text(content, encoding="utf-8")
    return f"已保存学生「{student_name}」的索引文件"


def read_topic_file(topic: str) -> str:
    """读取指定知识点的详细文件。

    Args:
        topic: 知识点名称，如 '勾股定理'、'数据标注'
    """
    student_dir = _get_student_dir()
    if student_dir is None:
        return "暂无学生记录。请先创建学生索引。"

    filename = _make_topic_filename(topic)
    filepath = student_dir / filename
    if filepath.exists():
        return filepath.read_text(encoding="utf-8")
    return f"知识点「{topic}」的文件不存在（文件名：{filename}）。需要用 write_topic_file 创建。"


def write_topic_file(topic: str, content: str) -> str:
    """写入/更新知识点的详细文件。

    Args:
        topic: 知识点名称
        content: 完整的 Markdown 内容，包含目标、状态、诊断、薄弱点、练习记录、历史表格
    """
    student_dir = _get_student_dir()
    if student_dir is None:
        return "错误：还没有学生记录。请先用 write_student_index 创建学生档案。"

    filename = _make_topic_filename(topic)
    filepath = student_dir / filename
    filepath.write_text(content, encoding="utf-8")
    return f"已保存知识点「{topic}」→ {filename}"
