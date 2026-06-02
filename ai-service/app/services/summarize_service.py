import os
import logging
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


logger = logging.getLogger(__name__)

def summarize_text(text: str):

    try:

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

Preserve all important facts, figures, dates, names, and announcements.
Never add information that is not present in the original article.
Use a neutral and professional journalistic tone.
Focus on the most important developments and outcomes.
Prioritize information related to students, teachers, schools, colleges, universities, examinations, admissions, scholarships, research, academic achievements, educational policies, institutional initiatives, and sports achievements.
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

Articles under 250 words: Create a concise summary while preserving all important information.
Articles between 250 and 1500 words: Create a balanced summary covering all major points.
Articles above 1500 words: Create a detailed summary that captures the key developments and outcomes.
Prioritize information preservation over aggressive compression.

Output only the summary.
 
"""

        else:

            system_prompt = """
You are a senior editor for a professional education news platform.

Task:
Create a detailed professional summary.

Polish article
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

        return response.choices[0].message.content

    except Exception as e:
          logger.exception(f"AI Service Error: {e}")
          return "Unable to generate summary right now. Please try again later."



