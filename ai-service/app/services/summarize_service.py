import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()#Loads variables from .env

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")#Reads the API key securely.
)#create Groq AI client

def summarize_text(text: str):

    response = client.chat.completions.create(
        model = "llama-3.3-70b-versatile",#Specifies the AI model used for summarization.
        
        messages=[#Prompt sent to the AI model.
            {
                "role":"system",
                "content":"Summarize the article in short."#This controls AI behavior.
            },
            {
                "role": "user",#Contains the actual article text.
                "content": f"Summarize this text: {text}"
                #we did not use comma in last because this is last key-value pair.

            }

        ]

    )

    return response.choices[0].message.content




#contains AI business logic