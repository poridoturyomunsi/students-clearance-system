/**
 * Advanced image processing utility for stripping and cleaning logo backgrounds in the browser.
 */

/**
 * Strips the solid white or off-white background from a Base64 image.
 * Uses a border-initiated flood-fill (BFS) to preserve inner white areas (like white shields or open books)
 * while smoothly feathering the edges to make the logo look incredibly crisp assets on dark backgrounds.
 * 
 * @param base64Src The source Base64 image data string.
 * @param tolerance Value between 0 and 255 representing white sensitivity (typically 30-45 works best).
 * @returns A promise that resolves to the transparent-background PNG Base64 data string.
 */
export function removeLogoBackground(base64Src: string, tolerance: number = 40): Promise<string> {
  // If it's already the default SVG (starts with data:image/svg+xml), it is already fully vector and transparent
  if (base64Src.startsWith('data:image/svg+xml')) {
    return Promise.resolve(base64Src);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Src);
          return;
        }
        
        // Draw image initially
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Visited array to track flood-fill traversal
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        
        // Definition: target white color threshold (e.g. RGB components all greater than 255 - tolerance)
        const isNearWhite = (idx: number) => {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          
          if (a < 15) return false; // Already highly transparent
          
          const threshold = 255 - tolerance;
          return r > threshold && g > threshold && b > threshold;
        };
        
        // Initialize border pixels (top/bottom) into the BFS queue
        for (let x = 0; x < width; x++) {
          // Top row
          const idxTop = (0 * width + x) * 4;
          if (isNearWhite(idxTop)) {
            queue.push(x, 0);
            visited[0 * width + x] = 1;
          }
          // Bottom row
          const idxBottom = ((height - 1) * width + x) * 4;
          if (isNearWhite(idxBottom)) {
            queue.push(x, height - 1);
            visited[(height - 1) * width + x] = 1;
          }
        }
        
        // Initialize border pixels (left/right) into the BFS queue
        for (let y = 0; y < height; y++) {
          // Left column
          const idxLeft = (y * width + 0) * 4;
          if (isNearWhite(idxLeft) && !visited[y * width + 0]) {
            queue.push(0, y);
            visited[y * width + 0] = 1;
          }
          // Right column
          const idxRight = (y * width + (width - 1)) * 4;
          if (isNearWhite(idxRight) && !visited[y * width + (width - 1)]) {
            queue.push(width - 1, y);
            visited[y * width + (width - 1)] = 1;
          }
        }
        
        // Run BFS search to clear entire outer bounding boundary of white background
        let head = 0;
        while (head < queue.length) {
          const cx = queue[head++];
          const cy = queue[head++];
          
          const currentIdx = (cy * width + cx) * 4;
          // Set alpha of this outer background pixel to 0 (completely transparent)
          data[currentIdx + 3] = 0;
          
          // Connect 4 directions
          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1]
          ];
          
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const visitIdx = ny * width + nx;
              if (!visited[visitIdx]) {
                const dataIdx = visitIdx * 4;
                if (isNearWhite(dataIdx)) {
                  visited[visitIdx] = 1;
                  queue.push(nx, ny);
                }
              }
            }
          }
        }
        
        // Fine Feathering: Smooth and blend transitional pixels to prevent jagged edge outlines
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            // If the pixel is opaque, check if it borders any transparent pixel
            if (data[idx + 3] > 15) {
              const leftAlpha = data[(y * width + (x - 1)) * 4 + 3];
              const rightAlpha = data[(y * width + (x + 1)) * 4 + 3];
              const topAlpha = data[((y - 1) * width + x) * 4 + 3];
              const bottomAlpha = data[((y + 1) * width + x) * 4 + 3];
              
              if (leftAlpha < 50 || rightAlpha < 50 || topAlpha < 50 || bottomAlpha < 50) {
                // Determine brightness to scale opacity smoothly
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const brightness = (r + g + b) / 3;
                
                if (brightness > 120) {
                  const factor = (brightness - 120) / 135; // 0.0 to 1.0 based on lightness
                  data[idx + 3] = Math.round(data[idx + 3] * (1 - factor * 0.85)); // Blend seamlessly
                }
              }
            }
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error("Error removing logo background:", e);
        resolve(base64Src);
      }
    };
    
    img.onerror = () => {
      resolve(base64Src);
    };
    
    img.src = base64Src;
  });
}

