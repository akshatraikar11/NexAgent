/**
 * Embedding-based cosine similarity for dual-LLM consensus.
 * Uses Gemini text-embedding-004 when available; falls back to token-overlap cosine.
 */

export function tokenOverlapCosineSimilarity(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) ?? 0) + 1);
  for (const t of tokensB) freqB.set(t, (freqB.get(t) ?? 0) + 1);

  const allTokens = new Set([...freqA.keys(), ...freqB.keys()]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const token of allTokens) {
    const a = freqA.get(token) ?? 0;
    const b = freqB.get(token) ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function computeResponseSimilarity(
  textA: string,
  textB: string,
  geminiApiKey?: string
): Promise<number> {
  if (geminiApiKey && geminiApiKey !== 'mock_gemini_key') {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const ai = new GoogleGenerativeAI(geminiApiKey);
      const model = ai.getGenerativeModel({ model: 'text-embedding-004' });

      const [embA, embB] = await Promise.all([
        model.embedContent(textA.slice(0, 8000)),
        model.embedContent(textB.slice(0, 8000)),
      ]);

      const vecA = embA.embedding.values;
      const vecB = embB.embedding.values;
      if (vecA.length === vecB.length && vecA.length > 0) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
          dot += vecA[i] * vecB[i];
          normA += vecA[i] * vecA[i];
          normB += vecB[i] * vecB[i];
        }
        if (normA > 0 && normB > 0) {
          return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
        }
      }
    } catch {
      // Fall through to token overlap
    }
  }
  return Number(tokenOverlapCosineSimilarity(textA, textB).toFixed(4));
}

/** Parse confidence score (0–1) from LLM response text. */
export function parseConfidenceFromText(text: string, fallback = 0.75): number {
  const patterns = [
    /confidence[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /confidence[:\s]+(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*\/\s*5/,
    /score[:\s]+(\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let val = parseFloat(match[1]);
      if (val > 1 && val <= 5) val = val / 5;
      if (val > 1 && val <= 100) val = val / 100;
      if (val >= 0 && val <= 1) return Number(val.toFixed(4));
    }
  }
  // No confidence pattern found — LLM may have changed its output format.
  // This degrades CCEP signal quality silently if not monitored.
  // Using console.warn so this surfaces even without a pino logger import here.
  console.warn(`[LLM-EMBEDDINGS] parseConfidenceFromText: no confidence pattern matched in response (len=${text.length}). Using fallback=${fallback}. Check CONFIDENCE_INSTRUCTION in router.ts.`);
  return fallback;
}
