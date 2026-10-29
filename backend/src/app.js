import express from 'express';
import cors from 'cors';
import multer from 'multer';
import eventRoutes from './routes/eventRoutes.js';

export function createApp() {
  const app = express();

  // Enable CORS matching Spring Boot WebConfig (all origins, all methods)
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['*'],
  }));

  // Body parsing for JSON and URL-encoded data
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoints (Spring Boot Actuator & standard health check)
  app.get(['/actuator/health', '/health'], (req, res) => {
    res.status(200).json({ status: 'UP' });
  });

  // Event routes
  app.use('/events', eventRoutes);

  // 404 Not Found handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File size exceeds 200MB limit' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }

    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';

    if (statusCode >= 500) {
      console.error('Unhandled server error:', err);
    }

    return res.status(statusCode).json({ error: message });
  });

  return app;
}

export default createApp();
