import os
import re
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from chunker import chunk_code, count_tokens
from prompts import PROMPTS
from llm import call_llm
from health_score import render_health_score
from zip_handler import extract_code_files, combine_files

FILE_MARKER_RE = re.compile(r"^// ===== FILE: (.+?) =====$", re.MULTILINE)


def _strip_leading_number(text: str) -> str:
    """
    Removes a leading number/bullet the model may have embedded in a
    step string (e.g. "1. ", "Step 2: ", "3) ", "- ") so it doesn't
    double up with the numbered badge the frontend renders around each
    step. Leaves the text untouched if no such pattern is found.
    """
    if not isinstance(text, str):
        return text
    return re.sub(r"^\s*(?:step\s*)?\d+\s*[\.\):]\s*|^\s*[-•]\s*", "", text, flags=re.IGNORECASE)

# Cap concurrent Gemini calls per analysis run. High enough to meaningfully
# speed up large/multi-chunk files, low enough to avoid tripping the
# Gemini free-tier rate limit (which is what caused silent per-mode
# failures earlier when modes were run fully in parallel).
MAX_CONCURRENT_CHUNKS = 4

load_dotenv()

app = FastAPI(title="Legacy Code Analyser API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyseRequest(BaseModel):
    code: str
    mode: str = "explain"
    filename: str = "untitled"


def split_combined_files(code: str) -> list[dict]:
    """
    Splits a combined multi-file blob (built by zip_handler.combine_files)
    back into individual {"path", "content"} entries using the
    "// ===== FILE: path =====" markers. Returns an empty list if no
    markers are found (i.e. this was a plain single-file analyse, not a
    zip upload).
    """
    matches = list(FILE_MARKER_RE.finditer(code))
    if not matches:
        return []

    files = []
    for i, match in enumerate(matches):
        path = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(code)
        content = code[start:end].strip()
        files.append({"path": path, "content": content})
    return files


def run_convert_per_file(code: str) -> dict:
    """
    Convert mode for multi-file zip uploads: calls Gemini once per
    original source file instead of once per chunk, so converted output
    is guaranteed to stay split along the original file boundaries.
    Avoids the failure mode where asking the model to preserve file
    markers inside one big combined response isn't reliably honored,
    collapsing multiple files into a single merged "modern_code" blob.

    Falls back to the normal chunked path (handled by the caller) if the
    input has no file markers - i.e. this is a plain single-file analyse.
    """
    files = split_combined_files(code)
    system_prompt = PROMPTS["convert"]

    def convert_one(f):
        # Keep the file marker in the prompt sent to the model too, so it
        # still has full system context, but we trust our own split for
        # the *output* structure rather than the model's.
        single_file_input = f"// ===== FILE: {f['path']} =====\n{f['content']}"
        result = call_llm(system_prompt, single_file_input)
        print(f"DEBUG PER-FILE CONVERT [{f['path']}]:", result.keys() if isinstance(result, dict) else result)
        return f["path"], result

    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_CHUNKS, len(files))) as executor:
        outcomes = list(executor.map(convert_one, files))

    modern_code = []
    all_changes = []
    all_warnings = []
    failed_files = []

    for path, result in outcomes:
        if "error" in result:
            failed_files.append(path)
            continue

        chunk_code_field = result.get("modern_code", "")
        # The model may still return either a string or a one-element
        # list for a single-file request - normalize either way, and
        # force the path to match the ORIGINAL file path regardless of
        # what the model echoed back, since that's the one source of
        # truth we actually trust here.
        if isinstance(chunk_code_field, list) and chunk_code_field:
            code_text = chunk_code_field[0].get("code", "")
        elif isinstance(chunk_code_field, str):
            code_text = chunk_code_field
        else:
            code_text = ""

        modern_code.append({"path": path, "code": code_text})
        all_changes.extend(result.get("changes", []))
        all_warnings.extend(result.get("warnings", []))

    if not modern_code:
        return {"error": f"Conversion failed for all files: {failed_files}"}

    if failed_files:
        all_warnings.append(f"Conversion failed for: {', '.join(failed_files)} (see other files for partial results)")

    return {
        "modern_code": modern_code,
        "changes": all_changes,
        "warnings": all_warnings,
    }


