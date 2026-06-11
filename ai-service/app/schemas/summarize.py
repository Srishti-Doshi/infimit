from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator
)


class SummarizeRequest(BaseModel):

    text: str = Field(
        min_length=1,
        max_length=20000
    )

    maxWords: int = Field(
        default=60,
        ge=20,
        le=120
    )

    style: Literal[
        "neutral",
        "engaging",
        "academic"
    ] = "neutral"

    @field_validator("text")
    @classmethod
    def strip_and_check(cls, value: str):

        value = value.strip()

        if not value:
            raise ValueError(
                "text must not be empty"
            )

        return value


class SummarizeResponse(BaseModel):
    summary: str
    confidence: float
    model: str
    tokensIn: int
    tokensOut: int
    cached: bool