from app.models.loader import get_groq_client
from app.utils.cache import get_cache, set_cache
from app.config import settings
import logging
import hashlib
import re

logger = logging.getLogger(__name__)


_BULLET_PREFIX = re.compile(r"^(?:[-*•‣▪]|â€¢|\d+[.)])\s*")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")


def _format_as_bullets(value: str) -> str:
    """Return one dash-prefixed point per output sentence or existing bullet."""
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    points: list[str] = []
    for line in lines:
        line = re.sub(
            r"^(?:Here are (?:the )?(?:key )?points:?|Summary:?)\s*",
            "",
            line,
            flags=re.IGNORECASE,
        )
        if not line:
            continue
        if _BULLET_PREFIX.match(line):
            point = _BULLET_PREFIX.sub("", line).strip()
            if point:
                points.append(point)
        else:
            points.extend(
                sentence.strip()
                for sentence in _SENTENCE_SPLIT.split(line)
                if sentence.strip()
            )
    return "\n".join(f"• {point}" for point in points)

def summarize_text(text: str, max_words: int = 120, style: str = "default"):
    
    if settings.FORCE_FALLBACK:
       return {
        "summary": _format_as_bullets(text[:200]),
        "degraded": True,
        "model": "fallback-truncate"
    }
    
    try:
        # -------------------------
        # 1. CACHE KEY
        # -------------------------
        cache_input = f"v2:{style}:{max_words}:{text}"
        cache_key = "summarize:" + hashlib.md5(cache_input.encode()).hexdigest()


        cached_result = get_cache(cache_key)

        if isinstance(cached_result, str) and cached_result.strip():
          return {
                 "summary": _format_as_bullets(cached_result),
                 "cached": True
         }

        # -------------------------
        # 2. LOAD MODEL CLIENT
        # -------------------------
        client = get_groq_client()

        word_count = len(text.split())

        # -------------------------
        # 3. SYSTEM PROMPTS (UPDATED)
        # -------------------------


        style_instruction = {
    "neutral": "Use neutral news-reporting language.",
    "engaging": "Use engaging and reader-friendly language.",
    "academic": "Use formal academic language."
       }.get(style, "Use neutral news-reporting language.")



        # SHORT ARTICLE
        if word_count < 300:

            system_prompt = """
You are an expert news editor for a newspaper-style education news platform.

TASK:
Convert the given article into a QUICK READ SUMMARY IN POINTS.

REQUIREMENTS:
- Output ONLY bullet points (no paragraphs)
- Each point must be short and clear
- Preserve all important facts
- No extra commentary
- Focus on who, what, when, where, why
- Make it fast to read (designed for busy users)
- Use simple English

FORMAT:
• Point 1
• Point 2
• Point 3
"""

        # MEDIUM ARTICLE
        elif word_count <= 1500:

            system_prompt = """
You are a senior editor for a professional education news platform.

TASK:
Convert the article into a structured POINT-WISE NEWS SUMMARY.

REQUIREMENTS:
- Output only bullet points
- Each point should represent one key idea
- Preserve all important facts, names, dates, numbers
- Focus on education-related updates (schools, colleges, exams, scholarships, etc.)
- No repetition
- Keep language simple and news-friendly
- Make it easy to scan quickly like a newspaper highlights section

FORMAT:
• Key point 1
• Key point 2
• Key point 3
"""

        # LONG ARTICLE
        else:

            system_prompt = """
You are a senior news editor for an education news platform.

TASK:
Create a detailed but SCANNABLE SUMMARY IN POINTS.

REQUIREMENTS:
- Convert article into structured bullet points
- Reduce length but preserve all key information
- Keep important facts, numbers, deadlines, announcements
- Remove repetition and unnecessary details
- Make it suitable for fast reading in a news app

FORMAT:
• Important point 1
• Important point 2
• Important point 3
"""

        system_prompt += f"\n{style_instruction}"
        system_prompt += f"\nKeep the summary under {max_words} words."
        # -------------------------
        # 4. MODEL CALL
        # -------------------------
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            temperature=0.2,
            max_tokens=max_words * 2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ]
        )

        result = _format_as_bullets(response.choices[0].message.content or "")
        if not result:
            logger.warning("Groq returned an empty summary; using a degraded source-text fallback")
            fallback_text = " ".join(text.split()[:max_words])
            return {
                "summary": _format_as_bullets(fallback_text),
                "cached": False,
                "degraded": True,
                "model": "fallback-extractive",
            }

        # -------------------------
        # 5. CACHE RESULT
        # -------------------------
        set_cache(cache_key, result, ttl=3600)

        return {
    "summary": result,
    "cached": False
}

    except Exception as e:
        logger.exception("Summarization failed: %s", str(e))
        raise Exception(f"Summarization error: {str(e)}")
