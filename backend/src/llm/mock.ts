export interface LLMResponseMock {
  geminiText: string;
  geminiConfidence: number;
  groqText: string;
  groqConfidence: number;
  cosineSimilarity: number;
}

export const MOCK_TRIAGE_RESPONSES: Record<string, LLMResponseMock> = {
  'VPN Access Password Reset Request': {
    geminiText: 'Auto-resolution path: Direct user to VPN self-service portal at https://vpn.company.com/self-service. Reset token generated.',
    geminiConfidence: 0.95,
    groqText: 'Direct user to self-service portal for password reset.',
    groqConfidence: 0.90,
    cosineSimilarity: 0.92, // High similarity -> agree
  },
  'Double Charged Billing Dispute': {
    geminiText: 'Escalation recommended: Billing transaction requires financial authorization for credit card refund of $149.00.',
    geminiConfidence: 0.42,
    groqText: 'Refund requested for double charge. Escalating to Finance team for manual processing.',
    groqConfidence: 0.38,
    cosineSimilarity: 0.71,
  },
  'Database High Latency & Drop Warning': {
    geminiText: 'Production database connection pool exhausted. Recommend immediate SRE escalation and connection proxy restart.',
    geminiConfidence: 0.30,
    groqText: 'Critical infra alert — escalate to on-call. Do not auto-remediate without human approval.',
    groqConfidence: 0.25,
    cosineSimilarity: 0.72, // Disagree — confidence halved
  },
  'Payment processing service down': {
    geminiText: 'P0 incident: payment API 100% error rate. All hands on deck required.',
    geminiConfidence: 0.15,
    groqText: 'Critical payment outage — escalate immediately to payments team and executive stakeholders.',
    groqConfidence: 0.12,
    cosineSimilarity: 0.91,
  },
};

export const MOCK_DEFAULT_LLM_RESPONSE: LLMResponseMock = {
  geminiText: 'Standard automated analysis completed for ticket triage.',
  geminiConfidence: 0.85,
  groqText: 'Standard automated analysis completed.',
  groqConfidence: 0.80,
  cosineSimilarity: 0.89,
};
