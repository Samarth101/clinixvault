#include "inference_accelerator.h"
#include <vector>
#include <algorithm>
#include <cmath>
#include <numeric>

extern "C" {

void apply_repetition_penalty_c(
    float* logits,
    int vocab_size,
    const int* prompt_tokens,
    int prompt_len,
    float penalty
) {
    if (!logits || !prompt_tokens || penalty <= 1.0f) {
        return;
    }

    for (int i = 0; i < prompt_len; ++i) {
        int token = prompt_tokens[i];
        if (token >= 0 && token < vocab_size) {
            float val = logits[token];
            if (val > 0.0f) {
                logits[token] = val / penalty;
            } else {
                logits[token] = val * penalty;
            }
        }
    }
}

void top_k_top_p_filter_c(
    float* logits,
    int vocab_size,
    int top_k,
    float top_p,
    float filter_value
) {
    if (!logits || vocab_size <= 0) return;

    // Index-logit pairs
    std::vector<std::pair<float, int>> indexed_logits;
    indexed_logits.reserve(vocab_size);
    for (int i = 0; i < vocab_size; ++i) {
        indexed_logits.emplace_back(logits[i], i);
    }

    // Sort descending by logit value
    std::sort(indexed_logits.begin(), indexed_logits.end(), [](const auto& a, const auto& b) {
        return a.first > b.first;
    });

    // Top-K mask
    if (top_k > 0 && top_k < vocab_size) {
        for (int i = top_k; i < vocab_size; ++i) {
            logits[indexed_logits[i].second] = filter_value;
        }
    }

    // Top-P nucleus sampling
    if (top_p > 0.0f && top_p < 1.0f) {
        // Softmax over sorted
        float max_l = indexed_logits[0].first;
        std::vector<float> probs(vocab_size);
        float sum_exp = 0.0f;
        for (int i = 0; i < vocab_size; ++i) {
            probs[i] = std::exp(indexed_logits[i].first - max_l);
            sum_exp += probs[i];
        }

        float cumsum = 0.0f;
        int cutoff_idx = vocab_size - 1;
        for (int i = 0; i < vocab_size; ++i) {
            cumsum += probs[i] / sum_exp;
            if (cumsum > top_p) {
                cutoff_idx = i;
                break;
            }
        }

        for (int i = cutoff_idx + 1; i < vocab_size; ++i) {
            logits[indexed_logits[i].second] = filter_value;
        }
    }
}

float cosine_similarity_c(
    const float* vec_a,
    const float* vec_b,
    int dimension
) {
    if (!vec_a || !vec_b || dimension <= 0) return 0.0f;

    double dot = 0.0;
    double norm_a = 0.0;
    double norm_b = 0.0;

    for (int i = 0; i < dimension; ++i) {
        double a = vec_a[i];
        double b = vec_b[i];
        dot += a * b;
        norm_a += a * a;
        norm_b += b * b;
    }

    if (norm_a <= 0.0 || norm_b <= 0.0) return 0.0f;
    return static_cast<float>(dot / (std::sqrt(norm_a) * std::sqrt(norm_b)));
}

void batch_cosine_similarity_c(
    const float* query_vec,
    const float* matrix_vecs,
    int num_vectors,
    int dimension,
    float* out_similarities
) {
    if (!query_vec || !matrix_vecs || !out_similarities) return;

    for (int i = 0; i < num_vectors; ++i) {
        const float* current_vec = matrix_vecs + (i * dimension);
        out_similarities[i] = cosine_similarity_c(query_vec, current_vec, dimension);
    }
}

} // extern "C"
