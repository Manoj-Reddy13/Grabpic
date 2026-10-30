import { Router } from 'express';
import { collaboratorController } from '../controllers/collaboratorController.js';
import { requireEventRole } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', collaboratorController.getCollaborators);
router.post('/invite', requireEventRole(['owner', 'admin']), collaboratorController.inviteCollaborator);
router.post('/respond', collaboratorController.respondInvitation);
router.patch('/:userId/role', requireEventRole(['owner', 'admin']), collaboratorController.updateRole);
router.delete('/:userId', requireEventRole(['owner', 'admin']), collaboratorController.removeCollaborator);
router.get('/activity', collaboratorController.getActivityHistory);

export default router;
