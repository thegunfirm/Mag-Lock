import { Request, Response } from 'express';
import axios from 'axios';

interface GapAnalysisResponse {
  totalActiveSkus: number;
  haveImagesCount: number;
  missingImagesCount: number;
  coveragePct: number;
  sampleMissingSkus: string[];
  bucketDistinctBaseSkus: number;
  bucketScanned: number;
  oldestUploadedAt: string;
  newestUploadedAt: string;
  note: string;
}

interface ImageStatsResponse {
  bucket: string;
  prefix: string;
  scanned: number;
  cap: number;
  newestUploadedAt?: string;
  oldestUploadedAt?: string;
  distinctBaseSkus?: number;
  byAngle?: Record<string, number>;
  newestSamples?: Array<{ Key: string; LastModified: string }>;
  note?: string;
}

export async function rsrImageHealthHandler(req: Request, res: Response) {
  try {
    const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    
    // Call gap analysis endpoint
    const gapResponse = await axios.get<GapAnalysisResponse>(
      `${baseUrl}/api/rsr-image-gap?maxSkus=100000`,
      { timeout: 60000 }
    );
    
    // Call stats endpoint  
    const statsResponse = await axios.get<ImageStatsResponse>(
      `${baseUrl}/api/rsr-image-stats?prefix=rsr/highres/&max=200000`,
      { timeout: 60000 }
    );
    
    const gapData = gapResponse.data;
    const statsData = statsResponse.data;
    
    // Extract health metrics
    const coveragePct = gapData.coveragePct;
    const have = gapData.haveImagesCount;
    const missing = gapData.missingImagesCount;
    const newestUploadedAt = statsData.newestUploadedAt || '';
    
    // Check coverage threshold (98%)
    const coverageThreshold = 98;
    const coverageHealthy = coveragePct >= coverageThreshold;
    
    // Check freshness (within 24 hours)
    let freshnessHealthy = false;
    if (newestUploadedAt) {
      const uploadTime = new Date(newestUploadedAt);
      const now = new Date();
      const hoursDiff = (now.getTime() - uploadTime.getTime()) / (1000 * 60 * 60);
      freshnessHealthy = hoursDiff <= 24;
    }
    
    const isHealthy = coverageHealthy && freshnessHealthy;
    
    if (isHealthy) {
      // 200 OK when PASS
      res.status(200).json({
        ok: true,
        coveragePct,
        have,
        missing,
        newestUploadedAt,
        reason: "healthy"
      });
    } else {
      // 503 Service Unavailable when FAIL
      let reason = "";
      if (!coverageHealthy && !freshnessHealthy) {
        reason = `coverage ${coveragePct}% below ${coverageThreshold}% threshold and uploads stale (${newestUploadedAt})`;
      } else if (!coverageHealthy) {
        reason = `coverage ${coveragePct}% below ${coverageThreshold}% threshold`;
      } else {
        reason = `uploads stale (${newestUploadedAt})`;
      }
      
      const nextAction = `curl -s -X POST "$HOST/api/rsr-image-backfill/run" -H "Content-Type: application/json" -d '{ "angles":"1", "onlyMissing":true, "sizeMode":"std", "scope":"missingSkus", "concurrency":3 }'`;
      
      res.status(503).json({
        ok: false,
        coveragePct,
        have,
        missing,
        newestUploadedAt,
        reason,
        nextAction
      });
    }
    
  } catch (error) {
    console.error('Error in RSR image health check:', error);
    res.status(503).json({
      ok: false,
      coveragePct: 0,
      have: 0,
      missing: 0,
      newestUploadedAt: "",
      reason: "health check failed - unable to fetch metrics",
      nextAction: `curl -s -X POST "$HOST/api/rsr-image-backfill/run" -H "Content-Type: application/json" -d '{ "angles":"1", "onlyMissing":true, "sizeMode":"std", "scope":"missingSkus", "concurrency":3 }'`
    });
  }
}