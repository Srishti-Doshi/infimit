from pydantic import BaseModel

class MetricsResponse(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int