def merge_results(results: list[dict], mode: str) -> dict:
    """Merge results from multiple chunks into a single coherent response."""
    if not results:
        return {"error": "No results to merge"}

    if len(results) == 1 and mode != "convert":
        return results[0]

    merged = {}

    if mode == "explain":
        
        merged["summary"] = results[0].get("summary", "")
        merged["business_logic"] = results[0].get("business_logic", "")
        merged["language"] = results[0].get("language", "Unknown")
        merged["health_score"] = results[0].get("health_score", {})

        all_steps = []
        all_risks = []
        for r in results:
            all_steps.extend(r.get("steps", []))
            all_risks.extend(r.get("risks", []))

        
        merged["steps"] = [_strip_leading_number(s) for s in all_steps]
        merged["risks"] = all_risks

    elif mode == "convert":
        
        all_files = []
        seen_paths = set()
        for r in results:
            chunk_code = r.get("modern_code", [])
            if isinstance(chunk_code, str):
                chunk_code = [{"path": "main", "code": chunk_code}] if chunk_code else []
            for entry in chunk_code:
                path = entry.get("path", "main")
                if path in seen_paths:
                  
                    for f in all_files:
                        if f["path"] == path:
                            f["code"] += "\n\n" + entry.get("code", "")
                            break
                else:
                    all_files.append({"path": path, "code": entry.get("code", "")})
                    seen_paths.add(path)
        merged["modern_code"] = all_files

        all_changes = []
        all_warnings = []
        for r in results:
            all_changes.extend(r.get("changes", []))
            all_warnings.extend(r.get("warnings", []))
        merged["changes"] = all_changes
        merged["warnings"] = all_warnings

    elif mode == "debug":
        merged["summary"] = results[0].get("summary", "")
        merged["health_score"] = results[0].get("health_score", {})
        all_risks = []
        for r in results:
            all_risks.extend(r.get("risks", []))
        merged["risks"] = all_risks

    elif mode == "docs":
        merged["overview"] = results[0].get("overview", "")
        merged["documentation"] = "\n\n".join(r.get("documentation", "") for r in results)
        all_functions = []
        for r in results:
            all_functions.extend(r.get("functions", []))
        merged["functions"] = all_functions

    elif mode == "remediation":
        all_s1 = []
        all_s2 = []
        all_s3 = []
        for r in results:
            all_s1.extend(r.get("sprint_1", []))
            all_s2.extend(r.get("sprint_2", []))
            all_s3.extend(r.get("sprint_3", []))
        merged["sprint_1"] = all_s1
        merged["sprint_2"] = all_s2
        merged["sprint_3"] = all_s3
        merged["total_estimate"] = results[0].get("total_estimate", "See individual sprints")
    else:
        merged = results[0]

    return merged


def run_analysis(code: str, mode: str, filename: str) -> dict:
    """Shared analysis pipeline used by both /analyse and /analyse-zip."""
    if not code.strip():
        return {
            "result": {"error": "No code provided"},
            "chunks_processed": 0,
            "tokens": 0,
            "model_used": "n/a",
            "filename": filename,
        }

    mode = mode if mode in PROMPTS else "explain"
    system_prompt = PROMPTS[mode]

    total_tokens = count_tokens(code)

   
    if mode == "convert" and split_combined_files(code):
        merged = run_convert_per_file(code)

        if "error" in merged:
            return {
                "result": merged,
                "chunks_processed": 0,
                "tokens": total_tokens,
                "model_used": "gemini-2.5-flash",
                "filename": filename,
            }

        use_local = os.getenv("USE_LOCAL_MODEL", "false").lower() == "true"
        model_used = "codellama:13b (local)" if use_local else "gemini-2.5-flash"

        return {
            "result": merged,
            "chunks_processed": len(merged.get("modern_code", [])),
            "chunks_failed": 0,
            "tokens": total_tokens,
            "model_used": model_used,
            "filename": filename,
        }

    chunks = chunk_code(code)

    
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT_CHUNKS, len(chunks))) as executor:
        raw_results = list(executor.map(lambda c: call_llm(system_prompt, c), chunks))

    results = []
    failed_chunks = 0
    last_error = None
    for result in raw_results:
        print("DEBUG RESULT KEYS:", result.keys() if isinstance(result, dict) else result)
        print("DEBUG RESULT:", result)
        if "error" in result:
            failed_chunks += 1
            last_error = result
        else:
            results.append(result)

    if not results:
        # Every chunk failed - nothing to merge, surface the last error.
        return {
            "result": last_error or {"error": "All chunks failed"},
            "chunks_processed": 0,
            "tokens": total_tokens,
            "model_used": "gemini-2.5-flash",
            "filename": filename,
        }

    merged = merge_results(results, mode)

    if "health_score" in merged:
        merged["health_score"] = render_health_score(merged["health_score"])

    use_local = os.getenv("USE_LOCAL_MODEL", "false").lower() == "true"
    model_used = "codellama:13b (local)" if use_local else "gemini-2.5-flash"

    return {
        "result": merged,
        "chunks_processed": len(results),
        "chunks_failed": failed_chunks,
        "tokens": total_tokens,
        "model_used": model_used,
        "filename": filename,
    }


@app.post("/analyse")
async def analyse(request: AnalyseRequest):
    """Analyse a single block of legacy code using AI."""
    return run_analysis(request.code, request.mode, request.filename)


@app.post("/analyse-zip")
async def analyse_zip(file: UploadFile = File(...), mode: str = Form("explain")):
    """
    Analyse an entire legacy codebase uploaded as a .zip archive.

    Extracts every recognised source file (recursing through nested
    folders), concatenates them with file-boundary markers so the AI
    can reason about the system as a whole, then runs the same
    chunk/prompt/merge pipeline used for single-file analysis.
    """
    if not file.filename.lower().endswith(".zip"):
        return {"result": {"error": "Please upload a .zip file"}}

    zip_bytes = await file.read()

    try:
        extracted = extract_code_files(zip_bytes)
    except Exception as e:
        return {"result": {"error": f"Could not read zip file: {e}"}}

    if not extracted:
        return {"result": {"error": "No recognised source files found in the zip"}}

    combined_code = combine_files(extracted)
    file_list = [f["path"] for f in extracted]

    response = run_analysis(combined_code, mode, file.filename)
    response["files_analysed"] = file_list
    return response


@app.get("/health")
async def health():
    """Health check endpoint."""
    use_local = os.getenv("USE_LOCAL_MODEL", "false").lower() == "true"
    model = "codellama:13b (local)" if use_local else "gemini-2.5-flash"
    return {"status": "ok", "model": model}


@app.get("/")
async def root():
    """Root endpoint."""
    use_local = os.getenv("USE_LOCAL_MODEL", "false").lower() == "true"
    model = "codellama:13b (local)" if use_local else "gemini-2.5-flash"
    return {"status": "ok", "model": model}