export interface StudentPhotoEditOptions {
  zoom?: number;            // Zoom scale factor (e.g. 1.0 is standard)
  offsetX?: number;         // Horizontal offset in pixels
  offsetY?: number;         // Vertical offset in pixels
  whitenIntensity?: number;// Background whitening/removal tolerance (0-100, 0 is disabled)
  autoCenter?: boolean;     // Whether to apply smart face edge detection algorithms
  filter?: string;          // Selected preset filter
  bgReplacementColor?: 'white' | 'light-blue' | 'light-gray' | 'none'; // Selected studio background replacement color
}

export interface BackgroundQualityReport {
  isTooDark: boolean;
  isCluttered: boolean;
  hasMultipleSubjects: boolean;
  avgBrightness: number;
  clutterScore: number;
  warnings: string[];
}

/**
 * High-performance analyzer to check image quality, exposure level, clutter, and subject count.
 * Alerts when background is overly noisy/cluttered or when there is poor lighting.
 */
export function analyzeImageQuality(base64Src: string): Promise<BackgroundQualityReport> {
  return new Promise((resolve) => {
    if (!base64Src) {
      resolve({ isTooDark: false, isCluttered: false, hasMultipleSubjects: false, avgBrightness: 128, clutterScore: 0, warnings: [] });
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = 150;
        const h = 200;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ isTooDark: false, isCluttered: false, hasMultipleSubjects: false, avgBrightness: 128, clutterScore: 0, warnings: [] });
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Average overall brightness level (0 to 255 scale)
        let totalBrightness = 0;
        let pixelCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          if (a > 200) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            totalBrightness += lum;
            pixelCount++;
          }
        }
        const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 128;

        // 2. Clutter/Texture scoring (computes average color variation along the upper background zone)
        let bgGradientsTotal = 0;
        let bgSamplesCount = 0;
        const sampleYLimit = Math.floor(h * 0.25);
        const sampleXLimitLeft = Math.floor(w * 0.15);
        const sampleXLimitRight = Math.floor(w * 0.85);

        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const isBgZone = (y < sampleYLimit) || (x < sampleXLimitLeft) || (x > sampleXLimitRight);
            if (isBgZone) {
              const idx = (y * w + x) * 4;
              const leftIdx = (y * w + (x - 1)) * 4;
              const rightIdx = (y * w + (x + 1)) * 4;
              const topIdx = ((y - 1) * w + x) * 4;
              const bottomIdx = ((y + 1) * w + x) * 4;

              const gxR = data[rightIdx] - data[leftIdx];
              const gyR = data[bottomIdx] - data[topIdx];
              const gxG = data[rightIdx+1] - data[leftIdx+1];
              const gyG = data[bottomIdx+1] - data[topIdx+1];
              const gxB = data[rightIdx+2] - data[leftIdx+2];
              const gyB = data[bottomIdx+2] - data[topIdx+2];

              const magnitude = Math.sqrt(gxR*gxR + gyR*gyR + gxG*gxG + gyG*gyG + gxB*gxB + gyB*gyB);
              bgGradientsTotal += magnitude;
              bgSamplesCount++;
            }
          }
        }
        const clutterScore = bgSamplesCount > 0 ? (bgGradientsTotal / bgSamplesCount) : 0;

        // 3. Face / skin clustering density pass across vertical channels
        const skinSlices: number[] = new Array(w).fill(0);
        const midYStart = Math.floor(h * 0.25);
        const midYEnd = Math.floor(h * 0.75);

        for (let x = 0; x < w; x++) {
          let skinPixelsInCol = 0;
          for (let y = midYStart; y < midYEnd; y++) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx+1];
            const b = data[idx+2];
            
            const isSkin = r > 65 && g > 45 && b > 35 && 
                           r > g && r > b && 
                           (r - g) > 8 && (r - g) < 45 &&
                           (g - b) > 3;
            if (isSkin) {
              skinPixelsInCol++;
            }
          }
          skinSlices[x] = skinPixelsInCol;
        }

        let skinPeaks = 0;
        let insidePeak = false;
        let peakWidth = 0;
        const minSkinThreshold = 7;
        
        for (let x = 5; x < w - 5; x++) {
          if (skinSlices[x] > minSkinThreshold) {
            if (!insidePeak) {
              insidePeak = true;
            }
            peakWidth++;
          } else {
            if (insidePeak) {
              if (peakWidth > 11) {
                skinPeaks++;
              }
              insidePeak = false;
              peakWidth = 0;
            }
          }
        }
        if (insidePeak && peakWidth > 11) skinPeaks++;

        const isTooDark = avgBrightness < 65;
        const isCluttered = clutterScore > 23.0; // Dynamic edge texture limit
        const hasMultipleSubjects = skinPeaks > 1;

        const warnings: string[] = [];
        if (isTooDark) {
          warnings.push("Room is too dark. Increase background or face lighting.");
        }
        if (isCluttered) {
          warnings.push("Background is cluttered. Sit against a simple white or solid color wall.");
        }
        if (hasMultipleSubjects) {
          warnings.push("Too many people or object clutter detected. Ensure only one centered student is present.");
        }

        resolve({
          isTooDark,
          isCluttered,
          hasMultipleSubjects,
          avgBrightness,
          clutterScore,
          warnings
        });
      } catch (e) {
        console.error("Quality analysis exception:", e);
        resolve({ isTooDark: false, isCluttered: false, hasMultipleSubjects: false, avgBrightness: 128, clutterScore: 0, warnings: [] });
      }
    };
    img.onerror = () => {
      resolve({ isTooDark: false, isCluttered: false, hasMultipleSubjects: false, avgBrightness: 128, clutterScore: 0, warnings: [] });
    };
    img.src = base64Src;
  });
}

