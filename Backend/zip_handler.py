import os
import zipfile
import io

# File extensions we treat as analysable source code.
CODE_EXTENSIONS = {
    ".java", ".py", ".js", ".jsx", ".ts", ".tsx",
    ".cob", ".cbl", ".cobol", ".cpy",
    ".sql", ".pls", ".plsql", ".pks", ".pkb",
    ".f", ".f90", ".f77", ".for",
    ".vb", ".vbs", ".bas",
    ".c", ".h", ".cpp", ".hpp", ".cs",
    ".rb", ".php", ".go", ".rs", ".kt", ".scala",
    ".pl", ".pm", ".sh",
    ".xml", ".jsp", ".asp", ".aspx",
}

# Directories never worth pulling into the analysis.
SKIP_DIR_NAMES = {
    "node_modules", ".git", ".svn", ".hg", "__pycache__",
    "venv", ".venv", "env", "dist", "build", "target",
    ".idea", ".vscode", "vendor", ".pytest_cache",
}

MAX_FILES = 200
MAX_TOTAL_BYTES = 8 * 1024 * 1024  # 8MB combined cap, safety net


def _is_within_skip_dir(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    return any(p in SKIP_DIR_NAMES for p in parts)


def extract_code_files(zip_bytes: bytes) -> list[dict]:
    """
    Extract all analysable source files from a zip archive, recursing
    through nested folders. Returns a list of {"path": str, "content": str}
    dicts, sorted by path for deterministic ordering.

    Skips binaries, dependency/build folders, and anything outside the
    recognised code extensions. Guards against zip-slip path traversal
    and oversized archives.
    """
    files = []
    total_bytes = 0

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue

            # Normalise and guard against path traversal (zip-slip)
            name = info.filename.replace("\\", "/")
            normalized = os.path.normpath(name)
            if normalized.startswith("..") or normalized.startswith("/"):
                continue

            if _is_within_skip_dir(name):
                continue

            ext = os.path.splitext(name)[1].lower()
            if ext not in CODE_EXTENSIONS:
                continue

            if len(files) >= MAX_FILES:
                break

            try:
                raw = zf.read(info)
            except Exception:
                continue

            total_bytes += len(raw)
            if total_bytes > MAX_TOTAL_BYTES:
                break

            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    text = raw.decode("latin-1")
                except Exception:
                    continue

            files.append({"path": normalized, "content": text})

    files.sort(key=lambda f: f["path"])
    return files


def combine_files(files: list[dict]) -> str:
    """
    Concatenate extracted files into one text blob with clear file
    boundary markers, so the AI can see file structure and reason
    about relationships between files in the same prompt.
    """
    parts = []
    for f in files:
        parts.append(f"// ===== FILE: {f['path']} =====\n{f['content']}\n")
    return "\n".join(parts)