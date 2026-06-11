from fastapi.responses import JSONResponse


def unauthorized_response():

    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": "INVALID_INTERNAL_KEY",
                "message": "Invalid internal key"
            }
        }
    )