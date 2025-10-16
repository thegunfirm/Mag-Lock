export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size: 'thumbnail' | 'standard' | 'large' | 'original';
  quality: 'low' | 'medium' | 'high';
  loadPriority: 'high' | 'medium' | 'low';
}

export interface ProductImage {
  id: string;
  alt: string;
  variants: ImageVariant[];
  primaryVariant: ImageVariant;
  fallbackUrl?: string;
}

class ImageService {
  private rsrImageBaseUrl = 'https://www.rsrgroup.com/images/inventory';
  
  /**
   * Generate multiple image variants from RSR image name
   * RSR follows these patterns:
   * - Thumbnails: https://www.rsrgroup.com/images/inventory/thumb/{STOCK}.jpg
   * - Product: https://www.rsrgroup.com/images/inventory/{STOCK}.jpg  
   * - High-res: https://www.rsrgroup.com/images/inventory/large/{STOCK}.jpg
   */
  generateRSRImageVariants(imageName: string, productName: string): ProductImage {
    const cleanImageName = imageName.replace(/\.(jpg|jpeg|png|gif)$/i, '');
    const imageId = `rsr-${cleanImageName}`;
    
    // RSR provides exactly 7 image views per product (_1.jpg through _7.jpg)
    const variants: ImageVariant[] = [];
    
    // Generate all 7 possible image views (standard resolution)
    for (let view = 1; view <= 7; view++) {
      variants.push({
        url: `/api/rsr-image/${cleanImageName}?size=standard&view=${view}`,
        width: 400,
        height: 400,
        size: 'standard',
        quality: 'medium',
        loadPriority: view === 1 ? 'high' : 'medium'
      });
    }

    return {
      id: imageId,
      alt: `${productName} - Product Image`,
      variants,
      primaryVariant: variants[0], // First view as primary
      fallbackUrl: `/api/rsr-image/${cleanImageName}?size=standard&view=1`
    };
  }

  /**
   * Get optimal image variant based on context
   */
  getOptimalVariant(
    productImage: ProductImage, 
    context: 'card' | 'detail' | 'zoom' | 'gallery'
  ): ImageVariant {
    const { variants } = productImage;
    
    switch (context) {
      case 'card':
        return variants.find(v => v.size === 'standard') || variants[0];
      case 'detail':
        return variants.find(v => v.size === 'standard') || variants[0];
      case 'zoom':
        return variants.find(v => v.size === 'large') || variants[variants.length - 1];
      case 'gallery':
        return variants.find(v => v.size === 'large') || variants[variants.length - 1];
      default:
        return productImage.primaryVariant;
    }
  }

  /**
   * Get image for lazy loading with progressive enhancement
   */
  getProgressiveLoadingConfig(productImage: ProductImage) {
    const thumbnail = productImage.variants.find(v => v.size === 'thumbnail');
    const standard = productImage.variants.find(v => v.size === 'standard');
    const large = productImage.variants.find(v => v.size === 'large');

    return {
      placeholder: thumbnail?.url || productImage.fallbackUrl,
      initial: standard?.url || productImage.fallbackUrl,
      highRes: large?.url || productImage.fallbackUrl,
      alt: productImage.alt
    };
  }

  /**
   * Convert RSR products to new image format
   */
  processRSRProductImages(rsrProduct: any): ProductImage[] {
    if (!rsrProduct.imgName) {
      return [];
    }

    const productImage = this.generateRSRImageVariants(
      rsrProduct.imgName, 
      rsrProduct.description || rsrProduct.name || 'Product'
    );

    return [productImage];
  }

  /**
   * Check if image URL is accessible
   */
  async verifyImageUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get best available image variant with fallback
   */
  async getBestAvailableImage(productImage: ProductImage): Promise<ImageVariant> {
    for (const variant of productImage.variants.reverse()) {
      const isAvailable = await this.verifyImageUrl(variant.url);
      if (isAvailable) {
        return variant;
      }
    }
    
    return productImage.primaryVariant;
  }

  /**
   * Generate srcset for responsive images
   */
  generateSrcSet(productImage: ProductImage): string {
    return productImage.variants
      .map(variant => `${variant.url} ${variant.width}w`)
      .join(', ');
  }

  /**
   * Generate sizes attribute for responsive images
   */
  generateSizes(context: 'card' | 'detail' | 'zoom' | 'gallery'): string {
    switch (context) {
      case 'card':
        return '(max-width: 768px) 150px, 200px';
      case 'detail':
        return '(max-width: 768px) 300px, 400px';
      case 'zoom':
        return '(max-width: 768px) 100vw, 800px';
      case 'gallery':
        return '(max-width: 768px) 50vw, 400px';
      default:
        return '400px';
    }
  }
}

export const imageService = new ImageService();