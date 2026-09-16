import { Router, Response, Request } from 'express';
import { prisma } from '../db/client.js';
import { isDatabaseConnected } from '../db/client.js';
import { loadCCEPWeights } from '../ccep/weights.js';
import { DEFAULT_REVERSIBILITY_MAP } from '../ccep/signals.js';
import { UpdateSettingsInputSchema } from '../schemas/settings.schema.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { z } from 'zod';

export const settingsRouter = Router();

settingsRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    const weights = loadCCEPWeights();

    res.json({
      ccepThreshold: settings?.ccepThreshold ?? 0.60,
      weights: settings?.weights ?? weights,
      reversibilityMap: settings?.reversibilityMap ?? DEFAULT_REVERSIBILITY_MAP,
      updatedAt: settings?.updatedAt ? settings.updatedAt.toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = UpdateSettingsInputSchema.parse(req.body);

    const settings = await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: {
        ...(input.ccepThreshold !== undefined && { ccepThreshold: input.ccepThreshold }),
        ...(input.weights !== undefined && { weights: JSON.parse(JSON.stringify(input.weights)) }),
        ...(input.reversibilityMap !== undefined && { reversibilityMap: JSON.parse(JSON.stringify(input.reversibilityMap)) }),
      },
      create: {
        id: 'singleton',
        ccepThreshold: input.ccepThreshold ?? 0.60,
        weights: JSON.parse(JSON.stringify(input.weights ?? loadCCEPWeights())),
        reversibilityMap: JSON.parse(JSON.stringify(input.reversibilityMap ?? DEFAULT_REVERSIBILITY_MAP)),
      },
    });

    // Record weight history entry whenever weights are updated
    if (input.weights) {
      const dbConnected = await isDatabaseConnected();
      if (dbConnected) {
        try {
          await prisma.weightHistory.create({
            data: {
              w1: input.weights.w1,
              w2: input.weights.w2,
              w3: input.weights.w3,
              w4: input.weights.w4,
              source: 'manual',
            },
          });
        } catch (_) {
          // Non-fatal: history recording failure does not block settings update
        }
      }
    }

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /settings/weight-history
 * Returns time-series of w1–w4 weight changes for the Weight Drift Analytics page.
 * Each entry: { id, w1, w2, w3, w4, source, createdAt }
 * If DB is offline, returns empty array (documented in DEVIATIONS.md).
 */
settingsRouter.get('/weight-history', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) {
      res.json([]);
      return;
    }

    const history = await prisma.weightHistory.findMany({
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    res.json(history);
  } catch (error) {
    next(error);
  }
});

const FittedWeightsSchema = z.object({
  w1: z.number(),
  w2: z.number(),
  w3: z.number(),
  w4: z.number(),
  source: z.enum(['fit_weights', 'manual']).default('fit_weights'),
});

/**
 * POST /settings/record-fitted-weights
 * Called by fit_weights.py after offline fitting to record WeightHistory.
 * Protected by X-Fit-Weights-Secret header (not JWT — offline script has no token).
 */
settingsRouter.post('/record-fitted-weights', async (req: Request, res: Response, next) => {
  try {
    const secret = req.headers['x-fit-weights-secret'];
    if (secret !== config.fitWeightsSecret) {
      res.status(401).json({ error: 'Invalid fit-weights secret' });
      return;
    }

    const input = FittedWeightsSchema.parse(req.body);
    const dbConnected = await isDatabaseConnected();

    if (dbConnected) {
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        update: { weights: { w1: input.w1, w2: input.w2, w3: input.w3, w4: input.w4 } },
        create: {
          id: 'singleton',
          ccepThreshold: 0.60,
          weights: { w1: input.w1, w2: input.w2, w3: input.w3, w4: input.w4 },
          reversibilityMap: DEFAULT_REVERSIBILITY_MAP,
        },
      });

      await prisma.weightHistory.create({
        data: {
          w1: input.w1,
          w2: input.w2,
          w3: input.w3,
          w4: input.w4,
          source: input.source,
        },
      });
    }

    res.json({ success: true, recorded: dbConnected });
  } catch (error) {
    next(error);
  }
});
