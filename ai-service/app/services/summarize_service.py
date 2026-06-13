import asyncio
import hashlib
import traceback

from app.services.model_loader import model_loader
from app.utils.cache import summarize_cache
from app.config import settings

def _word_count(text: str):
    return len(text.split())


def _truncate_words(text: str, max_words: int):
    words = text.split()
    return " ".join(words[:max_words])


def _confidence(summary: str):
    return round(
        min(
            1.0,
            len(summary) / 400
        ),
        2
    )

def _apply_style(summary: str, style: str):

    if style == "engaging":
        return f"In a striking development, {summary}"

    if style == "academic":
        return f"Abstract: {summary}"

    return summary


def _truncate_500(text: str):

    if len(text) <= 500:
        return text

    cut = text[:500]

    last_space = cut.rfind(" ")

    if last_space > 0:
        cut = cut[:last_space]

    return cut + "..."


async def summarize_text(
    text: str,
    max_words: int,
    style: str
):

    key = hashlib.sha256(
        f"{text}|{max_words}|{style}".encode()
    ).hexdigest()

    cached = summarize_cache.get(key)

    if cached:
        return {
            **cached,
            "cached": True
        }

    if settings.FORCE_FALLBACK:

        fallback = {
            "summary": _truncate_words(text, max_words),
            "confidence": 0.0,
            "model": "fallback-truncate",
            "tokensIn": _word_count(text),
            "tokensOut": max_words,
            "cached": False,
            "degraded": True
        }

        summarize_cache.set(key, fallback)

        return fallback

    try:

        pipe = await model_loader.get_summarizer()

        result = await asyncio.to_thread(
            pipe,
            text,
            max_length=max_words,
            min_length=max(20, int(max_words * 0.5)),
            do_sample=False,
            truncation=True
        )

        summary = result[0]["summary_text"]

        summary = _apply_style(
            summary,
            style
        )

        summary = _truncate_500(summary)

        payload = {
            "summary": summary,
            "confidence": _confidence(summary),
            "model": "facebook/bart-large-cnn",
            "tokensIn": _word_count(text),
            "tokensOut": _word_count(summary),
            "cached": False,
            "degraded": False
        }

        summarize_cache.set(
            key,
            payload
        )

        return payload

    except Exception as e:
        print("SUMMARIZATION ERROR:")
        traceback.print_exc()
    
    
        return {
            "summary": _truncate_words(
                text,
                max_words
            ),
            "confidence": 0.0,
            "model": "fallback-truncate",
            "tokensIn": _word_count(text),
            "tokensOut": max_words,
            "cached": False,
            "degraded": True
        }