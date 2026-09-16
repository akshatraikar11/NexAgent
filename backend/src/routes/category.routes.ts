import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { z } from 'zod';

export const categoryRouter = Router();

const CreateCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

categoryRouter.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = CreateCategorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: { name: input.name, description: input.description },
    });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

categoryRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});
