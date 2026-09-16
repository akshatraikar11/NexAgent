import { Response, Request } from 'express';
import { createSession, Session, Channel } from 'better-sse';
import { logger } from '../utils/logger.js';

export interface SSEEventData {
  runId: string;
  stepName: string;
  status: 'STARTED' | 'COMPLETED' | 'RETRYING' | 'FAILED';
  timestamp: string;
  data?: unknown;
}

class SSEManager {
  private channels: Map<string, Channel> = new Map();
  private globalChannel: Channel = new Channel();

  public getOrCreateChannel(runId: string): Channel {
    let channel = this.channels.get(runId);
    if (!channel) {
      channel = new Channel();
      this.channels.set(runId, channel);
    }
    return channel;
  }

  public async registerSession(runId: string, req: Request, res: Response): Promise<Session> {
    const session = await createSession(req, res);
    const channel = this.getOrCreateChannel(runId);
    channel.register(session);
    this.globalChannel.register(session);

    session.on('disconnected', () => {
      logger.info(`[SSE] Session disconnected for runId: ${runId}`);
    });

    return session;
  }

  public emitEvent(runId: string, event: SSEEventData): void {
    const channel = this.channels.get(runId);
    if (channel) {
      channel.broadcast(event, 'pipeline-update');
    }
    this.globalChannel.broadcast(event, 'pipeline-update');
  }

  public cleanupChannel(runId: string): void {
    const channel = this.channels.get(runId);
    if (channel) {
      this.channels.delete(runId);
    }
  }
}

export const sseManager = new SSEManager();
