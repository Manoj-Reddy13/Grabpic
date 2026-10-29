import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import config from '../config/index.js';

export class BlobService {
  constructor() {
    this.blobServiceClient = null;
    this.sharedKeyCredential = null;
    this.accountName = null;
    this.containerName = config.ai.azureContainerName;
    this.init();
  }

  init() {
    const connStr = config.ai.azureStorageConnectionString;
    if (config.ai.useBlobStorage && connStr) {
      try {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connStr);

        // Parse AccountName and AccountKey from connection string for SAS generation
        const parsed = {};
        for (const part of connStr.split(';')) {
          const idx = part.indexOf('=');
          if (idx !== -1) {
            const key = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();
            if (key && value) {
              parsed[key] = value;
            }
          }
        }

        if (parsed.AccountName && parsed.AccountKey) {
          this.accountName = parsed.AccountName;
          this.sharedKeyCredential = new StorageSharedKeyCredential(
            parsed.AccountName,
            parsed.AccountKey
          );
        }
      } catch (err) {
        console.error('Failed to initialize Azure BlobServiceClient:', err);
      }
    }
  }

  isAvailable() {
    return Boolean(config.ai.useBlobStorage && this.blobServiceClient && this.sharedKeyCredential);
  }

  /**
   * Generates a read-only SAS URL valid for 10 minutes.
   * Path: events/{eventId}/images/{imageId}
   *
   * @param {string} eventId
   * @param {string} imageId
   * @returns {string} SAS URL
   */
  generateSasUrl(eventId, imageId) {
    if (!this.isAvailable()) {
      throw new Error('Blob storage is not available or credentials missing');
    }

    const blobPath = `events/${eventId}/images/${imageId}`;
    const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      this.sharedKeyCredential
    ).toString();

    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(blobPath);
    return `${blobClient.url}?${sasToken}`;
  }
}

export const blobService = new BlobService();
