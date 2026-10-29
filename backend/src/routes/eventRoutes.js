import { Router } from 'express';
import multer from 'multer';
import config from '../config/index.js';
import { eventController } from '../controllers/eventController.js';

const router = Router();

// Configure Multer with memory storage and matching Spring Boot file limits (200MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: 1000,
  },
});

router.post('/', eventController.createEvent);
router.post('/:eventId/upload', upload.array('files'), eventController.uploadImages);
router.post('/:eventId/search', upload.array('files'), eventController.searchImages);
router.get('/:eventId/download', eventController.downloadAll);

export default router;
