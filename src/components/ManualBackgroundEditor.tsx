import React, { useRef, useState, useEffect } from 'react';
import { 
  Paintbrush, 
  Eraser, 
  Check, 
  RotateCcw, 
  Undo, 
  Redo, 
  Sparkles, 
  Info,
  HelpCircle,
  ZoomIn,
  ZoomOut,
  Eye,
  Sliders,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';

interface ManualBackgroundEditorProps {
  imageSrc: string; // The base64 processed image
  onSave: (editedBase64: string) => void;
  onClose: () => void;
}

type Mode = 'paint' | 'restore' | 'bucket';
type StudioBgColor = 'white' | 'light-blue' | 'light-gray' | 'custom';

export default function ManualBackgroundEditor({ imageSrc, onSave, onClose }: ManualBackgroundEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  // Styling and colors
  const [selectedColorType, setSelectedColorType] = useState<StudioBgColor>('white');
  const [customColor, setCustomColor] = useState<string>('#93C5FD'); // Default warm blue hex
  const [toolMode, setToolMode] = useState<Mode>('paint');
  
  // Brush options
  const [brushSize, setBrushSize] = useState<number>(20);
  const [brushSoftness, setBrushSoftness] = useState<number>(50); // 0 (sharp) to 100 (very soft feather)
  
  // Navigation states
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 1.0x to 3.0x zoom
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // History stack
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  
  // Inspection modes
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [isHoldingBefore, setIsHoldingBefore] = useState<boolean>(false);
  const [comparisonMode, setComparisonMode] = useState<'normal' | 'side-by-side'>('normal');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Preset hex mapping
  const colorPresetsMap = {
    'white': '#FFFFFF',
    'light-blue': '#BFDBFF',
    'light-gray': '#E6E9EE',
    'custom': customColor
  };

  const activeColorValue = selectedColorType === 'custom' ? customColor : colorPresetsMap[selectedColorType];

  // Initialize and load image onto canvas
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to standard high-resolution passport template (300x400, 3:4 aspect ratio)
      canvas.width = 300;
      canvas.height = 400;

      // Draw initial state
      ctx.drawImage(img, 0, 0, 300, 400);
      setImageLoaded(true);

      // Save initial state to history
      const initialData = canvas.toDataURL('image/webp', 0.85);
      setHistory([initialData]);
      setHistoryIndex(0);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Push custom changes onto history timeline
  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const currentData = canvas.toDataURL('image/webp', 0.85);
    
    // Clear out forward redo actions if we are inserting a new action state
    const currentTimeline = history.slice(0, historyIndex + 1);
    const updatedHistory = [...currentTimeline, currentData];
    
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    setHistoryIndex(prevIndex);
    applyStateFromHistory(history[prevIndex]);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    applyStateFromHistory(history[nextIndex]);
  };

  const applyStateFromHistory = (base64Str: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = base64Str;
  };

  const handleReset = () => {
    if (history.length === 0) return;
    setHistoryIndex(0);
    applyStateFromHistory(history[0]);
  };

  // 1-Click "Apply Background to Entire Image" (Auto background segment fill)
  const applyBackgroundToEntireImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImageRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Read clean image state to execute segmentation
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Parse chosen color replacement values
    const targetHex = activeColorValue;
    const fillR = parseInt(targetHex.slice(1, 3), 16);
    const fillG = parseInt(targetHex.slice(3, 5), 16);
    const fillB = parseInt(targetHex.slice(5, 7), 16);

    // Compute automatic representative background color by sampling outer corners
    const corners = [
      [2, 2], [width - 3, 2], [5, 5], [width - 6, 5], [2, height - 3], [width - 3, height - 3]
    ];
    let baseR = 0, baseG = 0, baseB = 0;
    corners.forEach(([cx, cy]) => {
      const idx = (cy * width + cx) * 4;
      baseR += data[idx];
      baseG += data[idx + 1];
      baseB += data[idx + 2];
    });
    baseR = Math.round(baseR / corners.length);
    baseG = Math.round(baseG / corners.length);
    baseB = Math.round(baseB / corners.length);

    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    // Safety logic: distinguish skin & hair so they are not replaced
    const isProtectedFeature = (r: number, g: number, b: number) => {
      // Basic skin tone check
      const isSkin = r > 60 && g > 40 && b > 30 &&
                     r > g && r > b &&
                     (r - g) > 7 && (r - g) < 55 &&
                     (g - b) > 2;
      return isSkin;
    };

    const isBackgroundPixel = (idx: number) => {
      const a = data[idx + 3];
      if (a < 50) return true; // Transparent is background

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (isProtectedFeature(r, g, b)) return false;

      // High luminance white wall pixels are extremely safe to replace
      if (r > 205 && g > 205 && b > 205) return true;

      // Color similarity distance
      const dist = Math.sqrt((r - baseR) ** 2 + (g - baseG) ** 2 + (b - baseB) ** 2);
      return dist < 65; // Tolerance threshold
    };

    // Add boundaries (Top, Sides, outer bounds of bottom) as seeds
    for (let x = 0; x < width; x++) {
      const idx = (0 * width + x) * 4;
      if (isBackgroundPixel(idx)) {
        queue.push(x, 0);
        visited[0 * width + x] = 1;
      }
    }

    for (let y = 1; y < height; y++) {
      const idxL = (y * width + 0) * 4;
      if (isBackgroundPixel(idxL) && !visited[y * width + 0]) {
        queue.push(0, y);
        visited[y * width + 0] = 1;
      }
      const idxR = (y * width + (width - 1)) * 4;
      if (isBackgroundPixel(idxR) && !visited[y * width + (width - 1)]) {
        queue.push(width - 1, y);
        visited[y * width + (width - 1)] = 1;
      }
    }

    // BFS Expansion
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];

      const idx = (cy * width + cx) * 4;
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;

      const neighbors = [
        [cx - 1, cy], [cx + 1, cy],
        [cx, cy - 1], [cx, cy + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          if (!visited[ny * width + nx]) {
            if (isBackgroundPixel(nIdx)) {
              queue.push(nx, ny);
              visited[ny * width + nx] = 1;
            }
          }
        }
      }
    }

    // Apply edge smoothing pass to avoid pixelated borders
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const isBg = data[idx] === fillR && data[idx + 1] === fillG && data[idx + 2] === fillB;
        if (!isBg) {
          // Check if surrounded mostly by background to apply soft anti-aliased margins
          let bgCount = 0;
          const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [ox, oy] of offsets) {
            const nIdx = ((y + oy) * width + (x + ox)) * 4;
            if (data[nIdx] === fillR && data[nIdx + 1] === fillG && data[nIdx + 2] === fillB) {
              bgCount++;
            }
          }

          if (bgCount >= 2) {
            // Soft blend
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (!isProtectedFeature(r, g, b)) {
              data[idx] = Math.round(r * 0.4 + fillR * 0.6);
              data[idx + 1] = Math.round(g * 0.4 + fillG * 0.6);
              data[idx + 2] = Math.round(b * 0.4 + fillB * 0.6);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    saveToHistory();
  };

  // translate screen coordinates into high-precision canvas coordinate coordinates with zoom support
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Convert CSS coordinates onto standard logical 300x400 canvas grid supporting responsive scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);

    return { x, y };
  };

  // Start Drawing Stroke on canvas
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // Check if panning (Space key or zoom enabled middle click)
    if (e.button === 1 || isPanning) {
      return;
    }

    if (toolMode === 'bucket') {
      handleBucketFill(e);
      return;
    }

    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    drawStroke(coords.x, coords.y, true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      handlePanning(e);
      return;
    }

    if (!isDrawing || toolMode === 'bucket') return;
    e.preventDefault(); // Stop mobile pinch scaling issues

    const coords = getCoordinates(e);
    if (!coords) return;

    drawStroke(coords.x, coords.y, false);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // Implement high-fidelity feathery painting of background or restoration
  const drawStroke = (x: number, y: number, isStarting: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !originalImageRef.current) return;

    const radius = brushSize / 2;
    ctx.save();

    if (toolMode === 'paint') {
      const targetHex = activeColorValue;
      const r = parseInt(targetHex.slice(1, 3), 16);
      const g = parseInt(targetHex.slice(3, 5), 16);
      const b = parseInt(targetHex.slice(5, 7), 16);

      if (brushSoftness > 0) {
        // High fidelity soft feathered drawing brush is configured using Canvas Radial Gradients
        const gradient = ctx.createRadialGradient(
          x, y, radius * (1 - brushSoftness / 100), // Solid interior
          x, y, radius                             // Fade border
        );
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Pristine crisp paint stroke
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (toolMode === 'restore') {
      // FEATHERED / SOFT RESTORATION
      // Restores localized raw student photograph from original reference image
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      
      if (brushSoftness > 0) {
        // Create an offscreen buffer canvas to paint a soft alpha feathered brush of original image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 300;
        tempCanvas.height = 400;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          // Draw the absolute raw original photo on temp canvas
          tempCtx.drawImage(originalImageRef.current, 0, 0, 300, 400);

          // Build a clipping path or draw directly with high blending
          ctx.save();
          // Create radial gradient mask
          const gradient = ctx.createRadialGradient(
            x, y, radius * (1 - brushSoftness / 100),
            x, y, radius
          );
          gradient.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

          // Clip to limit bounds
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.clip();

          // We draw the original content with globalCompositeOperation
          ctx.globalCompositeOperation = 'source-over';
          
          // Draw original content within clipped frame
          ctx.drawImage(originalImageRef.current, x - radius, y - radius, radius * 2, radius * 2, x - radius, y - radius, radius * 2, radius * 2);
          ctx.restore();
        }
      } else {
        // Crisp non-soft edge restore
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(originalImageRef.current, 0, 0, 300, 400);
        ctx.restore();
      }
    }

    ctx.restore();
  };

  // Magic Bucket Flood Fill
  const handleBucketFill = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const startX = coords.x;
    const startY = coords.y;
    const startIdx = (startY * width + startX) * 4;

    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];

    const targetHex = activeColorValue;
    const fillR = parseInt(targetHex.slice(1, 3), 16);
    const fillG = parseInt(targetHex.slice(3, 5), 16);
    const fillB = parseInt(targetHex.slice(5, 7), 16);

    const matchThreshold = 45;

    // BFS Flood Fill index tracking 
    const visited = new Uint8Array(width * height);
    const queue: number[] = [startX, startY];
    visited[startY * width + startX] = 1;

    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];

      const idx = (cy * width + cx) * 4;
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;

      const neighbors = [
        [cx - 1, cy], [cx + 1, cy],
        [cx, cy - 1], [cx, cy + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          if (!visited[ny * width + nx]) {
            const r = data[nIdx];
            const g = data[nIdx + 1];
            const b = data[nIdx + 2];

            const dist = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);
            if (dist <= matchThreshold) {
              queue.push(nx, ny);
              visited[ny * width + nx] = 1;
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    saveToHistory();
  };

  // Panning Controls for Zoom mode
  const startPanning = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    setIsPanning(true);
    setPanStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
  };

  const handlePanning = (e: any) => {
    if (!isPanning) return;
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    setPanOffset({
      x: clientX - panStart.x,
      y: clientY - panStart.y
    });
  };

  const adjustZoom = (direction: 'in' | 'out') => {
    setZoomLevel(prev => {
      const step = 0.35;
      const next = direction === 'in' ? prev + step : prev - step;
      const finalVal = Math.max(1.0, Math.min(3.0, next));
      if (finalVal === 1.0) {
        setPanOffset({ x: 0, y: 0 }); // Reset alignment
      }
      return finalVal;
    });
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const finalData = canvas.toDataURL('image/webp', 0.85);
    onSave(finalData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/93 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-fade-in text-slate-150">
      <div id="manual-studio-editor" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 max-w-5xl w-full flex flex-col lg:flex-row gap-6 shadow-2xl max-h-[96vh] overflow-y-auto">
        
        {/* Workspace Canvas Panel */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3.5 bg-slate-950/40 p-3 sm:p-5 rounded-xl border border-slate-850 relative">
          
          <div className="flex items-center justify-between w-full max-w-md">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                Interactive Studio Canvas Workspace
              </h4>
            </div>

            {/* Quick zoom factor HUD */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[9px] font-mono text-indigo-400 font-bold">
              <span>ZOOM:</span>
              <span>{zoomLevel.toFixed(1)}x</span>
            </div>
          </div>

          {/* Realtime Canvas Box frame wrapper */}
          <div className="relative w-full flex items-center justify-center gap-6 py-2">
            
            {/* COMPARATIVE GRID: Rendering layout based on mode */}
            {comparisonMode === 'side-by-side' ? (
              <div className="grid grid-cols-2 gap-4 w-full max-w-2xl animate-fade-in">
                {/* Before column */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[9px] font-mono font-black uppercase text-slate-400 select-none bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                    Original Frame (Before)
                  </span>
                  <div className="relative border-4 border-slate-800/80 rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center aspect-[3/4] w-[140px] sm:w-[220px]">
                    <img 
                      src={imageSrc} 
                      alt="Before comparison" 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                {/* Live Output column */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[9px] font-mono font-black uppercase text-indigo-400 select-none bg-slate-950 px-2 py-0.5 rounded border border-indigo-950">
                    Live Output (After)
                  </span>
                  <div className="relative border-4 border-indigo-500/30 rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center aspect-[3/4] w-[140px] sm:w-[220px]">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="cursor-crosshair w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Normal Active View (With rich interactive Zoom & Panning support)
              <div 
                ref={canvasContainerRef}
                onMouseDown={isPanning ? startPanning : undefined}
                onMouseMove={isPanning ? handlePanning : undefined}
                onMouseUp={isPanning ? stopDrawing : undefined}
                onTouchStart={isPanning ? startPanning : undefined}
                onTouchMove={isPanning ? handlePanning : undefined}
                onTouchEnd={isPanning ? stopDrawing : undefined}
                className={`relative shadow-2xl border-4 ${
                  isHoldingBefore ? 'border-amber-500/50' : 'border-indigo-500/20'
                } rounded-xl overflow-hidden bg-slate-950 touch-none flex items-center justify-center w-[270px] h-[360px] sm:w-[300px] sm:h-[400px]`}
                style={{ cursor: isPanning ? 'grab' : 'auto' }}
              >
                {/* Hold to compare display overlay */}
                {isHoldingBefore ? (
                  <div className="absolute inset-0 z-35 animate-fade-in w-full h-full">
                    <img 
                      src={imageSrc} 
                      alt="Original snapshot comparison" 
                      className="w-full h-full object-cover pointer-events-none" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 bg-amber-600 border border-amber-400 text-[8px] font-mono text-white font-extrabold px-1.5 py-0.5 rounded shadow">
                      VIEWING ORIGINAL BACKGROUND
                    </div>
                  </div>
                ) : null}

                {/* Real physical canvas with scaling context */}
                <div 
                  className="transition-transform duration-75 origin-center ease-out pb-0.5"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="cursor-crosshair w-[270px] h-[360px] sm:w-[300px] sm:h-[400px]"
                    style={{ display: isHoldingBefore ? 'none' : 'block' }}
                  />
                </div>

                {!imageLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-40">
                    <div className="w-8 h-8 rounded-full border-t-2 border-indigo-500 animate-spin mb-1.5" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Loading High Resolution Pixels...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zoom and comparison quick navigation toolbar */}
          {comparisonMode !== 'side-by-side' && (
            <div className="flex items-center gap-2.5 bg-slate-950 px-4 py-2 rounded-full border border-slate-800 shadow-xl z-20">
              {/* Zoom Button Deck */}
              <button
                type="button"
                onClick={() => adjustZoom('out')}
                disabled={zoomLevel <= 1.0}
                className="p-1.5 bg-slate-905 hover:bg-slate-800 text-slate-350 disabled:text-slate-650 rounded-full transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <div className="text-[10px] font-mono text-slate-400 font-bold px-1 select-none">
                {Math.round(zoomLevel * 100)}%
              </div>

              <button
                type="button"
                onClick={() => adjustZoom('in')}
                disabled={zoomLevel >= 3.0}
                className="p-1.5 bg-slate-905 hover:bg-slate-800 text-slate-350 disabled:text-slate-650 rounded-full transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className="w-px h-4 bg-slate-800 self-center" />

              {/* Pan Toggle state */}
              <button
                type="button"
                onClick={() => setIsPanning(!isPanning)}
                disabled={zoomLevel <= 1.0}
                className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase rounded-lg border transition cursor-pointer ${
                  isPanning 
                    ? 'bg-amber-600/20 text-amber-300 border-amber-550/40 shadow-sm'
                    : 'bg-slate-905 text-slate-400 border-slate-800 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title="Drag or pan around zoomed in photo bounds"
              >
                {isPanning ? "⭐ PANNING ACTIVE" : "PAN FRAME"}
              </button>

              <div className="w-px h-4 bg-slate-800 self-center" />

              {/* Hold to view before */}
              <button
                type="button"
                onMouseDown={() => setIsHoldingBefore(true)}
                onMouseUp={() => setIsHoldingBefore(false)}
                onMouseLeave={() => setIsHoldingBefore(false)}
                onTouchStart={() => setIsHoldingBefore(true)}
                onTouchEnd={() => setIsHoldingBefore(false)}
                className="px-3 py-1 bg-indigo-950/40 border border-indigo-900/50 hover:bg-indigo-900/30 text-indigo-300 rounded-lg text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 transition select-none cursor-pointer"
                title="Press and hold to check changes against student's raw photograph background"
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Hold to Compare</span>
              </button>
            </div>
          )}

          {/* Canvas Mini Help guide bar */}
          <div className="text-[10px] text-slate-400 text-center max-w-md leading-relaxed flex items-center gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-850">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-left font-normal">
              {toolMode === 'paint' && "Paint Mode: Brush chosen studio colors dynamically onto edges to clean spots or light-leaks."}
              {toolMode === 'restore' && "Restore Original: Easily erase painted parts with soft transparent touch to restore student's hair or skin details."}
              {toolMode === 'bucket' && "Bucket Fill: Select target color, click any solid area to auto fill boundaries."}
            </span>
          </div>
        </div>

        {/* Right Commands Panel */}
        <div className="w-full lg:w-85 flex flex-col justify-between gap-5 border-t lg:border-t-0 lg:border-l border-slate-850 pt-5 lg:pt-0 lg:pl-6 max-h-[88vh] overflow-y-auto pr-1">
          <div className="space-y-4">
            
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100 tracking-wider">
                  Manual Studio Background Editor
                </h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-1">
                  Replace backgrounds, remove objects, and refine margins with pixel level accuracy.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer p-1"
                title="Toggle instructions"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>

            {showHelp && (
              <div className="bg-indigo-950/20 border border-indigo-500/15 rounded-lg p-3 text-[9.5px] leading-relaxed text-slate-300 space-y-2">
                <span className="font-extrabold text-indigo-300 block">Pro Workspace Tools:</span>
                <p>1. <strong className="text-white">Autocopy Segmentation</strong>: Instantly covers 100% background areas via the <strong className="text-yellow-400">Apply Background to Entire Image</strong> button below.</p>
                <p>2. <strong className="text-white">Feather Adjusters</strong>: Increase softness to get smooth, blending ear/hair borders that look authentic.</p>
                <p>3. <strong className="text-white">Precision Correction</strong>: Toggle zoom in up to 300% to paint or restore fine pixel edges meticulously.</p>
              </div>
            )}

            {/* Feature (A): Auto fill trigger button */}
            <div className="bg-slate-950/65 border border-slate-850 p-2.5 rounded-lg space-y-2">
              <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wide block">
                ⭐ Automatic Full Background segmentation
              </span>
              <button
                type="button"
                onClick={applyBackgroundToEntireImage}
                className="w-full py-2 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-505 hover:scale-[1.01] active:scale-[0.99] text-white rounded text-xs font-black uppercase tracking-wider transition-all inline-flex justify-center items-center gap-2 shadow-lg shadow-indigo-900/10 cursor-pointer"
                title="Uses BFS queue-segmentation to instantly fill corners, shadows, and walls"
              >
                <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
                <span>Apply Background to Entire Image</span>
              </button>
              <div className="text-[8.5px] text-slate-400 leading-snug text-center">
                Recommended: Click first to fill 95% of the frame instantly, then use manual brushes to refine fine hair details.
              </div>
            </div>

            {/* Step 1: Background Color picker presets plus custom picker */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-400 uppercase font-black tracking-wider block">
                1. Pick Target Passport Color
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'white', name: 'White', colorClass: 'bg-white text-slate-950 border border-slate-300', hex: '#FFFFFF' },
                  { id: 'light-blue', name: 'Light Blue', colorClass: 'bg-[#BFDBFF] text-slate-950 border border-blue-300', hex: '#BFDBFF' },
                  { id: 'light-gray', name: 'Light Gray', colorClass: 'bg-[#E6E9EE] text-slate-950 border border-slate-300', hex: '#E6E9EE' }
                ].map((color) => {
                  const isSel = selectedColorType === color.id;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColorType(color.id as StudioBgColor)}
                      className={`py-1 rounded flex flex-col items-center justify-center gap-0.5 transition-all text-[9.5px] font-bold cursor-pointer border ${
                        isSel
                          ? 'ring-2 ring-indigo-500 scale-[1.02] outline-none shadow shadow-indigo-550/20 opacity-100 font-black'
                          : 'opacity-70 hover:opacity-100 hover:scale-[1.01]'
                      } ${color.colorClass}`}
                    >
                      <span>{color.name}</span>
                      <span className="w-2.5 h-2.5 rounded-full border border-slate-400" style={{ backgroundColor: color.hex }} />
                    </button>
                  );
                })}

                {/* Custom Color picking block with customized input element */}
                <div className={`relative rounded border flex flex-col items-center justify-center bg-slate-950 transition-all ${
                  selectedColorType === 'custom' 
                    ? 'ring-2 ring-indigo-500 scale-[1.02] border-transparent font-black text-indigo-400' 
                    : 'border-slate-800 text-slate-400 opacity-70 hover:opacity-100'
                }`}>
                  <button
                    type="button"
                    onClick={() => setSelectedColorType('custom')}
                    className="w-full h-full py-1 text-[9.5px] font-bold text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                  >
                    <span>Custom</span>
                    <span className="w-2.5 h-2.5 rounded-full border border-slate-650" style={{ backgroundColor: customColor }} />
                  </button>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      setSelectedColorType('custom');
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Choose customized color spectrum"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Choose Editor Tool */}
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-400 uppercase font-black tracking-wider block">
                2. Choose Manual Brush / Eraser Tool
              </span>
              <div className="space-y-1.5 animate-fade-in">
                {[
                  {
                    id: 'paint',
                    name: 'Color Paintbrush (Solid Wall)',
                    desc: 'Paint Selected Studio Color on corners / objects',
                    icon: Paintbrush,
                    themeClass: 'text-indigo-400 border-indigo-500/40 bg-indigo-900/15'
                  },
                  {
                    id: 'restore',
                    name: 'Smart Eraser (Restore Original)',
                    desc: 'Rub skin/hair edges with soft blend to fix borders',
                    icon: Eraser,
                    themeClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-900/15'
                  },
                  {
                    id: 'bucket',
                    name: 'Magic Wand Bucket fill',
                    desc: '1-Click localized flood fill of targeted regions',
                    icon: Sparkles,
                    themeClass: 'text-amber-400 border-amber-500/40 bg-amber-900/15'
                  }
                ].map((tool) => {
                  const isActive = toolMode === tool.id;
                  const IconComp = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setToolMode(tool.id as Mode)}
                      className={`w-full flex items-start gap-3 p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        isActive
                          ? `${tool.themeClass} ring-1 ring-offset-1 ring-offset-slate-900 border-transparent shadow-md font-extrabold`
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/20 hover:bg-slate-950/50'
                      }`}
                    >
                      <span className="mt-0.5"><IconComp className="w-4 h-4" /></span>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[10.5px] uppercase font-bold tracking-tight text-slate-200">
                          {tool.name}
                        </span>
                        <span className="block text-[8.5px] text-slate-400 leading-none mt-0.5">
                          {tool.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Brush Thickness & Softness/Feather Adjusters */}
            {toolMode !== 'bucket' && (
              <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-850">
                <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">
                  3. Brush & Soft Edge Configuration
                </span>

                {/* Thickness slider */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[9.5px] font-mono leading-none">
                    <span className="text-slate-450 uppercase font-bold">Brush Size:</span>
                    <span className="text-indigo-400 font-extrabold">{brushSize}px</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min="4"
                      max="60"
                      step="2"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="flex-1 accent-indigo-500 bg-slate-800 h-1 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Softness slider */}
                <div className="space-y-1 pt-1.5 border-t border-slate-900">
                  <div className="flex justify-between items-center text-[9.5px] font-mono leading-none">
                    <span className="text-slate-450 uppercase font-bold" title="Defines smoothness & fading along brush edges to avoid sharp jagged borders">
                      Brush Softness (Feather):
                    </span>
                    <span className="text-emerald-400 font-extrabold">{brushSoftness}%</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={brushSoftness}
                      onChange={(e) => setBrushSoftness(parseInt(e.target.value))}
                      className="flex-1 accent-emerald-500 bg-slate-800 h-1 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Before / After Comparison Layout Toggles */}
            <div className="space-y-1.5 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                4. Before & After comparison displays
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setComparisonMode('normal')}
                  className={`py-1.5 rounded text-[9.5px] uppercase font-black transition cursor-pointer border ${
                    comparisonMode === 'normal'
                      ? 'bg-indigo-950/40 text-indigo-300 border-indigo-900/60 shadow-md'
                      : 'bg-slate-905 text-slate-400 border-slate-850 hover:text-slate-200'
                  }`}
                >
                  Standard Zoom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComparisonMode('side-by-side');
                    setZoomLevel(1.0); // side-by-side is best at original zoom levels
                  }}
                  className={`py-1.5 rounded text-[9.5px] uppercase font-black transition cursor-pointer border ${
                    comparisonMode === 'side-by-side'
                      ? 'bg-indigo-950/40 text-indigo-300 border-indigo-900/60 shadow-md'
                      : 'bg-slate-905 text-slate-400 border-slate-850 hover:text-slate-200'
                  }`}
                >
                  Side-by-Side Grid
                </button>
              </div>
            </div>
            
            {/* Timeline History Navigation Undo / Redo */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider inline-flex justify-center items-center gap-1.5 transition ${
                  historyIndex <= 0
                    ? 'bg-slate-850 text-slate-550 border border-slate-800/40 cursor-not-allowed'
                    : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer'
                }`}
                title="Undo last stroke action"
              >
                <Undo className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider inline-flex justify-center items-center gap-1.5 transition ${
                  historyIndex >= history.length - 1
                    ? 'bg-slate-850 text-slate-550 border border-slate-800/40 cursor-not-allowed'
                    : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer'
                }`}
                title="Redo next stroke action"
              >
                <Redo className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>
              
              <button
                type="button"
                onClick={handleReset}
                className="py-1.5 px-3 bg-rose-950/20 hover:bg-rose-950/40 text-rose-450 hover:text-rose-350 border border-red-950/40 hover:border-red-900/50 rounded text-[10px] uppercase font-bold tracking-wider inline-flex justify-center items-center gap-1.5 transition cursor-pointer shrink-0"
                title="Reset back to imported photo state"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All</span>
              </button>
            </div>
          </div>

          {/* Action Footer Button Drawer */}
          <div className="space-y-2 pt-4 border-t border-slate-850/60 mt-4 lg:mt-0">
            <button
              type="button"
              onClick={handleApply}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-lg text-xs uppercase font-black tracking-wider transition-all inline-flex justify-center items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <Check className="w-4.5 h-4.5" />
              <span>Apply Background Edits</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 bg-slate-950 hover:bg-slate-925 text-slate-400 hover:text-slate-300 rounded text-[10px] uppercase font-bold tracking-wider transition border border-slate-850 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
