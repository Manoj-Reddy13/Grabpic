import app from './app.js';
import config from './config/index.js';

const server = app.listen(config.port, () => {
  console.log(`===============================================`);
  console.log(`GrabPic Node.js Backend is running!`);
  console.log(`Port:                 ${config.port}`);
  console.log(`AI Internal Base URL: ${config.ai.internalBaseUrl}`);
  console.log(`AI Public Base URL:   ${config.ai.publicBaseUrl}`);
  console.log(`Azure Blob Storage:   ${config.ai.useBlobStorage ? 'Enabled' : 'Disabled'}`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`Received ${signal}. Shutting down server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after timeout if pending connections hang
  setTimeout(() => {
    console.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
