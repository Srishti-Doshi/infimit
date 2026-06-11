from pydantic import BaseModel, Field
from typing import Optional


class SummarizeRequest(BaseModel):
    text: str
    maxWords: Optional[int] = 120
    style: Optional[str] = "default"


class SummarizeResponse(BaseModel):
    summary: str
    confidence: float
    model: str
    tokensIn: int
    tokensOut: int
    cached: bool