/**
 * Programmatically computes smart crop bounds of the student's face/body
 * using horizontal/vertical color distance variance relative to corner backgrounds.
 */
function getSmartCropCoords(img: HTMLImageElement | HTMLCanvasElement): { sx: number; sy: number; sw: number; sh: number } {
  const w = 120;
  const h = 160;
  const targetRatio = 0.75; // 3:4 aspect ratio

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Graceful fallback
    return getDefaultCropCoords(img, targetRatio);
  }

  try {
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample the corners to detect the average background color
    const corners = [
      [2, 2], [w - 3, 2], [5, 10], [w - 6, 10]
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    corners.forEach(([cx, cy]) => {
      const idx = (cy * w + cx) * 4;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
    });
    bgR /= corners.length;
    bgG /= corners.length;
    bgB /= corners.length;

    // Map foreground pixels by calculating RGB Euclidean distance to background estimate
    const devThresh = 40;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let foreCount = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
        if (dist > devThresh) {
          foreCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // If we have insufficient foreground to extract a clear head silhouette, use standard ratio
    if (foreCount < (w * h * 0.05) || maxX <= minX || maxY <= minY) {
      return getDefaultCropCoords(img, targetRatio);
    }

    const scaleX = img.width / w;
    const scaleY = img.height / h;

    const realMinX = minX * scaleX;
    const realMaxX = maxX * scaleX;
    const realMinY = minY * scaleY;

    const subjectWidth = realMaxX - realMinX;
    const centerX = realMinX + subjectWidth / 2;

    // Frame the passport photo nicely: width should be larger than face itself to capture shoulders (approx 1.85x face)
    let targetWidth = subjectWidth * 1.85;
    if (targetWidth > img.width) targetWidth = img.width;
    let targetHeight = targetWidth / targetRatio;

    if (targetHeight > img.height) {
      targetHeight = img.height;
      targetWidth = targetHeight * targetRatio;
    }

    // Set the top bound. Introduce subtle head-room offset of 18% of crop height for natural centering
    let sx = centerX - targetWidth / 2;
    let sy = realMinY - targetHeight * 0.18;

    // Clamp bounds safely
    if (sx < 0) sx = 0;
    if (sx + targetWidth > img.width) sx = img.width - targetWidth;
    if (sy < 0) sy = 0;
    if (sy + targetHeight > img.height) sy = img.height - targetHeight;

    return { sx, sy, sw: targetWidth, sh: targetHeight };
  } catch (e) {
    console.error("Auto face-detection error, defaulting:", e);
    return getDefaultCropCoords(img, targetRatio);
  }
}

/**
 * Standard aspect ratio crop fallback.
 */
function getDefaultCropCoords(img: HTMLImageElement | HTMLCanvasElement, targetRatio: number) {
  const srcRatio = img.width / img.height;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;

  if (srcRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) * 0.22; // shifted slightly upper to protect faces
  }

  return { sx, sy, sw, sh };
}

/**
 * Automatically extracts the subject and replaces the messy room background
 * with a clean studio passport background (white, light blue, or light gray).
 */
export function getOriginalBgColor(img: HTMLImageElement): { r: number; g: number; b: number } {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { r: 240, g: 240, b: 240 };
    ctx.drawImage(img, 0, 0, 50, 50);
    const imgData = ctx.getImageData(0, 0, 50, 50);
    const data = imgData.data;

    // Sample corners of the raw image to get a highly representative background tone
    const corners = [
      [2, 2], [47, 2], [5, 5], [44, 5], [2, 47], [47, 47]
    ];
    let r = 0, g = 0, b = 0;
    corners.forEach(([cx, cy]) => {
      const idx = (cy * 50 + cx) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
    });
    return {
      r: Math.round(r / corners.length),
      g: Math.round(g / corners.length),
      b: Math.round(b / corners.length)
    };
  } catch (e) {
    return { r: 240, g: 240, b: 240 };
  }
}

