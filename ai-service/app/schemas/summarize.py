from pydantic import BaseModel,Field

class SummaryRequest(BaseModel):
    text: str = Field(...,min_length=10, max_length=5000)
    



#validates incoming request body