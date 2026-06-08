from app.models.loader import get_groq_client
from app.utils.cache import get_cache, set_cache
import logging
import hashlib

 

logger = logging.getLogger(__name__)

def summarize_text(text: str):
    try:
        # 1. CREATE CACHE KEY (FIRST LINE)
        cache_key = "summarize:" + hashlib.md5(text.encode()).hexdigest()

        # 2. CHECK CACHE
        cached_result = get_cache(cache_key)

        if isinstance(cached_result, str) and cached_result.strip():
            return cached_result

        # 3. LOAD CLIENT
        client = get_groq_client()
        # Count words
        word_count = len(text.split())

        # Decide processing type
        if word_count < 300:

            system_prompt = """
You are a senior editor for a professional education news platform.

Task:
Improve the article's readability, formatting, paragraph structure, and journalistic style.

Rules:
- Preserve all information.
- Do not remove important details.
- Do not shorten the article significantly.
- Correct grammar and readability issues if necessary.
- Organize content into logical paragraphs.
- Use professional news-writing style.
- Output only the improved article.
"""

        elif word_count <=1500:

            system_prompt = """
 You are a senior editor for a professional education news platform.

Your task is to create accurate, professional, and publication-ready summaries of education-related news articles.

Guidelines:
 
article must be at least 600 words and maximum 800 words.

Preserve all important facts, figures, dates, names, and announcements.
Never add information that is not present in the original article.
Use a neutral and professional journalistic tone.
Focus on the most important developments and outcomes.
Prioritize information related to students, teachers, schools, colleges, universities, hackathon,seminars,workshops,examinations, admissions, scholarships, research, academic achievements, educational policies, institutional initiatives, and sports achievements.
Do not remove critical information simply to make the summary shorter.
Adjust the summary length dynamically based on the importance and density of information.
If the article contains important dates, deadlines, eligibility criteria, examination details, admission information, scholarship information, or official announcements, ensure they are retained in the summary.
Use clear and simple English suitable for a broad audience.
Avoid repetition.
Produce a summary that can be directly published on a professional news website.

Formatting Rules:

Organize information into logical paragraphs.
Insert paragraph breaks naturally when the topic or idea changes.
Avoid large blocks of text.
Ensure readability on both mobile and desktop devices.
Allow paragraph length to vary naturally according to the content.

Summary Length Rules:



Output only the summary.
 
"""

        else:

            system_prompt = """
You are a senior editor for a professional education news platform.

Task:
Create a detailed professional summary.

Polish article
    maximum 2000 words in article
    Remove repetition
    Remove unnecessary details
    Improve readability
    Keep all important information
    Reduce length to a maximum of 1500 words
    Output only the summary.
"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": text
                }
            ]
        )

        result = response.choices[0].message.content
        
        set_cache(cache_key, result, ttl=3600)

        return result   

    except Exception as e:
        logger.exception(e)
        raise Exception(str(e))


