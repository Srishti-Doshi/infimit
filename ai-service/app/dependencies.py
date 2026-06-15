from fastapi import Header, HTTPException
from app.config import settings
 

def verify_internal_key(
    x_internal_key: str = Header(...)
):
    import logging
    logger = logging.getLogger(__name__)
    logger.info("verify_internal_key called")
    if x_internal_key != settings.AI_INTERNAL_KEY:
        raise HTTPException(
            status_code=401,
            detail={
            "code": "INVALID_INTERNAL_KEY",
            "message": "Invalid internal key"
        }
        )

    return True

# An internal key prevents unauthorized users or applications from accessing an API.