import { Router } from 'express';
import multer from 'multer';
import config from '../config/index.js';
import { eventController } from '../controllers/eventController.js';
import { notificationController } from '../controllers/notificationController.js';
import socialRoutes from './socialRoutes.js';
import collaboratorRoutes from './collaboratorRoutes.js';
import { requireEventRole } from '../middleware/auth.js';

const router = Router();

// Configure Multer with memory storage (200MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: 1000,
  },
});

// Event Core
router.post('/', eventController.createEvent);
router.get('/:eventId', eventController.getEvent);

// Upload: Photographers, Admins, and Owners can upload
router.post(
  '/:eventId/upload',
  requireEventRole(['owner', 'admin', 'photographer']),
  upload.array('files'),
  eventController.uploadImages
);

// Search & Download: Accessible to guests & viewers
router.post('/:eventId/search', upload.array('files'), eventController.searchImages);
router.get('/:eventId/download', eventController.downloadAll);

// Social Features (Likes & Comments)
router.use('/:eventId', socialRoutes);

// Collaborator Management
router.use('/:eventId/collaborators', collaboratorRoutes);

// Guest Face Profile Registration (Biometric notifications)
router.post('/:eventId/register-profile', notificationController.registerGuestProfile);
router.delete('/:eventId/register-profile', notificationController.deleteGuestProfile);

export default router;
