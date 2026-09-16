import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { calculateCalibratedConfidence } from '../ccep/signals.js';
import { MOCK_TRIAGE_RESPONSES, MOCK_DEFAULT_LLM_RESPONSE } from './mock.js';
import { computeResponseSimilarity, parseConfidenceFromText } from './embeddings.js';
import { logger } from '../utils/logger.js';

export interface LLMRouterResult {
  response: string;
  geminiConfidence: number;
  groqConfidence: number;
  cosineSimilarity: number;
  modelConfidence: number;
  dualModelAgreed: boolean;
}

const CONFIDENCE_INSTRUCTION = `
Respond with your analysis, then on the last line write exactly:
CONFIDENCE: <number between 0.0 and 1.0>`;

export async function generateDualLLMResponse(
  prompt: string,
  contextTitle?: string
): Promise<LLMRouterResult> {
  const isMockMode =
    process.env.MOCK_MODE === 'true' ||
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === 'mock_gemini_key';

  if (isMockMode) {
    logger.info('[LLM-ROUTER] MOCK_MODE active — using mock LLM responses');

    const mockFixture = (contextTitle && MOCK_TRIAGE_RESPONSES[contextTitle]) || MOCK_DEFAULT_LLM_RESPONSE;
    const calibrated = calculateCalibratedConfidence(
      mockFixture.geminiConfidence,
      mockFixture.groqConfidence,
      mockFixture.cosineSimilarity
    );

    return {
      response: mockFixture.geminiText,
      geminiConfidence: mockFixture.geminiConfidence,
      groqConfidence: mockFixture.groqConfidence,
      cosineSimilarity: mockFixture.cosineSimilarity,
      modelConfidence: calibrated.calibratedConfidence,
      dualModelAgreed: calibrated.dualModelAgreed,
    };
  }

  try {
    const geminiAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = geminiAi.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY! });

    const fullPrompt = `${prompt}\n${CONFIDENCE_INSTRUCTION}`;

    const [geminiResult, groqResult] = await Promise.all([
      geminiModel.generateContent(fullPrompt),
      groqClient.chat.completions.create({
        messages: [{ role: 'user', content: fullPrompt }],
        model: 'llama-3.1-8b-instant',
      }),
    ]);

    const geminiText = geminiResult.response.text();
    const groqText = groqResult.choices[0]?.message?.content || '';

    const geminiConfidence = parseConfidenceFromText(geminiText, 0.80);
    const groqConfidence = parseConfidenceFromText(groqText, 0.78);
    const cosineSimilarity = await computeResponseSimilarity(
      geminiText,
      groqText,
      process.env.GEMINI_API_KEY
    );

    const calibrated = calculateCalibratedConfidence(
      geminiConfidence,
      groqConfidence,
      cosineSimilarity
    );

    logger.info(
      `[LLM-ROUTER] Live dual-check: gemini=${geminiConfidence}, groq=${groqConfidence}, cosine=${cosineSimilarity}, agreed=${calibrated.dualModelAgreed}`
    );

    return {
      response: geminiText,
      geminiConfidence,
      groqConfidence,
      cosineSimilarity,
      modelConfidence: calibrated.calibratedConfidence,
      dualModelAgreed: calibrated.dualModelAgreed,
    };
  } catch (error) {
    logger.warn({ err: error }, '[LLM-ROUTER] Live call failed, falling back to mock response');

    const mockFixture = (contextTitle && MOCK_TRIAGE_RESPONSES[contextTitle]) || MOCK_DEFAULT_LLM_RESPONSE;
    const calibrated = calculateCalibratedConfidence(
      mockFixture.geminiConfidence,
      mockFixture.groqConfidence,
      mockFixture.cosineSimilarity
    );

    return {
      response: mockFixture.geminiText,
      geminiConfidence: mockFixture.geminiConfidence,
      groqConfidence: mockFixture.groqConfidence,
      cosineSimilarity: mockFixture.cosineSimilarity,
      modelConfidence: calibrated.calibratedConfidence,
      dualModelAgreed: calibrated.dualModelAgreed,
    };
  }
}

/** Evaluation 2: naive single-prompt baseline (Gemini only, no tools/RAG/CCEP). */
export async function generateNaiveSinglePrompt(prompt: string): Promise<{ response: string; confidence: number }> {
  const isMockMode =
    process.env.MOCK_MODE === 'true' ||
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === 'mock_gemini_key';

  if (isMockMode) {
    return { response: MOCK_DEFAULT_LLM_RESPONSE.geminiText, confidence: 0.70 };
  }

  try {
    const geminiAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = geminiAi.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await geminiModel.generateContent(`${prompt}\n${CONFIDENCE_INSTRUCTION}`);
    const text = result.response.text();
    return { response: text, confidence: parseConfidenceFromText(text, 0.75) };
  } catch {
    return { response: MOCK_DEFAULT_LLM_RESPONSE.geminiText, confidence: 0.70 };
  }
}
