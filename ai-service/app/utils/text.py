# utils/text.py

import re

def clean_text(text: str) -> str:
    """Remove extra spaces and normalize text"""
    return re.sub(r"\s+", " ", text).strip()


def truncate_text(text: str, max_length: int = 100) -> str:
    """Truncate long text safely"""
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."


def to_lower(text: str) -> str:
    """Convert text to lowercase safely"""
    return text.lower().strip()


def remove_special_chars(text: str) -> str:
    """Remove special characters"""
    return re.sub(r"[^a-zA-Z0-9\s]", "", text)