from pydantic import BaseModel,Field
 
class SummarizeRequest(BaseModel):
    text: str
    maxWords: int
    style: str

class SummarizeResponse(BaseModel):
    summary: str
    confidence: float
    model: str
    tokensIn: int
    tokensOut: int
    cached: bool
    
    
   


#validates incoming request body