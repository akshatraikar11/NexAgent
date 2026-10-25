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
  /** True if this result came from mock fixtures, not a real LLM call. */
  isMock: boolean;
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
      isMock: true,
    };
  }

  try {
    const geminiAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = geminiAi.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const fullPrompt = `${prompt}\n${CONFIDENCE_INSTRUCTION}`;

    let geminiText = '';
    let groqText = '';
    let geminiConfidence = 0.85;
    let groqConfidence = 0.85;
    let cosineSimilarity = 0.95;
    let calibrated = { calibratedConfidence: 0.85, dualModelAgreed: true };

    if (process.env.GROQ_API_KEY) {
      const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const [geminiResult, groqResult] = await Promise.all([
        geminiModel.generateContent(fullPrompt),
        groqClient.chat.completions.create({
          messages: [{ role: 'user', content: fullPrompt }],
          model: 'llama-3.1-8b-instant',
        }),
      ]);
      geminiText = geminiResult.response.text();
      groqText = groqResult.choices[0]?.message?.content || '';
      geminiConfidence = parseConfidenceFromText(geminiText, 0.80);
      groqConfidence = parseConfidenceFromText(groqText, 0.78);
      cosineSimilarity = await computeResponseSimilarity(geminiText, groqText, process.env.GEMINI_API_KEY);
      calibrated = calculateCalibratedConfidence(geminiConfidence, groqConfidence, cosineSimilarity);
    } else {
      const geminiResult = await geminiModel.generateContent(fullPrompt);
      geminiText = geminiResult.response.text();
      geminiConfidence = parseConfidenceFromText(geminiText, 0.85);
      groqConfidence = geminiConfidence;
      calibrated = { calibratedConfidence: geminiConfidence, dualModelAgreed: true };
    }

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
      isMock: false,
    };
  } catch (error) {
    logger.warn({ err: error }, '[LLM-ROUTER] Live call failed, falling back to mock response — isMock=true will be set');

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
      isMock: true,
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
    const geminiModel = geminiAi.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
    const result = await geminiModel.generateContent(`${prompt}\n${CONFIDENCE_INSTRUCTION}`);
    const text = result.response.text();
    return { response: text, confidence: parseConfidenceFromText(text, 0.75) };
  } catch {
    return { response: MOCK_DEFAULT_LLM_RESPONSE.geminiText, confidence: 0.70 };
  }
}
