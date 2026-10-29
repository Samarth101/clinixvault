"""
Python Ctypes Binding for ClinixVault C++ Low-Level Inference Accelerator.
Provides high-performance native C++ routines for:
- Repetition penalty calculation
- Top-K and Top-P logit truncation
- Vector cosine similarity and batch embeddings scoring for clinical RAG
"""

import os
import sys
import ctypes
import numpy as np
from typing import List, Optional

_dir = os.path.dirname(os.path.abspath(__file__))
_lib_candidates = [
    os.path.join(_dir, "libclinix_accel.dylib"),
    os.path.join(_dir, "libclinix_accel.so"),
    os.path.join(_dir, "libclinix_accel.dll"),
]

_accel_lib = None
for c in _lib_candidates:
    if os.path.exists(c):
        try:
            _accel_lib = ctypes.CDLL(c)
            break
        except Exception as load_err:
            warnings.warn(f"Failed loading candidate C++ accelerator {c}: {load_err}")

if _accel_lib:
    # Set argtypes and restype
    _accel_lib.apply_repetition_penalty_c.argtypes = [
        ctypes.POINTER(ctypes.c_float),
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
        ctypes.c_int,
        ctypes.c_float,
    ]
    _accel_lib.apply_repetition_penalty_c.restype = None

    _accel_lib.top_k_top_p_filter_c.argtypes = [
        ctypes.POINTER(ctypes.c_float),
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_float,
        ctypes.c_float,
    ]
    _accel_lib.top_k_top_p_filter_c.restype = None

    _accel_lib.cosine_similarity_c.argtypes = [
        ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_float),
        ctypes.c_int,
    ]
    _accel_lib.cosine_similarity_c.restype = ctypes.c_float

    _accel_lib.batch_cosine_similarity_c.argtypes = [
        ctypes.POINTER(ctypes.c_float),
        ctypes.POINTER(ctypes.c_float),
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_float),
    ]
    _accel_lib.batch_cosine_similarity_c.restype = None


def apply_repetition_penalty(logits: np.ndarray, prompt_tokens: List[int], penalty: float = 1.2) -> np.ndarray:
    """Applies repetition penalty in-place or via copy."""
    logits = np.require(logits, dtype=np.float32, requirements=["C"])
    if penalty <= 1.0 or not prompt_tokens:
        return logits

    if _accel_lib:
        tokens_arr = np.array(prompt_tokens, dtype=np.int32)
        _accel_lib.apply_repetition_penalty_c(
            logits.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
            len(logits),
            tokens_arr.ctypes.data_as(ctypes.POINTER(ctypes.c_int)),
            len(tokens_arr),
            penalty,
        )
    else:
        # Vectorized Python fallback
        for tok in prompt_tokens:
            if 0 <= tok < len(logits):
                if logits[tok] > 0:
                    logits[tok] /= penalty
                else:
                    logits[tok] *= penalty
    return logits


def top_k_top_p_filter(
    logits: np.ndarray, top_k: int = 50, top_p: float = 0.9, filter_val: float = -float("inf")
) -> np.ndarray:
    """Filters logits using Top-K and Nucleus (Top-P) sampling."""
    logits = np.require(logits, dtype=np.float32, requirements=["C"])
    if _accel_lib:
        _accel_lib.top_k_top_p_filter_c(
            logits.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
            len(logits),
            top_k,
            top_p,
            filter_val,
        )
    else:
        # Fallback
        indices = np.argsort(logits)[::-1]
        if top_k > 0 and top_k < len(logits):
            logits[indices[top_k:]] = filter_val
        if 0.0 < top_p < 1.0:
            exp_l = np.exp(logits[indices] - np.max(logits))
            probs = exp_l / np.sum(exp_l)
            cum_probs = np.cumsum(probs)
            cutoff_mask = cum_probs > top_p
            if np.any(cutoff_mask):
                cutoff_idx = np.where(cutoff_mask)[0][0]
                logits[indices[cutoff_idx + 1:]] = filter_val
    return logits


def compute_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Computes cosine similarity between two clinical embedding vectors."""
    a = np.require(vec_a, dtype=np.float32, requirements=["C"])
    b = np.require(vec_b, dtype=np.float32, requirements=["C"])
    dim = len(a)
    assert len(b) == dim, "Vector dimensions must match"

    if _accel_lib:
        return float(
            _accel_lib.cosine_similarity_c(
                a.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
                b.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
                dim,
            )
        )
    else:
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))


def compute_batch_cosine_similarity(query_vec: np.ndarray, matrix_vecs: np.ndarray) -> np.ndarray:
    """Computes cosine similarity of query against matrix of vectors (N x D)."""
    q = np.require(query_vec, dtype=np.float32, requirements=["C"])
    mat = np.require(matrix_vecs, dtype=np.float32, requirements=["C"])
    n, d = mat.shape
    assert len(q) == d, "Query vector dimension mismatch"

    out_sims = np.zeros(n, dtype=np.float32)
    if _accel_lib:
        _accel_lib.batch_cosine_similarity_c(
            q.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
            mat.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
            n,
            d,
            out_sims.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
        )
    else:
        q_norm = np.linalg.norm(q)
        mat_norm = np.linalg.norm(mat, axis=1)
        denom = (q_norm * mat_norm)
        denom[denom == 0] = 1e-9
        out_sims = np.dot(mat, q) / denom

    return out_sims


def is_native_accelerated() -> bool:
    """Returns True if C++ compiled library is active."""
    return _accel_lib is not None
