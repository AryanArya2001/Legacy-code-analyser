import os
import re
import json
import time
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"]


def _gemini_url(model: str) -> str:
    return (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )


def _repair_truncated_json(raw: str) -> Optional[dict]:
    """
    Attempt to repair a JSON object that was cut off mid-stream
    (e.g. due to hitting a token limit). Closes any unterminated
    string and pads with closing braces/brackets as needed.
    """
    start = raw.find("{")
    if start == -1:
        return None

    text = raw[start:]

    
    in_string = False
    escape = False
    stack = []

    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch in "{[":
                stack.append(ch)
            elif ch in "}]":
                if stack:
                    stack.pop()

    repaired = text

    if in_string:
        repaired += '"'

    repaired = re.sub(r",\s*$", "", repaired)

   
    if not in_string:
        repaired = re.sub(r',?\s*"[^"]*$', "", repaired)

    
    for opener in reversed(stack):
        repaired += "}" if opener == "{" else "]"

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

   
    for cutoff in range(len(repaired) - 1, 0, -1):
        if repaired[cutoff] == ",":
            candidate = repaired[:cutoff]
            for opener in reversed(stack):
                candidate += "}" if opener == "{" else "]"
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    return None


def extract_json(raw: str) -> dict:
    """Extract the first valid JSON object from a string."""
    if not raw:
        return {"error": "Empty response from model"}

    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip()
    cleaned = cleaned.rstrip("`").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    start = raw.find("{")
    end = raw.rfind("}")

    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass

   
    repaired = _repair_truncated_json(raw)
    if repaired is not None:
        return repaired

    return {"error": f"Could not parse JSON from response. Raw: {raw[:200]}"}


def call_llm(system: str, code: str) -> dict:
    """
    Call either Gemini API or local Ollama model.

    Returns:
        dict
    """
    use_local = os.getenv("USE_LOCAL_MODEL", "false").lower() == "true"

    if use_local:
        return _call_local(system, code)

    return _call_gemini(system, code)


def _call_gemini(system: str, code: str) -> dict:
    """Call Google Gemini API."""
    try:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key or api_key == "your-key-here":
            return {
                "error": "GEMINI_API_KEY not set. Please add your key to backend/.env"
            }

        payload = {
            "system_instruction": {
                "parts": [
                    {
                        "text": system
                    }
                ]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": f"Analyse this code:\n\n{code}"
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 32768,
                "responseMimeType": "application/json"
            }
        }

        last_error = None

        for model in GEMINI_MODELS:
            for attempt in range(3):
                try:
                    response = requests.post(
                        f"{_gemini_url(model)}?key={api_key}",
                        json=payload,
                        headers={
                            "Content-Type": "application/json"
                        },
                        timeout=120
                    )
                except requests.exceptions.ConnectionError:
                    return {
                        "error": "Cannot connect to Gemini API. Check your internet connection."
                    }

                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])

                    if not candidates:
                        last_error = {
                            "error": (
                                f"No response from Gemini. "
                                f"Feedback: {data.get('promptFeedback', {})}"
                            )
                        }
                        break

                    parts = (
                        candidates[0]
                        .get("content", {})
                        .get("parts", [])
                    )

                    raw = "".join(
                        part.get("text", "")
                        for part in parts
                    )

                    return extract_json(raw)

                try:
                    err_detail = (
                        response.json()
                        .get("error", {})
                        .get("message", response.text)
                    )
                except Exception:
                    err_detail = response.text

                last_error = {
                    "error": f"Gemini API error ({response.status_code}) [{model}]: {err_detail}"
                }

                if response.status_code == 503:
                    # Overloaded - wait briefly and retry, then try next model
                    time.sleep(2 * (attempt + 1))
                    continue
                else:
                    # Non-503 error (e.g. 400/401/429) - no point retrying this model
                    break

        return last_error or {"error": "Unknown error calling Gemini API"}

    except Exception as e:
        return {"error": str(e)}


def _call_local(system: str, code: str) -> dict:
    """Call local Ollama model."""
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "codellama:13b",
                "prompt": f"{system}\n\nAnalyse this code:\n\n{code}",
                "stream": False
            },
            timeout=120
        )

        response.raise_for_status()

        data = response.json()
        raw = data.get("response", "")

        return extract_json(raw)

    except requests.exceptions.ConnectionError:
        return {
            "error": (
                "Cannot connect to local Ollama. "
                "Make sure it's running on port 11434."
            )
        }

    except Exception as e:
        return {"error": str(e)}