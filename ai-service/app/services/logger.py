import logging
import time
from datetime import datetime

logger = logging.getLogger(__name__)

def log_request(text: str, start_time: float, status: str):
    duration = round(time.time() - start_time, 2)

    logger.info(
        "time=%s input_length=%s duration=%ss status=%s",
        datetime.now(),
        len(text),
        duration,
        status
    )