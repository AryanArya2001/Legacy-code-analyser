try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
    _USE_TIKTOKEN = True
except Exception:
    _USE_TIKTOKEN = False


def count_tokens(text: str) -> int:
    """Count the number of tokens in a text string.
    
    Uses tiktoken cl100k_base if available, otherwise estimates ~4 chars per token.
    """
    if _USE_TIKTOKEN:
        return len(_enc.encode(text))
    # Fallback: approximate 4 characters per token (reasonable for code)
    return max(1, len(text) // 4)


def chunk_code(code: str, max_tokens: int = 8000) -> list[str]:
    """
    Split code into chunks that each fit within max_tokens.
    
    Splits at natural boundaries in priority order:
    double newline, PROCEDURE, SECTION, closing brace, single newline.
    """
    if count_tokens(code) <= max_tokens:
        return [code]


    boundaries = ["\n\n", "\nPROCEDURE", "\nSECTION", "\n}", "\n"]

    chunks = []
    remaining = code

    while remaining and count_tokens(remaining) > max_tokens:
        
        split_at = -1
        for boundary in boundaries:
            
            search_limit = len(remaining) // 2
            idx = remaining.rfind(boundary, 0, search_limit + len(remaining) // 4)
            if idx > 0:
                split_at = idx + len(boundary)
                break

        if split_at <= 0:
           
            char_limit = max_tokens * 4
            split_at = min(char_limit, len(remaining))

        chunk = remaining[:split_at]
        
        while count_tokens(chunk) > max_tokens and "\n" in chunk:
            last_newline = chunk.rfind("\n")
            chunk = chunk[:last_newline]

        chunks.append(chunk)
        remaining = remaining[len(chunk):]

    if remaining:
        chunks.append(remaining)

    return chunks