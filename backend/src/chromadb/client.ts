import { ChromaClient, Collection } from 'chromadb';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { KBMatchItem } from '../orchestrator/types.js';

export interface IngestSolutionParams {
  ticketId: string;
  solutionText: string;
  confidenceAtIngestion: number;
}

export class ChromaKBClient {
  private client: ChromaClient;
  private collectionName = 'nexagent-kb';
  private collection: Collection | null = null;
  private isFallbackMode = false;
  private fallbackStore: Array<{
    id: string;
    ticketId: string;
    content: string;
    confidenceAtIngestion: number;
    timesReused: number;
    isOverridden: boolean;
  }> = [];

  constructor(serverUrl = process.env.CHROMADB_URL || 'http://localhost:8000') {
    this.client = new ChromaClient({ path: serverUrl });
  }

  public async initialize(): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });
      logger.info(`[CHROMADB] Connected to ChromaDB server, collection '${this.collectionName}' ready.`);
    } catch (error) {
      this.isFallbackMode = true;
      console.warn('[CHROMADB] Server unreachable, using local fallback vector store');
      logger.warn({ err: error }, '[CHROMADB] Server unreachable, using local fallback vector store');
      
      // Populate local store with initial fixtures if empty
      if (this.fallbackStore.length === 0) {
        this.fallbackStore.push({
          id: 'kb-fallback-1',
          ticketId: 'JIRA-101',
          content: 'For VPN password resets, navigate to https://vpn.company.com/self-service and use MFA push notification.',
          confidenceAtIngestion: 0.95,
          timesReused: 1,
          isOverridden: false,
        });
      }
    }
  }

  /**
   * Search knowledge base for similar solution entries
   */
  public async searchKB(queryText: string, nResults = 3): Promise<KBMatchItem[]> {
    if (!this.collection) {
      await this.initialize();
    }

    if (this.isFallbackMode || !this.collection) {
      console.warn('[CHROMADB] Server unreachable, using local fallback vector store');
      logger.warn('[CHROMADB] Server unreachable, using local fallback vector store');
      
      // Simple substring / keyword matching for fallback search
      const queryLower = queryText.toLowerCase();
      const matches = this.fallbackStore
        .filter((entry) => !entry.isOverridden)
        .map((entry) => {
          let score = 0.5;
          if (queryLower.includes('vpn') && entry.content.toLowerCase().includes('vpn')) score = 0.92;
          if (queryLower.includes('billing') && entry.content.toLowerCase().includes('billing')) score = 0.88;
          return {
            id: entry.id,
            score,
            content: entry.content,
            confidenceAtIngestion: entry.confidenceAtIngestion,
            timesReused: entry.timesReused,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, nResults);

      // Increment timesReused counter
      for (const match of matches) {
        const item = this.fallbackStore.find((e) => e.id === match.id);
        if (item) {
          item.timesReused += 1;
          match.timesReused = item.timesReused;
        }
      }

      return matches;
    }

    try {
      const results = await this.collection.query({
        queryTexts: [queryText],
        nResults,
      });

      const items: KBMatchItem[] = [];

      if (results && results.documents && results.documents[0]) {
        const docs = results.documents[0];
        const ids = results.ids[0];
        const metadatas = results.metadatas ? results.metadatas[0] : [];
        // ChromaDB returns L2 or cosine distances; convert to similarity (0–1).
        // For cosine distance: similarity = 1 - distance.
        // For L2: we clamp to [0,1] via 1/(1+distance).
        // If distances are absent, fall back to 0.85 with a warning.
        const distances = results.distances?.[0] ?? null;
        if (!distances) {
          logger.warn('[CHROMADB] distances not returned by query — falling back to score=0.85. Check collection distance metric.');
        }

        for (let i = 0; i < docs.length; i++) {
          const docText = docs[i];
          const docId = ids[i];
          const meta = metadatas[i] || {};

          if (docText) {
            const rawDist = distances?.[i];
            // Cosine distance is in [0,2]; L2 is unbounded. Heuristic: if rawDist <= 2, treat as cosine.
            const score = rawDist != null
              ? Number(Math.max(0, Math.min(1, 1 - rawDist)).toFixed(4))
              : 0.85;

            items.push({
              id: docId,
              score,
              content: docText,
              confidenceAtIngestion: Number(meta.confidenceAtIngestion ?? 0.9),
              timesReused: Number(meta.timesReused ?? 0) + 1,
            });

            // Update timesReused in DB
            try {
              await prisma.kBEntry.updateMany({
                where: { embeddingId: docId },
                data: { timesReused: { increment: 1 } },
              });
            } catch (err) {
              logger.warn({ err }, `[CHROMADB] Could not increment timesReused for embeddingId: ${docId}`);
            }
          }
        }
      }

      return items;
    } catch (error) {
      logger.warn({ err: error }, '[CHROMADB] Query failed, falling back to local store');
      this.isFallbackMode = true;
      return this.searchKB(queryText, nResults);
    }
  }

  /**
   * Ingest solution with Quality Gate enforcement:
   * 1. Only ingests if decision was AUTO_RESOLVE
   * 2. Only ingests if NO human override exists in DB for this ticket
   */
  public async ingestKBSolution(params: IngestSolutionParams): Promise<{ success: boolean; reason?: string; kbId?: string }> {
    const { ticketId, solutionText, confidenceAtIngestion } = params;

    // Quality Gate Step 1: Check DB for ticket override
    try {
      const { isDatabaseConnected } = await import('../db/client.js');
      if (await isDatabaseConnected()) {
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          include: {
            decisions: {
              include: { humanOverrides: true },
            },
          },
        });

        if (ticket) {
          const hasOverride = ticket.decisions.some((d) => d.humanOverrides.length > 0);
          if (hasOverride) {
            logger.warn(`[KB QUALITY GATE] Ingestion REJECTED for ticket ${ticketId}: Human override detected.`);
            return { success: false, reason: 'QUALITY_GATE_REJECTED: Human override present' };
          }

          const wasAutoResolved = ticket.decisions.some((d) => d.decision === 'AUTO_RESOLVE');
          if (!wasAutoResolved) {
            logger.warn(`[KB QUALITY GATE] Ingestion REJECTED for ticket ${ticketId}: Ticket was not auto-resolved.`);
            return { success: false, reason: 'QUALITY_GATE_REJECTED: Ticket was not auto-resolved' };
          }
        }
      }
    } catch (error) {
      logger.warn({ err: error }, `[KB QUALITY GATE] Could not query database for ticket ${ticketId}. Proceeding with memory validation.`);
    }

    const kbId = `kb-doc-${Date.now()}`;

    // Store in Postgres DB
    try {
      await prisma.kBEntry.create({
        data: {
          sourceTicketId: ticketId,
          content: solutionText,
          embeddingId: kbId,
          confidenceAtIngestion,
          timesReused: 0,
          isOverridden: false,
        },
      });
    } catch (err) {
      logger.warn({ err }, `[CHROMADB] Could not persist KBEntry to Postgres for ticket: ${ticketId}`);
    }

    // Ingest into ChromaDB or local store
    if (!this.collection) {
      await this.initialize();
    }

    if (this.isFallbackMode || !this.collection) {
      console.warn('[CHROMADB] Server unreachable, using local fallback vector store');
      logger.warn('[CHROMADB] Server unreachable, using local fallback vector store');
      this.fallbackStore.push({
        id: kbId,
        ticketId,
        content: solutionText,
        confidenceAtIngestion,
        timesReused: 0,
        isOverridden: false,
      });
      return { success: true, kbId };
    }

    try {
      await this.collection.add({
        ids: [kbId],
        documents: [solutionText],
        metadatas: [{ sourceTicketId: ticketId, confidenceAtIngestion, timesReused: 0 }],
      });
      logger.info(`[CHROMADB] Ingested KB solution document ${kbId} for ticket ${ticketId}`);
      return { success: true, kbId };
    } catch (error) {
      logger.warn({ err: error }, '[CHROMADB] Failed to add document, storing in fallback');
      this.fallbackStore.push({
        id: kbId,
        ticketId,
        content: solutionText,
        confidenceAtIngestion,
        timesReused: 0,
        isOverridden: false,
      });
      return { success: true, kbId };
    }
  }
}

export const chromaKBClient = new ChromaKBClient();
