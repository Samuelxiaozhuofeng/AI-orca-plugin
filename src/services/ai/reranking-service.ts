/**
 * Reranking Service for AI-orca-plugin
 * 
 * Provides multiple reranking strategies to improve search result relevance:
 * - BM25: Classic information retrieval scoring
 * - Semantic: TF-IDF based semantic similarity
 * - Hybrid: Combination of BM25 and semantic scores
 * 
 * Inspired by:
 * - AI SDK 6's rerank function design
 * - Context7's topic-based relevance filtering
 * - Claude's context prioritization approach
 */

import type { SearchResult } from "../notes/search-service";

// ============================================================================
// Types & Interfaces
// ============================================================================

export type RerankStrategy = "bm25" | "semantic" | "hybrid";

export interface RerankOptions {
  /** The search query or keywords */
  query: string | string[];
  /** Documents to rerank */
  documents: SearchResult[];
  /** Maximum results to return (default: 20) */
  topK?: number;
  /** Reranking strategy (default: "hybrid") */
  strategy?: RerankStrategy;
  /** Optional topic for additional relevance boost */
  topic?: string;
  /** Minimum score threshold (0-1, default: 0) */
  minScore?: number;
}

export interface RerankResult extends SearchResult {
  /** Normalized rerank score (0-1) */
  rerankScore: number;
  /** Original relevance score from search */
  originalScore?: number;
  /** Score breakdown by component */
  scoreBreakdown?: {
    bm25?: number;
    semantic?: number;
    topicBoost?: number;
    titleBoost?: number;
  };
}

export interface RerankStats {
  /** Total documents processed */
  totalDocuments: number;
  /** Documents returned after reranking */
  returnedDocuments: number;
  /** Strategy used */
  strategy: RerankStrategy;
  /** Average rerank score */
  avgScore: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// BM25 Implementation
// ============================================================================

/**
 * BM25 scoring parameters
 * k1: term frequency saturation parameter (typical: 1.2-2.0)
 * b: document length normalization (typical: 0.75)
 */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Tokenize text into terms for BM25 scoring
 * Handles both English and Chinese text
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  
  const normalized = text.toLowerCase();
  
  // Split by whitespace and punctuation, keeping Chinese characters together
  const tokens: string[] = [];
  
  // Match word characters or Chinese characters
  const regex = /[\w\u4e00-\u9fff]+/g;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const token = match[0];
    // For Chinese text, split into individual characters for better matching
    if (/[\u4e00-\u9fff]/.test(token)) {
      // Keep the full word/phrase as one token, but also add characters
      tokens.push(token);
      if (token.length > 1) {
        for (const char of token) {
          tokens.push(char);
        }
      }
    } else if (token.length >= 2) {
      // Only keep English words with 2+ characters
      tokens.push(token);
    }
  }
  
  return tokens;
}

/**
 * Calculate term frequency in a document
 */
function calculateTF(term: string, docTokens: string[]): number {
  const count = docTokens.filter((t) => t === term || t.includes(term)).length;
  return count;
}

/**
 * Calculate inverse document frequency
 */
