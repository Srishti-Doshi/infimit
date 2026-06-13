import os
import asyncio
from transformers import pipeline
from app.config import settings

os.environ["HF_HOME"] = settings.MODELS_CACHE_DIR


class ModelLoader:
    def __init__(self):
        self._models = {}
        self._lock = asyncio.Lock()

    async def get_summarizer(self):
        if "summarizer" in self._models:
            return self._models["summarizer"]

        async with self._lock:
            if "summarizer" in self._models:
                return self._models["summarizer"]

            print("Loading BART model...")

            model = await asyncio.to_thread(
                pipeline,
                task="summarization",
                model="facebook/bart-large-cnn"
            )

            print("BART model loaded successfully")

            self._models["summarizer"] = model
            return model


model_loader = ModelLoader()