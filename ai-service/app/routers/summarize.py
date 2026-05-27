from fastapi import APIRouter
from app.schemas.summarize import SummaryRequest
from app.services.summarize_service import summarize_text

router = APIRouter()

@router.post("/summarize")
def summarize(data: SummaryRequest):
    summary = summarize_text(data.text)
    return{
        "summary": summary
    }



#receives request
#validates data
#calls service
#returns JSON response