function calculateIDF(term: string, allDocs: string[][]): number {
  const docsWithTerm = allDocs.filter((doc) =>
    doc.some((t) => t === term || t.includes(term))
  ).length;
  
  if (docsWithTerm === 0) return 0;
  
  // Standard IDF formula with smoothing
  return Math.log((allDocs.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
}

/**
 * Calculate BM25 score for a single document
 */
function calculateBM25Score(
  queryTerms: string[],
  docTokens: string[],
  allDocs: string[][],
  avgDocLength: number
): number {
  let score = 0;
  const docLength = docTokens.length;
  
  for (const term of queryTerms) {
    const tf = calculateTF(term, docTokens);
    if (tf === 0) continue;
    
    const idf = calculateIDF(term, allDocs);
    
    // BM25 formula
    const numerator = tf * (BM25_K1 + 1);
    const denominator =
      tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
    
    score += idf * (numerator / denominator);
  }
  
  return score;
}

// ============================================================================
// Semantic Similarity Implementation
// ============================================================================

/**
 * Calculate TF-IDF vector for a document
 */
function calculateTFIDFVector(
  docTokens: string[],
  vocabulary: string[],
  allDocs: string[][]
): Map<string, number> {
  const vector = new Map<string, number>();
  const docLength = docTokens.length;
  
  for (const term of vocabulary) {
    const tf = calculateTF(term, docTokens) / Math.max(docLength, 1);
    const idf = calculateIDF(term, allDocs);
    vector.set(term, tf * idf);
  }
  
  return vector;
}

/**
 * Calculate cosine similarity between two TF-IDF vectors
 */
function cosineSimilarity(
  vec1: Map<string, number>,
  vec2: Map<string, number>
): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  // Get all unique terms
  const allTerms = new Set([...vec1.keys(), ...vec2.keys()]);
  
  for (const term of allTerms) {
    const v1 = vec1.get(term) || 0;
    const v2 = vec2.get(term) || 0;
    
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate semantic similarity score using TF-IDF cosine similarity
 */
function calculateSemanticScore(
  queryTokens: string[],
  docTokens: string[],
  allDocs: string[][],
  vocabulary: string[]
): number {
  const queryVector = calculateTFIDFVector(queryTokens, vocabulary, allDocs);
  const docVector = calculateTFIDFVector(docTokens, vocabulary, allDocs);
  
  return cosineSimilarity(queryVector, docVector);
}

// ============================================================================
// Additional Scoring Factors
// ============================================================================

/**
 * Calculate title match boost
 * Gives higher score when query terms appear in the title
 */
function calculateTitleBoost(
  queryTerms: string[],
  title: string
): number {
  if (!title) return 0;
  
  const titleLower = title.toLowerCase();
  let matchCount = 0;
  
  for (const term of queryTerms) {
    if (titleLower.includes(term)) {
      matchCount++;
    }
  }
  
  return queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
}

/**
 * Calculate topic relevance boost
 */
function calculateTopicBoost(
  topic: string | undefined,
  content: string,
  title: string
): number {
  if (!topic) return 0;
  
  const topicLower = topic.toLowerCase();
  const fullText = `${title} ${content}`.toLowerCase();
  
  // Direct topic match
  if (fullText.includes(topicLower)) {
    // Bonus for title match
    if (title.toLowerCase().includes(topicLower)) {
      return 1.0;
    }
    return 0.7;
  }
  
  // Partial topic word matches
  const topicWords = tokenize(topic);
  let matchCount = 0;
  for (const word of topicWords) {
    if (fullText.includes(word)) {
      matchCount++;
    }
  }
  
  return topicWords.length > 0 ? (matchCount / topicWords.length) * 0.5 : 0;
}

// ============================================================================
// Main Reranking Functions
// ============================================================================

/**
 * Extract searchable text from a SearchResult
 */
function getDocumentText(doc: SearchResult): string {
  return [doc.title, doc.content, doc.fullContent || ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Normalize scores to 0-1 range
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  
  if (max === min) {
    return scores.map(() => max > 0 ? 1 : 0);
  }
  
  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Rerank search results using the specified strategy
 */
export async function rerankResults(
  options: RerankOptions
): Promise<{ results: RerankResult[]; stats: RerankStats }> {
  const startTime = Date.now();
  
  const {
    query,
    documents,
    topK = 20,
    strategy = "hybrid",
    topic,
    minScore = 0,
  } = options;
  
  if (documents.length === 0) {
    return {
      results: [],
      stats: {
        totalDocuments: 0,
        returnedDocuments: 0,
        strategy,
        avgScore: 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
  
  // Normalize query to array of terms
  const queryTerms = Array.isArray(query)
    ? query.flatMap((q) => tokenize(q))
    : tokenize(query);
  
  // Tokenize all documents
  const docTexts = documents.map(getDocumentText);
  const allDocTokens = docTexts.map(tokenize);
  
  // Build vocabulary (all unique terms)
  const vocabulary = Array.from(
    new Set(queryTerms.concat(allDocTokens.flat()))
  );
  
  // Calculate average document length for BM25
  const avgDocLength =
    allDocTokens.reduce((sum, doc) => sum + doc.length, 0) / allDocTokens.length;
  
  // Calculate scores for each document
  const scoredResults: RerankResult[] = documents.map((doc, index) => {
    const docTokens = allDocTokens[index];
    const docText = docTexts[index];
    
    // Calculate component scores
    const bm25Score = calculateBM25Score(
      queryTerms,
      docTokens,
      allDocTokens,
      avgDocLength
    );
    
    const semanticScore = calculateSemanticScore(
      queryTerms,
      docTokens,
      allDocTokens,
      vocabulary
    );
    
    const titleBoost = calculateTitleBoost(queryTerms, doc.title);
    const topicBoost = calculateTopicBoost(topic, docText, doc.title);
    
    // Combine scores based on strategy
    let rawScore: number;
    switch (strategy) {
      case "bm25":
        rawScore = bm25Score + titleBoost * 0.3 + topicBoost * 0.2;
        break;
      case "semantic":
        rawScore = semanticScore + titleBoost * 0.3 + topicBoost * 0.2;
        break;
      case "hybrid":
      default:
        // Weighted combination: 60% BM25 + 40% semantic + boosts
        rawScore =
          bm25Score * 0.6 +
          semanticScore * 0.4 +
          titleBoost * 0.25 +
          topicBoost * 0.15;
        break;
    }
    
    return {
      ...doc,
      rerankScore: rawScore, // Will be normalized later
      originalScore: doc.relevanceScore,
      scoreBreakdown: {
        bm25: bm25Score,
        semantic: semanticScore,
        topicBoost,
        titleBoost,
      },
    };
  });
  
  // Normalize scores to 0-1
  const rawScores = scoredResults.map((r) => r.rerankScore);
  const normalizedScores = normalizeScores(rawScores);
  
  scoredResults.forEach((result, index) => {
    result.rerankScore = normalizedScores[index];
  });
  
  // Sort by rerank score (descending)
  scoredResults.sort((a, b) => b.rerankScore - a.rerankScore);
  
  // Filter by minimum score and limit to topK
  const filteredResults = scoredResults
    .filter((r) => r.rerankScore >= minScore)
    .slice(0, topK);
  
  // Calculate stats
  const avgScore =
    filteredResults.length > 0
      ? filteredResults.reduce((sum, r) => sum + r.rerankScore, 0) /
        filteredResults.length
      : 0;
  
  return {
    results: filteredResults,
    stats: {
      totalDocuments: documents.length,
      returnedDocuments: filteredResults.length,
      strategy,
      avgScore,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Quick rerank using only BM25 (faster, good for large result sets)
 */
export async function quickRerank(
  query: string | string[],
  documents: SearchResult[],
  topK: number = 20
): Promise<RerankResult[]> {
  const { results } = await rerankResults({
    query,
    documents,
    topK,
    strategy: "bm25",
  });
  return results;
}

/**
 * Rerank with topic focus (best for contextual searches)
 */
export async function rerankWithTopic(
  query: string | string[],
  documents: SearchResult[],
  topic: string,
  topK: number = 20
): Promise<RerankResult[]> {
  const { results } = await rerankResults({
    query,
    documents,
    topK,
    topic,
    strategy: "hybrid",
  });
  return results;
}

/**
 * Batch rerank multiple queries against the same document set
 * Useful for multi-query scenarios
 */
export async function batchRerank(
  queries: string[],
  documents: SearchResult[],
  options: Omit<RerankOptions, "query" | "documents"> = {}
): Promise<Map<string, RerankResult[]>> {
  const results = new Map<string, RerankResult[]>();
  
  for (const query of queries) {
    const { results: reranked } = await rerankResults({
      ...options,
      query,
      documents,
    });
    results.set(query, reranked);
  }
  
  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

