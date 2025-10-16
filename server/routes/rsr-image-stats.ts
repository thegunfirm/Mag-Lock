import { Request, Response } from 'express';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: process.env.HETZNER_S3_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.HETZNER_S3_KEY || '',
    secretAccessKey: process.env.HETZNER_S3_SECRET || ''
  },
  forcePathStyle: true
});

interface ImageStats {
  bucket: string;
  prefix: string;
  scanned: number;
  cap: number;
  newestUploadedAt: string | null;
  oldestUploadedAt: string | null;
  distinctBaseSkus: number;
  byAngle: { [key: string]: number };
  newestSamples: { Key: string; LastModified: string }[];
  note: string;
}

export async function rsrImageStatsHandler(req: Request, res: Response) {
  try {
    const prefix = (req.query.prefix as string) || 'rsr/highres/';
    const maxParam = parseInt(req.query.max as string) || 10000;
    const max = Math.min(maxParam, 1000000);
    
    const bucket = process.env.HETZNER_S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: 'Bucket not configured' });
    }

    const stats: ImageStats = {
      bucket,
      prefix,
      scanned: 0,
      cap: max,
      newestUploadedAt: null,
      oldestUploadedAt: null,
      distinctBaseSkus: 0,
      byAngle: { unspecified: 0 },
      newestSamples: [],
      note: ''
    };

    const allImages: { Key: string; LastModified: Date }[] = [];
    let continuationToken: string | undefined;
    let newestDate: Date | null = null;
    let oldestDate: Date | null = null;
    const baseSkuSet = new Set<string>();

    // Paginate through bucket
    while (stats.scanned < max) {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });

      const response = await s3Client.send(command);
      
      if (!response.Contents) break;

      for (const obj of response.Contents) {
        if (!obj.Key) continue;
        
        // Check if it's an image
        const isImage = /\.(jpg|jpeg|png|webp)$/i.test(obj.Key);
        if (!isImage) continue;

        stats.scanned++;
        
        // Track newest and oldest
        if (obj.LastModified) {
          if (!newestDate || obj.LastModified > newestDate) {
            newestDate = obj.LastModified;
          }
          if (!oldestDate || obj.LastModified < oldestDate) {
            oldestDate = obj.LastModified;
          }
          allImages.push({
            Key: obj.Key,
            LastModified: obj.LastModified
          });
        }

        // Parse angle from filename and extract base SKU
        const angleMatch = obj.Key.match(/^(.*)_(\d+)_HR\.\w+$/);
        if (angleMatch) {
          const baseSku = angleMatch[1];
          const angle = angleMatch[2];
          
          // Track distinct base SKUs (only for items with angle pattern)
          baseSkuSet.add(baseSku);
          
          // Count by angle
          stats.byAngle[angle] = (stats.byAngle[angle] || 0) + 1;
        } else {
          stats.byAngle.unspecified++;
        }

        if (stats.scanned >= max) {
          stats.note = 'Reached scan cap; increase ?max=';
          break;
        }
      }

      if (!response.IsTruncated) break;
      continuationToken = response.NextContinuationToken;
      
      if (stats.scanned >= max) break;
    }

    // Set newest and oldest dates
    if (newestDate) {
      stats.newestUploadedAt = newestDate.toISOString();
    }
    if (oldestDate) {
      stats.oldestUploadedAt = oldestDate.toISOString();
    }
    
    // Set distinct base SKU count
    stats.distinctBaseSkus = baseSkuSet.size;

    // Get 10 newest samples
    allImages.sort((a, b) => b.LastModified.getTime() - a.LastModified.getTime());
    stats.newestSamples = allImages.slice(0, 10).map(img => ({
      Key: img.Key,
      LastModified: img.LastModified.toISOString()
    }));

    return res.json(stats);
  } catch (error) {
    console.error('RSR Image Stats Error:', error);
    return res.status(500).json({ 
      error: 'Failed to get image stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}