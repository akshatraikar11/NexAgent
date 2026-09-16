export interface SlackMessageMockResult {
  ok: boolean;
  channel: string;
  ts: string;
  message: string;
}

export function createMockSlackResult(channel: string, message: string): SlackMessageMockResult {
  return {
    ok: true,
    channel,
    ts: `${Date.now() / 1000}`,
    message,
  };
}
