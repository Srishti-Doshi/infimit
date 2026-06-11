import time
from datetime import datetime

def log_request(text: str, start_time: float, status: str):

    end_time = time.time()
    duration = round(end_time - start_time, 2)

    print(f"""
    [LOG - AI SERVICE]
    Time: {datetime.now()}
    Input Length: {len(text)}
    Duration: {duration}s
    Status: {status}
    """)