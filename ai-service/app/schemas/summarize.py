from pydantic import BaseModel,Field
 
class SummaryRequest(BaseModel):
    text: str = Field(...,min_length=10, max_length=500000,  description="Text to summarize using AI")
    
   


#validates incoming request body