function applyBackgroundReplacement(
  canvas: HTMLCanvasElement,
  tolerance: number,
  bgColor: 'white' | 'light-blue' | 'light-gray' | 'none' = 'white',
  originalImgBg?: { r: number; g: number; b: number }
): void {
  if (bgColor === 'none' || tolerance <= 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Determine destination RGB values
  let destR = 255;
  let destG = 255;
  let destB = 255;

  if (bgColor === 'light-blue') {
    destR = 191;
    destG = 219;
    destB = 255; // Clean studio blue (191, 219, 255)
  } else if (bgColor === 'light-gray') {
    destR = 230;
    destG = 233;
    destB = 238; // Clean studio light gray (230, 233, 238)
  }

  // We sample pixels to estimate the background tone
  let baseR = originalImgBg ? originalImgBg.r : 0;
  let baseG = originalImgBg ? originalImgBg.g : 0;
  let baseB = originalImgBg ? originalImgBg.b : 0;

  if (!originalImgBg) {
    const corners = [
      [1, 1], [width - 2, 1], [5, 5], [width - 6, 5]
    ];
    corners.forEach(([cx, cy]) => {
      const idx = (cy * width + cx) * 4;
      baseR += data[idx];
      baseG += data[idx + 1];
      baseB += data[idx + 2];
    });
    baseR /= corners.length;
    baseG /= corners.length;
    baseB /= corners.length;
  }

  // 1. Create a grayscale buffer
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    // Fast grayscale calculation
    gray[i / 4] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  // 2. Compute Sobel Edge Map to guide BFS and protect subject borders
  const edgeMap = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      const valX =
        -gray[idx - width - 1] + gray[idx - width + 1]
        -2 * gray[idx - 1] + 2 * gray[idx + 1]
        -gray[idx + width - 1] + gray[idx + width + 1];

      const valY =
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
        +gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];

      edgeMap[idx] = Math.sqrt(valX * valX + valY * valY);
    }
  }

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const checkColorSimilarity = (idx: number) => {
    const a = data[idx + 3];
    if (a < 50) return true; // Transparent / semi-transparent is always background

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Skin-protection safety check (make sure we never extract active face elements)
    const isSkin = r > 60 && g > 40 && b > 30 &&
                   r > g && r > b &&
                   (r - g) > 7 && (r - g) < 50 &&
                   (g - b) > 2;
    if (isSkin) return false;

    // Dark pixel (hair/dark uniform) protection - do not fill if background is light
    const isBgLight = (baseR + baseG + baseB) / 3 > 120;
    if (isBgLight) {
      const isDark = r < 85 && g < 85 && b < 85;
      if (isDark) return false;
    }

    // Saturation-based uniform and school badge protection
    const bgSaturation = Math.max(baseR, baseG, baseB) - Math.min(baseR, baseG, baseB);
    const isBgNeutral = bgSaturation < 20;
    if (isBgNeutral) {
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (saturation > 25) return false; // Protect colorful school uniforms/badges
    }

    // Euclidean distance to sample background tone
    const dist = Math.sqrt((r - baseR) ** 2 + (g - baseG) ** 2 + (b - baseB) ** 2);
    
    // Scale intensity of the tolerance check: 0 to 100 corresponds to raw distance limit of 15 to 110
    const limit = 15 + (tolerance / 100) * 115;
    if (dist < limit) return true;

    // Shadow check:
    if (baseR > 10 && baseG > 10 && baseB > 10) {
      const ratioR = r / baseR;
      const ratioG = g / baseG;
      const ratioB = b / baseB;
      const avgRatio = (ratioR + ratioG + ratioB) / 3;
      
      // Shadow check: must be darker (avgRatio < 1.0) but not completely dark (avgRatio > 0.15)
      if (avgRatio > 0.15 && avgRatio <= 1.0) {
        const stdDev = Math.sqrt(
          ((ratioR - avgRatio) ** 2 + (ratioG - avgRatio) ** 2 + (ratioB - avgRatio) ** 2) / 3
        );
        // Extremely small standard deviation of scaling means light levels changed together (perfect shadows)
        if (stdDev < 0.08) { 
          return true;
        }
      }
    }

    return false;
  };

  // Seeding from top boundary
  for (let x = 0; x < width; x++) {
    const idx = (0 * width + x) * 4;
    const visitIdx = 0 * width + x;
    if (checkColorSimilarity(idx)) {
      queue.push(x, 0);
      visited[visitIdx] = 1;
    }
  }

  // Seeding from left and right boundaries completely (100% height)
  for (let y = 1; y < height; y++) {
    const idxL = (y * width + 0) * 4;
    const visitIdxL = y * width + 0;
    if (checkColorSimilarity(idxL) && !visited[visitIdxL]) {
      queue.push(0, y);
      visited[visitIdxL] = 1;
    }
    const idxR = (y * width + (width - 1)) * 4;
    const visitIdxR = y * width + (width - 1);
    if (checkColorSimilarity(idxR) && !visited[visitIdxR]) {
      queue.push(width - 1, y);
      visited[visitIdxR] = 1;
    }
  }

  // Seeding from bottom boundary outer regions (0% to 25% and 75% to 100% width)
  const bottomY = height - 1;
  const leftBottomLimit = Math.floor(width * 0.25);
  const rightBottomLimit = Math.floor(width * 0.75);
  for (let x = 0; x < width; x++) {
    if (x < leftBottomLimit || x >= rightBottomLimit) {
      const idx = (bottomY * width + x) * 4;
      const visitIdx = bottomY * width + x;
      if (checkColorSimilarity(idx) && !visited[visitIdx]) {
        queue.push(x, bottomY);
        visited[visitIdx] = 1;
      }
    }
  }

  // BFS Flood fill with Sobel Edge Map check
  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    const idx = (cy * width + cx) * 4;
    // Set to perfect brand studio color!
    data[idx] = destR;
    data[idx + 1] = destG;
    data[idx + 2] = destB;

    // Enqueue 4 neighbors
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const visitIdx = ny * width + nx;
        if (!visited[visitIdx]) {
          const dataIdx = visitIdx * 4;
          
          // Edge-aware wall: do not fill across Sobel edge threshold of 30
          const isEdge = edgeMap[visitIdx] > 30;
          
          if (!isEdge && checkColorSimilarity(dataIdx)) {
            visited[visitIdx] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  // Post-process: Soft bleed-feather to prevent jagged edges between hair contours & back color
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const isBgColor = data[idx] === destR && data[idx + 1] === destG && data[idx + 2] === destB;
      
      if (!isBgColor) {
        // Look for near-background borders and blend them slightly lighter to feather
        const neighborsBgIndices = [
          ((y * width + (x - 1)) * 4),
          ((y * width + (x + 1)) * 4),
          (((y - 1) * width + x) * 4),
          (((y + 1) * width + x) * 4)
        ];
        
        let hasBgPartner = false;
        for (const nIdx of neighborsBgIndices) {
          if (data[nIdx] === destR && data[nIdx + 1] === destG && data[nIdx + 2] === destB) {
            hasBgPartner = true;
            break;
          }
        }

        if (hasBgPartner) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const dist = Math.sqrt((r - baseR) ** 2 + (g - baseG) ** 2 + (b - baseB) ** 2);
          if (dist < 100) {
            const blendFactor = 0.5; // High precision blending
            data[idx] = Math.round(r * (1 - blendFactor) + destR * blendFactor);
            data[idx + 1] = Math.round(g * (1 - blendFactor) + destG * blendFactor);
            data[idx + 2] = Math.round(b * (1 - blendFactor) + destB * blendFactor);
          }
        }
      }
    }
  }

  // Final Pass: Clean up any tiny unreplaced gaps/specks inside the background (Hole-Filling)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const isBgColor = data[idx] === destR && data[idx + 1] === destG && data[idx + 2] === destB;
      if (!isBgColor) {
        let bgNeighborsCount = 0;
        const neighborOffsets = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1]
        ];
        for (const [dx, dy] of neighborOffsets) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          if (data[nIdx] === destR && data[nIdx + 1] === destG && data[nIdx + 2] === destB) {
            bgNeighborsCount++;
          }
        }
        
        // If 6 or more out of 8 neighbors are replaced, this is a tiny noisy spot/gap in the background!
        if (bgNeighborsCount >= 6) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Protect skin and obvious face elements
          const isSkin = r > 60 && g > 40 && b > 30 && r > g;
          if (!isSkin) {
            data[idx] = destR;
            data[idx + 1] = destG;
            data[idx + 2] = destB;
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Automatic high-performance photo enhancement filter.
 * Analyzes the exposure/lum of the central face region to adjust contrast, brightness, and color saturation,
 * correcting poor passport photo lighting and normalizing image quality to a standard studio level.
 * Features an intelligent skin-softening blemish diffusion pass and multiple premium preset filters.
 */
function applySmartEnhancement(
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number,
  filter: string = 'studio'
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Convert RGB to YCbCr
  const len = width * height;
  const Y = new Float32Array(len);
  const Cb = new Float32Array(len);
  const Cr = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }

  // 2. Perform Exposure Analysis on Y channel in the center region
  let totalY = 0;
  let sampleCount = 0;
  const faceStartX = Math.floor(width * 0.25);
  const faceEndX = Math.floor(width * 0.75);
  const faceStartY = Math.floor(height * 0.25);
  const faceEndY = Math.floor(height * 0.70);

  for (let y = faceStartY; y < faceEndY; y++) {
    for (let x = faceStartX; x < faceEndX; x++) {
      const i = y * width + x;
      totalY += Y[i];
      sampleCount++;
    }
  }

  const avgLum = sampleCount > 0 ? totalY / sampleCount : 128;

  // Determine exposure boost and contrast levels
  let brightnessAdjust = 0;
  let contrastAdjust = 1.0;

  if (avgLum < 110) {
    // Under-exposed (dark) photo: dynamically boost exposure and bump contrast to avoid muddy colors
    brightnessAdjust = (130 - avgLum) * 0.5; 
    contrastAdjust = 1.15; 
  } else if (avgLum > 170) {
    // Over-exposed (too bright) photo: decrease overall exposure to capture skin details
    brightnessAdjust = (145 - avgLum) * 0.3;
    contrastAdjust = 0.95;
  } else {
    // Well-balanced exposure: apply studio gloss enhancement
    brightnessAdjust = 5.0; // gentle fill-light
    contrastAdjust = 1.05;
  }

  // Apply brightness & contrast adjustments to Y (luminance) channel only
  for (let i = 0; i < len; i++) {
    let yVal = Y[i];
    yVal = (yVal - 128) * contrastAdjust + 128 + brightnessAdjust;
    Y[i] = Math.max(0, Math.min(255, yVal));
  }

  // 3. Laplacian-based 3x3 Edge Sharpening filter on Y channel for crisp details
  const Y_sharpened = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    Y_sharpened[i] = Y[i];
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      
      const center = Y[i];
      const left = Y[i - 1];
      const right = Y[i + 1];
      const top = Y[i - width];
      const bottom = Y[i + width];

      const sharpVal = 5 * center - left - right - top - bottom;
      // Blend 35% sharpened value with 65% original value to avoid graininess
      Y_sharpened[i] = Math.max(0, Math.min(255, center * 0.65 + sharpVal * 0.35));
    }
  }

  // 4. Convert back to RGB with filter-based tweaks
  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    const yVal = Y_sharpened[i];
    const cbVal = Cb[i];
    const crVal = Cr[i];

    let r = yVal + 1.402 * (crVal - 128);
    let g = yVal - 0.344136 * (cbVal - 128) - 0.714136 * (crVal - 128);
    let b = yVal + 1.772 * (cbVal - 128);

    // Apply Live Preview Filter adjustments on the color components
    if (filter === 'vibrant') {
      const factor = 1.25;
      r = yVal + 1.402 * ((crVal - 128) * factor);
      g = yVal - 0.344136 * ((cbVal - 128) * factor) - 0.714136 * ((crVal - 128) * factor);
      b = yVal + 1.772 * ((cbVal - 128) * factor);
    } else if (filter === 'warm') {
      // Warm golden studio style
      r += 8;
      g += 3;
      b -= 5;
    } else if (filter === 'cool') {
      // Professional corporate cool adjustment
      r -= 4;
      g += 1;
      b += 8;
    } else if (filter === 'classic-bw') {
      // High contrast aesthetic monochrome
      r = yVal;
      g = yVal;
      b = yVal;
    } else if (filter === 'soft-matte') {
      if (yVal < 60) {
        r += (60 - yVal) * 0.2;
        g += (60 - yVal) * 0.2;
        b += (60 - yVal) * 0.2;
      }
      r += 4;
      g += 2;
    } else if (filter === 'crisp-high') {
      const factor = 1.15;
      r = yVal + 1.402 * ((crVal - 128) * factor);
      g = yVal - 0.344136 * ((cbVal - 128) * factor) - 0.714136 * ((crVal - 128) * factor);
      b = yVal + 1.772 * ((cbVal - 128) * factor);
    } else {
      // 'studio' (Default) - subtle saturation boost
      const factor = 1.10;
      r = yVal + 1.402 * ((crVal - 128) * factor);
      g = yVal - 0.344136 * ((cbVal - 128) * factor) - 0.714136 * ((crVal - 128) * factor);
      b = yVal + 1.772 * ((cbVal - 128) * factor);
    }

    data[idx] = Math.max(0, Math.min(255, r));
    data[idx + 1] = Math.max(0, Math.min(255, g));
    data[idx + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imgData, 0, 0);
}

