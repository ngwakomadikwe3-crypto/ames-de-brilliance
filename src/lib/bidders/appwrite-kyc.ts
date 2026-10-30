import { InputFile } from 'node-appwrite/file';
import { BIDDER_KYC_BUCKET, getStorage } from '../appwrite.ts';
import type { KycStorage } from './kyc.ts';

/**
 * Appwrite storage adapter for bidder KYC documents. The bucket is private
 * (no client permissions); bytes move only through these server-side calls.
 */
export class AppwriteKycStorage implements KycStorage {
  async createFile(fileId: string, bytes: Uint8Array, fileName: string, _contentType: string): Promise<void> {
    await getStorage().createFile({
      bucketId: BIDDER_KYC_BUCKET,
      fileId,
      file: InputFile.fromBuffer(Buffer.from(bytes), fileName),
    });
  }

  async getFileBytes(fileId: string): Promise<Uint8Array> {
    const view = await getStorage().getFileView({ bucketId: BIDDER_KYC_BUCKET, fileId });
    return new Uint8Array(view);
  }

  async deleteFile(fileId: string): Promise<void> {
    await getStorage().deleteFile({ bucketId: BIDDER_KYC_BUCKET, fileId });
  }
}
