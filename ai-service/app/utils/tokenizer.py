# utils/tokenizer.py

from typing import Optional
from transformers import AutoTokenizer

# -------------------------
# DEFAULT MODEL TOKENIZER
# -------------------------
DEFAULT_MODEL = "facebook/bart-large-cnn"

_tokenizer = None


# -------------------------
# LOAD TOKENIZER (LAZY LOADING)
# -------------------------
def get_tokenizer(model_name: Optional[str] = None):
    """
    Load tokenizer only once (lazy initialization).
    """
    global _tokenizer

    if _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained(
            model_name or DEFAULT_MODEL
        )

    return _tokenizer


# -------------------------
# COUNT TOKENS
# -------------------------
def count_tokens(text: str, model_name: Optional[str] = None) -> int:
    """
    Return number of tokens in given text.
    """
    tokenizer = get_tokenizer(model_name)
    return len(tokenizer.encode(text))


# -------------------------
# ENCODE TEXT (optional utility)
# -------------------------
def encode_text(text: str, model_name: Optional[str] = None):
    """
    Convert text into token IDs.
    """
    tokenizer = get_tokenizer(model_name)
    return tokenizer.encode(text)


# -------------------------
# DECODE TOKENS (optional utility)
# -------------------------
def decode_tokens(token_ids, model_name: Optional[str] = None) -> str:
    """
    Convert token IDs back to text.
    """
    tokenizer = get_tokenizer(model_name)
    return tokenizer.decode(token_ids, skip_special_tokens=True)