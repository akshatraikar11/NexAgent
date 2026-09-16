/**
 * Notification Center Routes — in-app notification system
 * Mirrors ServiceNow's notification panel and PagerDuty's alert feed.
 *
 * GET    /notifications              — list notifications for current user (+ broadcasts)
 * GET    /notifications/unread-count — quick badge count
 * PATCH  /notifications/:id/read     — mark one as read
 * PATCH  /notifications/read-all     — mark all as read
 * POST   /notifications              — create notification (internal/admin only)
 * DELETE /notifications/:id          — delete a notification
 */
import { Router, Response } from 'express';
import { prisma } from '../db/client.js';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { CreateNotificationSchema } from '../schemas/sla.schema.js';

export const notificationsRouter = Router();

// Helper: create a notification (used internally by other routes too)
export async function createNotification(params: {
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  severity?: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
      severity: params.severity ?? 'INFO',
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    },
  });
}

// GET /notifications
notificationsRouter.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 100);
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [{ userId }, { userId: null }], // personal + broadcasts
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(notifications);
  } catch (err) { next(err); }
});

// GET /notifications/unread-count
notificationsRouter.get('/unread-count', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const count = await prisma.notification.count({
      where: {
        OR: [{ userId }, { userId: null }],
        isRead: false,
      },
    });
    res.json({ count });
  } catch (err) { next(err); }
});

// PATCH /notifications/:id/read
notificationsRouter.patch('/:id/read', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: String(req.params.id) },
      data: { isRead: true, readAt: new Date() },
    });
    res.json(notification);
  } catch (err) { next(err); }
});

// PATCH /notifications/read-all
notificationsRouter.patch('/read-all', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({
      where: {
        OR: [{ userId }, { userId: null }],
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /notifications (internal/admin)
notificationsRouter.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const input = CreateNotificationSchema.parse(req.body);
    const notification = await createNotification(input);
    res.status(201).json(notification);
  } catch (err) { next(err); }
});

// DELETE /notifications/:id
notificationsRouter.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    await prisma.notification.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) { next(err); }
});
