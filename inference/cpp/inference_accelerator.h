#ifndef CLINIX_INFERENCE_ACCELERATOR_H
#define CLINIX_INFERENCE_ACCELERATOR_H

#ifdef __cplusplus
extern "C" {
#endif

// Fast C++ logits repetition penalty and temperature scaling for edge generation
void apply_repetition_penalty_c(
    float* logits,
    int vocab_size,
    const int* prompt_tokens,
    int prompt_len,
    float penalty
);

// Fast C++ Top-K / Top-P sampling filter
void top_k_top_p_filter_c(
    float* logits,
    int vocab_size,
    int top_k,
    float top_p,
    float filter_value
);

// Fast C++ Cosine similarity calculation between embedding vectors
float cosine_similarity_c(
    const float* vec_a,
    const float* vec_b,
    int dimension
);

// Fast C++ batch cosine similarity for RAG retrieval
void batch_cosine_similarity_c(
    const float* query_vec,
    const float* matrix_vecs,
    int num_vectors,
    int dimension,
    float* out_similarities
);

#ifdef __cplusplus
}
#endif

#endif // CLINIX_INFERENCE_ACCELERATOR_H
