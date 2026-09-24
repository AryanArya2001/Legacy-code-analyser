def get_score_label(score: int) -> str:
    """Return a human-readable label for a health score 0-100."""
    if score <= 30:
        return "Critical"
    elif score <= 50:
        return "Poor"
    elif score <= 70:
        return "Fair"
    elif score <= 85:
        return "Good"
    else:
        return "Excellent"


def render_health_score(score_dict: dict) -> dict:
    """
    Validate and clean a health score dictionary from the LLM response.
    Ensures all required fields exist with sensible defaults.
    """
    if not isinstance(score_dict, dict):
        score_dict = {}

    def clamp(val, default=50):
        """Ensure value is an integer between 0 and 100."""
        try:
            return max(0, min(100, int(val)))
        except (TypeError, ValueError):
            return default

    return {
        "overall": clamp(score_dict.get("overall"), 50),
        "complexity": clamp(score_dict.get("complexity"), 50),
        "documentation": clamp(score_dict.get("documentation"), 10),
        "modernisation": clamp(score_dict.get("modernisation"), 30),
        "risk_level": clamp(score_dict.get("risk_level"), 60),
    }
