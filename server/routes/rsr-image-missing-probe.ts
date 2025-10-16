import { Request, Response } from 'express';
import { db } from '../db';
import { products } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { rsrImageFetcher } from '../services/rsr-image-fetcher';

interface ProbeResult {
  sku: string;
  variant: 'raw' | 'underscoreToHyphen' | 'hyphenToUnderscore' | 'stripped';
  source: 'hr' | 'std';
  status: number;
  host: string;
  path: string;
}

interface ProbeResponse {
  tested: number;
  found: number;
  statusCounts: { [key: string]: number };
  patternHits: { 
    raw: number;
    underscoreToHyphen: number;
    hyphenToUnderscore: number;
    stripped: number;
  };
  sourceHits: { hr: number; std: number };
  samples: ProbeResult[];
  note: string;
}

export async function rsrImageMissingProbeHandler(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 200;
    const angle = parseInt(req.query.angle as string) || 1;

    // Get active RSR SKUs from database
    const rsrProducts = await db
      .select()
      .from(products)
      .where(sql`rsr_stock_number IS NOT NULL AND rsr_stock_number != ''`);

    const activeSkus = new Set<string>();
    rsrProducts.forEach(p => {
      const rsrStockNumber = (p as any).rsrStockNumber || p.rsr_stock_number;
      if (rsrStockNumber) {
        activeSkus.add(rsrStockNumber.toUpperCase());
      }
    });

    // Get bucket distinct base SKUs
    const s3Client = new S3Client({
      endpoint: process.env.HETZNER_S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.HETZNER_S3_KEY || '',
        secretAccessKey: process.env.HETZNER_S3_SECRET || ''
      },
      forcePathStyle: true
    });

    const bucketBaseSkus = new Set<string>();
    let continuationToken: string | undefined;
    let scanned = 0;
    const maxScan = 100000;

    const bucket = process.env.HETZNER_S3_BUCKET || 'tgf-images';
    const prefix = 'rsr/highres/';
    
    while (scanned < maxScan) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });

      const listResponse = await s3Client.send(listCommand);
      
      if (!listResponse.Contents) break;

      for (const obj of listResponse.Contents) {
        if (!obj.Key) continue;
        
        // Extract base SKU from key like "rsr/highres/GLUX4350204FRNMOOSKY_1_HR.jpg"
        const filename = obj.Key.split('/').pop() || '';
        const match = filename.match(/^(.*)_(\d+)_HR\.\w+$/);
        if (match) {
          bucketBaseSkus.add(match[1]);
        }
        scanned++;
      }

      if (!listResponse.IsTruncated) break;
      continuationToken = listResponse.NextContinuationToken;
      
      if (scanned >= maxScan) break;
    }

    // Build missing set = active RSR SKUs - bucket distinct base SKUs
    const missingSkus = Array.from(activeSkus).filter(sku => !bucketBaseSkus.has(sku));

    // Randomly sample up to limit
    const shuffled = missingSkus.sort(() => Math.random() - 0.5);
    const sampledSkus = shuffled.slice(0, limit);

    // Initialize counters
    const statusCounts: { [key: string]: number } = {};
    const patternHits = {
      raw: 0,
      underscoreToHyphen: 0,
      hyphenToUnderscore: 0,
      stripped: 0
    };
    const sourceHits = { hr: 0, std: 0 };
    const samples: ProbeResult[] = [];
    let tested = 0;
    let found = 0;

    // Generate SKU variants
    function generateVariants(sku: string): Array<{ variant: string, type: keyof typeof patternHits }> {
      return [
        { variant: sku, type: 'raw' },
        { variant: sku.replace(/_/g, '-'), type: 'underscoreToHyphen' },
        { variant: sku.replace(/-/g, '_'), type: 'hyphenToUnderscore' },
        { variant: sku.replace(/[._-]/g, ''), type: 'stripped' }
      ];
    }

    // Suppress debug logging during probe
    const originalDebug = process.env.RSR_IMAGE_DEBUG;
    if (originalDebug === '1') {
      process.env.RSR_IMAGE_DEBUG = '0';
    }

    try {
      // Test each sampled SKU
      for (const sku of sampledSkus) {
        tested++;
        let skuFound = false;

        const variants = generateVariants(sku);
        
        // Try each variant until we find one that works
        for (const { variant, type } of variants) {
          if (skuFound) break;

          try {
            // Use shared fetcher with sizeMode=auto (HR then STD fallback)
            const result = await rsrImageFetcher.fetch({
              sku: variant,
              angle: angle,
              sizeMode: 'auto',
              debug: false
            });

            const urlObj = new URL(result.url);
            const status = result.status;
            const statusKey = status === 200 ? '200' : 
                             status === 404 ? '404' :
                             status === 302 ? '302' :
                             status === 403 ? '403' : 'other';

            statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

            // If successful, record the hit
            if (result.success && result.status === 200) {
              patternHits[type]++;
              sourceHits[result.source as 'hr' | 'std']++;
              found++;
              skuFound = true;

              samples.push({
                sku,
                variant: type,
                source: result.source as 'hr' | 'std',
                status: result.status,
                host: urlObj.host,
                path: urlObj.pathname
              });
            } else if (samples.length < 25) {
              // Include some failure samples for debugging
              samples.push({
                sku,
                variant: type,
                source: result.source === 'none' ? 'hr' : result.source as 'hr' | 'std',
                status: result.status,
                host: urlObj.host,
                path: urlObj.pathname
              });
            }

            break; // Only try first variant for each SKU for now
          } catch (error) {
            // Continue to next variant on error
            continue;
          }
        }
      }
    } finally {
      // Restore original debug setting
      if (originalDebug === '1') {
        process.env.RSR_IMAGE_DEBUG = '1';
      }
    }

    const response: ProbeResponse = {
      tested,
      found,
      statusCounts,
      patternHits,
      sourceHits,
      samples: samples.slice(0, 25), // Limit samples in response
      note: "probe only; no uploads performed"
    };

    res.json(response);
    
  } catch (error) {
    console.error('Error in RSR image missing probe:', error);
    res.status(500).json({ 
      error: 'Failed to probe missing RSR images',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}