let selfieSegmentationInstance: any = null;

function getSelfieSegmentation() {
  if (selfieSegmentationInstance) return selfieSegmentationInstance;
  
  if (typeof (window as any).SelfieSegmentation === 'undefined') {
    return null;
  }
  
  try {
    const instance = new (window as any).SelfieSegmentation({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
      }
    });
    
    instance.setOptions({
      modelSelection: 1, // landscape model is faster/better suited for this context
    });
    
    selfieSegmentationInstance = instance;
    return instance;
  } catch (e) {
    console.error("Error creating SelfieSegmentation instance:", e);
    return null;
  }
}

function segmentSubject(img: HTMLImageElement): Promise<HTMLImageElement | HTMLCanvasElement> {
  return new Promise((resolve) => {
    const segmenter = getSelfieSegmentation();
    if (!segmenter) {
      resolve(img);
      return;
    }

    let resolved = false;
    
    segmenter.onResults((results: any) => {
      if (resolved) return;
      resolved = true;
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(canvas);
        return;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.filter = 'blur(0.8px)'; // Soft feathering filter for natural hair and shoulder edges
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(img, 0, 0);
      }
      
      resolve(canvas);
    });
    
    segmenter.send({ image: img }).catch((err: any) => {
      console.warn("SelfieSegmentation send error:", err);
      resolve(img);
    });
  });
}

