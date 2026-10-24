import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const outputDir = path.resolve(process.cwd(), '../docs/audit/outputs');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'gemini_live_test.json');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === '' || apiKey === 'mock_gemini_key') {
    const report = {
      status: 'SKIPPED_NO_API_KEY',
      message: 'GEMINI_API_KEY is unset or set to mock in backend/.env. System operates under fixture MOCK_MODE.',
      timestamp: new Date().toISOString(),
      mockModeActive: true,
    };
    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log('[GEMINI TEST] No real GEMINI_API_KEY found in .env — recorded skip report to docs/audit/outputs/gemini_live_test.json');
    return;
  }

  console.log(`[GEMINI TEST] Attempting live call to Gemini API using key: ${apiKey.slice(0, 6)}...`);
  const startTime = Date.now();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

    const prompt = 'IT Support Diagnostic: User cannot connect to corporate VPN. RasMan service is stopped. Give 1 sentence concise recommendation.';
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const durationMs = Date.now() - startTime;

    const report = {
      status: 'SUCCESS',
      model: 'gemini-flash-lite-latest',
      prompt,
      responseText: responseText.trim(),
      latencyMs: durationMs,
      timestamp: new Date().toISOString(),
      usageMetadata: result.response.usageMetadata ?? null,
    };

    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[GEMINI TEST] SUCCESS (${durationMs}ms)! Output saved to docs/audit/outputs/gemini_live_test.json`);
    console.log('Response:', responseText.trim());
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const report = {
      status: 'FAILED',
      model: 'gemini-3.8-flash',
      error: err.message || String(err),
      latencyMs: durationMs,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[GEMINI TEST] API call failed (${durationMs}ms): ${err.message}`);
  }
}

main();
