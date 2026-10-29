import dotenv from 'dotenv';

dotenv.config();

function trimSlash(url) {
  return url ? url.replace(/\/+$/, '') : '';
}

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  ai: {
    internalBaseUrl: trimSlash(process.env.AI_INTERNAL_BASE_URL || process.env.AI_BASE_URL || 'http://localhost:8000'),
    publicBaseUrl: trimSlash(process.env.AI_PUBLIC_BASE_URL || 'http://localhost:8000'),
    azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    azureContainerName: process.env.AZURE_CONTAINER_NAME || 'events',
    useBlobStorage: process.env.USE_BLOB_STORAGE === 'true',
  },
  imageTokenSecret: process.env.IMAGE_TOKEN_SECRET || 'defaultSecretKeyForTokensIfEnvMissing',
  // Limits matching Spring Boot properties (max file size 200MB, max request 500MB)
  maxFileSize: 200 * 1024 * 1024,
  maxRequestSize: 500 * 1024 * 1024,
};

export default config;
