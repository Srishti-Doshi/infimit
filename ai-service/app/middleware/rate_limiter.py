import time
from collections import defaultdict

# store user request timestamps
user_requests = defaultdict(list)

# limit settings
REQUEST_LIMIT = 5
TIME_WINDOW = 60  # seconds

def is_rate_limited(client_id: str):

    current_time = time.time()

    # remove old requests
    user_requests[client_id] = [
        timestamp for timestamp in user_requests[client_id]
        if current_time - timestamp < TIME_WINDOW
    ]

    # check limit
    if len(user_requests[client_id]) >= REQUEST_LIMIT:
        return True

    # add current request
    user_requests[client_id].append(current_time)

    return False