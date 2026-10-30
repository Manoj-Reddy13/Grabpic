import { Router } from 'express';
import { socialController } from '../controllers/socialController.js';

const router = Router({ mergeParams: true });

router.post('/photos/:photoId/like', socialController.toggleLike);
router.get('/photos/:photoId/likes', socialController.getLikes);
router.get('/likes-summary', socialController.getBulkLikes);
router.post('/photos/:photoId/comments', socialController.addComment);
router.get('/photos/:photoId/comments', socialController.getComments);
router.delete('/comments/:commentId', socialController.deleteComment);

export default router;