/**
 * Automagically crops, centers, resizes to standard 3:4 passport aspect ratio (300x400),
 * and compresses any student portrait photos uploaded from phones to lightweight JPEGs
 * for incredible performance and local storage efficiency. Supports custom manual overrides.
 */
export function processStudentPhoto(base64Src: string, options?: StudentPhotoEditOptions): Promise<string> {
  const {
    zoom = 1.0,
    offsetX = 0,
    offsetY = 0,
    whitenIntensity = 45,
    autoCenter = true,
    filter = 'studio',
    bgReplacementColor = 'white'
  } = options || {};

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        // Upgraded resolution for extremely crisp and high-resolution passport printing
        const targetWidth = 900;
        const targetHeight = 1200;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Src);
          return;
        }

        // Fill background initially with pure solid status white or custom replacement base
        ctx.fillStyle = bgReplacementColor === 'light-blue' ? '#BFDBFF' : (bgReplacementColor === 'light-gray' ? '#E6E9EE' : '#FFFFFF');
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // 1. Segment image to remove background and keep subject if background replacement is active
        const segmentedCanvas = (bgReplacementColor !== 'none' && typeof (window as any).SelfieSegmentation !== 'undefined')
          ? await segmentSubject(img)
          : img;

        // 2. Get base crop bounds (either smart programmatically centered or default 3:4) using the segmented canvas or original image
        const crop = autoCenter ? getSmartCropCoords(segmentedCanvas) : getDefaultCropCoords(segmentedCanvas, 0.75);

        // 3. Apply dynamic interactive manuals (zoom + pan offsets)
        // Zoom values scale the cropping box dimensions: zoom in = smaller sw/sh bounds relative to face
        const zoomFactor = Math.max(0.2, Math.min(5.0, zoom));
        const finalSw = crop.sw / zoomFactor;
        const finalSh = crop.sh / zoomFactor;

        // Balance panning offsets based on scaling ratios (subtract offsets for intuitive dragging directions, no rigid clamps)
        const finalSx = crop.sx + (crop.sw - finalSw) / 2 - offsetX * (crop.sw / targetWidth);
        const finalSy = crop.sy + (crop.sh - finalSh) / 2 - offsetY * (crop.sh / targetHeight);

        // Map the sub-rectangle (finalSx, finalSy, finalSw, finalSh) of img onto target bounds allowing unbounded dragging
        const srcLeft = Math.max(0, finalSx);
        const srcTop = Math.max(0, finalSy);
        const srcRight = Math.min(segmentedCanvas.width, finalSx + finalSw);
        const srcBottom = Math.min(segmentedCanvas.height, finalSy + finalSh);

        if (srcRight > srcLeft && srcBottom > srcTop) {
          const srcVisibleW = srcRight - srcLeft;
          const srcVisibleH = srcBottom - srcTop;

          // Calculate correct destination bounding coordinate mapping
          const destX = ((srcLeft - finalSx) / finalSw) * targetWidth;
          const destY = ((srcTop - finalSy) / finalSh) * targetHeight;
          const destW = (srcVisibleW / finalSw) * targetWidth;
          const destH = (srcVisibleH / finalSh) * targetHeight;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(segmentedCanvas, srcLeft, srcTop, srcVisibleW, srcVisibleH, destX, destY, destW, destH);
        }

        // Apply automatic studio photo enhancement filter to elevate brightness, contrast, and color quality
        applySmartEnhancement(ctx, targetWidth, targetHeight, filter);

        // 4. Programmatically replace/whiten background with the selected studio color (fallback)
        if (whitenIntensity > 0 && bgReplacementColor !== 'none') {
          // If we did not use SelfieSegmentation, fall back to the legacy flood fill:
          if (segmentedCanvas === img) {
            const originalImgBg = getOriginalBgColor(img);
            applyBackgroundReplacement(canvas, whitenIntensity, bgReplacementColor, originalImgBg);
          }
        }

        // Convert to high quality studio JPEG (0.95 compression quality preserves original colors and sharp details)
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (e) {
        console.error("Error processing student passport photo:", e);
        resolve(base64Src);
      }
    };

    img.onerror = () => {
      resolve(base64Src);
    };

    img.src = base64Src;
  });
}

/**
 * Automatically enhances student photos before rendering them to PDF.
 * Increases brightness by 20%, slightly improves contrast (by ~10%), and sharpens the image.
 */
export function enhanceStudentPhotoForPdf(
  base64Src: string,
  options?: {
    brightnessBoost?: number; // e.g. 1.25 for +25%
    contrastBoost?: number;   // e.g. 1.10 for +10%
    sharpen?: boolean;
  }
): Promise<string> {
  const {
    brightnessBoost = 1.25, // default +25% brightness boost
    contrastBoost = 1.10,   // default +10% slight contrast bump
    sharpen = true          // light sharpening enabled by default
  } = options || {};

  return new Promise((resolve) => {
    if (!base64Src) {
      resolve('');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Src);
          return;
        }
        ctx.drawImage(img, 0, 0);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const w = imgData.width;
        const h = imgData.height;
        
        const originalData = new Uint8ClampedArray(data);
        
        // Milder sharpening convolution weights:
        // [  0,  -0.2,   0 ]
        // [ -0.2, 1.8,  -0.2 ]
        // [  0,  -0.2,   0 ]
        const w0 = -0.2;
        const w1 = 1.8;
        
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            
            for (let c = 0; c < 3; c++) {
              const cIdx = idx + c;
              const centerVal = originalData[cIdx];
              
              let val = centerVal;
              if (sharpen) {
                const topVal = originalData[((y - 1) * w + x) * 4 + c];
                const bottomVal = originalData[((y + 1) * w + x) * 4 + c];
                const leftVal = originalData[(y * w + (x - 1)) * 4 + c];
                const rightVal = originalData[(y * w + (x + 1)) * 4 + c];
                
                val = centerVal * w1 + (topVal + bottomVal + leftVal + rightVal) * w0;
              }
              
              // Apply brightness
              val = val * brightnessBoost;
              
              // Apply contrast
              val = (val - 128) * contrastBoost + 128;
              
              data[cIdx] = Math.max(0, Math.min(255, val));
            }
          }
        }
        
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (e) {
        console.error("Error enhancing photo for PDF:", e);
        resolve(base64Src);
      }
    };
    img.onerror = () => {
      resolve(base64Src);
    };
    img.src = base64Src;
  });
}

/**
 * Compress a student photo to a smaller JPEG for fast listing/thumbnails.
 * Produces a base64 JPEG at the specified maximum dimensions and quality.
 */
export function compressStudentPhoto(base64Str: string, maxWidth: number = 300, maxHeight: number = 400, quality: number = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str) return resolve('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);

      ctx.drawImage(img, 0, 0, width, height);
      const compressedData = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedData);
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
}

/**
 * Compress and optimize a digital signature image, preserving PNG format and transparency.
 */
export function compressSignatureImage(base64Str: string, maxWidth: number = 600, maxHeight: number = 300): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str) return resolve('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);

      ctx.clearRect(0, 0, width, height); // Keep transparency
      ctx.drawImage(img, 0, 0, width, height);
      const compressedData = canvas.toDataURL('image/png'); // Preserve transparent PNG
      resolve(compressedData);
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
}



