import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, RotateCcw, AlertCircle, Play, VideoOff, ArrowRightLeft, Info, HelpCircle } from 'lucide-react';
import { processStudentPhoto } from '../utils/imageProcessor';

interface WebcamCaptureProps {
  onCapture: (base64Image: string, isPassportStyle: boolean) => void;
  onClose: () => void;
}

export default function WebcamCapture({ onCapture, onClose }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'prompt' | 'granted' | 'denied'>('checking');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  // Streaming states
  const [isActive, setIsActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [hasAutoSelectedDroidCam, setHasAutoSelectedDroidCam] = useState<boolean>(false);
  
  // Captured photo states
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [isPassportStyle, setIsPassportStyle] = useState<boolean>(true);
  const countdownIntervalRef = useRef<any>(null);

  // Real-time analyzers
  const [lightingStatus, setLightingStatus] = useState<'good' | 'low' | 'bright'>('good');
  const [lightingValue, setLightingValue] = useState<number>(128);
  const [faceStatus, setFaceStatus] = useState<'centered' | 'not-detected' | 'off-center'>('not-detected');
  const [realtimeWarnings, setRealtimeWarnings] = useState<string[]>([]);

  // Captured quality analysis
  const [blurScore, setBlurScore] = useState<number>(0);
  const [isBlurryImage, setIsBlurryImage] = useState<boolean>(false);
  const [qualityGrade, setQualityGrade] = useState<'Good' | 'Fair' | 'Poor'>('Fair');
  const [qualityMetrics, setQualityMetrics] = useState<{
    lighting: string;
    focus: string;
    face: string;
    score: number;
    warnings: string[];
  } | null>(null);

  // Trigger permission check on mount
  useEffect(() => {
    checkPermissions();
    return () => {
      stopCamera();
    };
  }, []);

  // Run real-time live preview checking logic every 500ms
  useEffect(() => {
    if (!isActive || capturedImage) return;

    const timer = setInterval(() => {
      analyzeLiveFrame();
    }, 500);

    return () => clearInterval(timer);
  }, [isActive, capturedImage, facingMode]);

  // Apply real-time passport background transformation and smart gloss enhancements when captured
  useEffect(() => {
    if (!rawCapturedImage) return;

    let isCurrent = true;
    const processImage = async () => {
      try {
        const processed = await processStudentPhoto(rawCapturedImage, {
          zoom: 1.0,
          autoCenter: true,
          whitenIntensity: 45,
          filter: 'studio',
          bgReplacementColor: isPassportStyle ? 'white' : 'none'
        });
        if (isCurrent) {
          setCapturedImage(processed);
          evaluateCapturedImage(processed);
        }
      } catch (err) {
        console.error("Failed to apply advanced capture processing:", err);
        if (isCurrent) {
          setCapturedImage(rawCapturedImage);
          evaluateCapturedImage(rawCapturedImage);
        }
      }
    };

    processImage();
    return () => {
      isCurrent = false;
    };
  }, [isPassportStyle, rawCapturedImage]);

  // Check camera permissions
  const checkPermissions = async () => {
    try {
      setPermissionStatus('checking');
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as any });
          if (status.state === 'granted') {
            setPermissionStatus('granted');
            startCamera();
          } else if (status.state === 'prompt') {
            setPermissionStatus('prompt');
          } else {
            setPermissionStatus('denied');
          }
          
          status.onchange = () => {
            if (status.state === 'granted') {
              setPermissionStatus('granted');
              startCamera();
            } else if (status.state === 'denied') {
              setPermissionStatus('denied');
              stopCamera();
            }
          };
          return;
        } catch {
          // Fallback if camera permissions query is not supported
        }
      }
      
      // Fallback request
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setPermissionStatus('granted');
      startCamera();
    } catch (err: any) {
      console.warn("Permission check failed:", err);
      setPermissionStatus('prompt');
    }
  };

  // Start back or front camera stream with autofocus and highest resolution parameters
  const startCamera = async (deviceId?: string) => {
    stopCamera();
    setPermissionError(null);
    try {
      // 1. Request highest resolution constraints available (4K -> 1085p -> 720p)
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId 
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 3840, min: 640 },
              height: { ideal: 2160, min: 480 }
            } 
          : {
              facingMode: facingMode,
              width: { ideal: 3840, min: 640 },
              height: { ideal: 2160, min: 480 }
            }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsActive(true);
      setPermissionStatus('granted');

      // 2. Hardware autofocus check & enablement
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities() as any;
          const constraintsToApply: any = {};
          
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            constraintsToApply.focusMode = 'continuous';
          }
          if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
            constraintsToApply.exposureMode = 'continuous';
          }
          if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
            constraintsToApply.whiteBalanceMode = 'continuous';
          }
          
          if (Object.keys(constraintsToApply).length > 0) {
            await track.applyConstraints({ advanced: [constraintsToApply] } as any);
          }
        } catch (e) {
          console.warn("Could not apply hardware capabilities:", e);
        }
      }

      // 3. Enumerate video devices
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === 'videoinput');
        setDevices(videoDevs);
        
        if (videoDevs.length > 0) {
          // Priority auto-selection for DroidCam webcam source if available
          const droidCam = videoDevs.find(d => d.label.toLowerCase().includes('droidcam'));
          if (droidCam && !hasAutoSelectedDroidCam && !deviceId) {
            setHasAutoSelectedDroidCam(true);
            setSelectedDeviceId(droidCam.deviceId);
            startCamera(droidCam.deviceId);
            return;
          }
          
          if (!selectedDeviceId) {
            setSelectedDeviceId(deviceId || videoDevs[0].deviceId);
          }
        }
      } catch (e) {
        console.warn("Devices enumeration failed", e);
      }
    } catch (err: any) {
      console.error("Error accessing webcam:", err);
      setPermissionStatus('denied');
      setPermissionError(
        err.name === 'NotAllowedError' 
          ? 'Access denied. Please enable camera access in your browser settings.' 
          : `Failed to access camera: ${err.message || 'Unknown device error'}`
      );
    }
  };

  // Stop camera tracks cleanly
  const stopCamera = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  };

  // Analyze video frame in real-time
  const analyzeLiveFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement('canvas');
    const w = 150;
    const h = 200;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Calculate luminance
    let totalBrightness = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += lum;
      count++;
    }
    const avgLum = count > 0 ? totalBrightness / count : 128;
    setLightingValue(Math.round(avgLum));

    let lightState: 'good' | 'low' | 'bright' = 'good';
    const warnings: string[] = [];

    if (avgLum < 65) {
      lightState = 'low';
      warnings.push("Low lighting. Bring more light to the subject's face.");
    } else if (avgLum > 215) {
      lightState = 'bright';
      warnings.push("Lighting is too bright / over-exposed.");
    }
    setLightingStatus(lightState);

    // 2. Face Position Check
    let detectedFace = false;
    let faceCentered = false;

    // Browser native FaceDetector API check
    // @ts-ignore
    if ('FaceDetector' in window) {
      try {
        // @ts-ignore
        const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
        const faces = await detector.detect(canvas);
        if (faces.length > 0) {
          detectedFace = true;
          const face = faces[0];
          const faceX = face.boundingBox.x + face.boundingBox.width / 2;
          const faceY = face.boundingBox.y + face.boundingBox.height / 2;
          const targetX = w / 2;
          const targetY = h * 0.45;
          const dist = Math.sqrt((faceX - targetX) ** 2 + (faceY - targetY) ** 2);
          
          if (dist < w * 0.18) {
            faceCentered = true;
          } else {
            warnings.push("Center the student's face inside the guide frame.");
          }
        }
      } catch (err) {
        console.warn("Native face detector error during live check:", err);
      }
    }

    // Fallback skin segmentation
    if (!detectedFace) {
      const midYStart = Math.floor(h * 0.25);
      const midYEnd = Math.floor(h * 0.70);
      const midXStart = Math.floor(w * 0.25);
      const midXEnd = Math.floor(w * 0.75);
      
      let centerSkinCount = 0;
      let centerCount = 0;
      let outerSkinCount = 0;
      let outerCount = 0;

      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          
          const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
          const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

          const inCenter = y >= midYStart && y <= midYEnd && x >= midXStart && x <= midXEnd;
          if (inCenter) {
            if (isSkin) centerSkinCount++;
            centerCount++;
          } else if (y < Math.floor(h * 0.25) && (x < Math.floor(w * 0.2) || x > Math.floor(w * 0.8))) {
            if (isSkin) outerSkinCount++;
            outerCount++;
          }
        }
      }

      const centerSkinRatio = centerCount > 0 ? centerSkinCount / centerCount : 0;
      const outerSkinRatio = outerCount > 0 ? outerSkinCount / outerCount : 0;

      if (centerSkinRatio > 0.12) {
        detectedFace = true;
        if (outerSkinRatio < 0.08) {
          faceCentered = true;
        } else {
          warnings.push("Remove cluttered items from the background.");
        }
      }
    }

    if (!detectedFace) {
      setFaceStatus('not-detected');
      warnings.push("Ensure student's face is visible within the guide frame.");
    } else if (!faceCentered) {
      setFaceStatus('off-center');
    } else {
      setFaceStatus('centered');
    }

    setRealtimeWarnings(warnings);
  };

  // Capture canvas snap at highest available webcam resolution
  const captureSnap = () => {
    if (!videoRef.current || !isActive) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    
    // Create canvas matching 3:4 passport aspect ratio at high resolution (1200x1600)
    canvas.width = 1200;
    canvas.height = 1600;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    // Center crop
    const targetAspect = 3 / 4;
    const currentAspect = videoWidth / videoHeight;
    let sx = 0, sy = 0, sWidth = videoWidth, sHeight = videoHeight;
    
    if (currentAspect > targetAspect) {
      sWidth = videoHeight * targetAspect;
      sx = (videoWidth - sWidth) / 2;
    } else {
      sHeight = videoWidth / targetAspect;
      sy = (videoHeight - sHeight) / 2;
    }
    
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
    
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.98);
    setRawCapturedImage(rawDataUrl);
    stopCamera();
  };

  // Flood fill background replacement for passport style white background
  const makeBackgroundWhite = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample background corners
    const corners = [[10, 10], [w - 10, 10], [15, 15], [w - 15, 15]];
    let bgR = 0, bgG = 0, bgB = 0;
    corners.forEach(([cx, cy]) => {
      const idx = (cy * w + cx) * 4;
      bgR += data[idx];
      bgG += data[idx+1];
      bgB += data[idx+2];
    });
    bgR /= corners.length;
    bgG /= corners.length;
    bgB /= corners.length;

    const visited = new Uint8Array(w * h);
    const queue: number[] = [];

    const isBgPixel = (idx: number) => {
      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];
      
      const isSkin = r > 60 && g > 40 && b > 30 && r > g;
      if (isSkin) return false;

      const dist = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);
      return dist < 55; // tolerance
    };

    // Seed borders
    for (let x = 0; x < w; x++) {
      const idxT = (0 * w + x) * 4;
      if (isBgPixel(idxT)) {
        queue.push(x, 0);
        visited[0 * w + x] = 1;
      }
    }
    for (let y = 1; y < h; y++) {
      const idxL = (y * w + 0) * 4;
      if (isBgPixel(idxL) && !visited[y * w + 0]) {
        queue.push(0, y);
        visited[y * w + 0] = 1;
      }
      const idxR = (y * w + (w - 1)) * 4;
      if (isBgPixel(idxR) && !visited[y * w + (w - 1)]) {
        queue.push(w - 1, y);
        visited[y * w + (w - 1)] = 1;
      }
    }

    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];

      const idx = (cy * w + cx) * 4;
      data[idx] = 255;
      data[idx+1] = 255;
      data[idx+2] = 255;

      const neighbors = [
        [cx - 1, cy], [cx + 1, cy],
        [cx, cy - 1], [cx, cy + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const vIdx = ny * w + nx;
          if (!visited[vIdx]) {
            const nIdx = vIdx * 4;
            if (isBgPixel(nIdx)) {
              visited[vIdx] = 1;
              queue.push(nx, ny);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Analyze blurriness and quality of the captured photo
  const evaluateCapturedImage = (imgSrc: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = 300;
      const h = 400;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // 1. Lighting check
      let totalBrightness = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
        count++;
      }
      const avgBrightness = count > 0 ? totalBrightness / count : 128;

      // 2. Sobel edge contrast check for focus / blur
      let diffSum = 0;
      let diffCount = 0;
      const ys = Math.floor(h * 0.2);
      const ye = Math.floor(h * 0.8);
      const xs = Math.floor(w * 0.2);
      const xe = Math.floor(w * 0.8);

      for (let y = ys; y < ye; y += 2) {
        for (let x = xs; x < xe; x += 2) {
          const idx = (y * w + x) * 4;
          const rightIdx = idx + 4;
          const bottomIdx = idx + w * 4;
          
          const val = (data[idx] + data[idx+1] + data[idx+2]) / 3;
          const rightVal = (data[rightIdx] + data[rightIdx+1] + data[rightIdx+2]) / 3;
          const bottomVal = (data[bottomIdx] + data[bottomIdx+1] + data[bottomIdx+2]) / 3;
          
          const dx = rightVal - val;
          const dy = bottomVal - val;
          diffSum += Math.abs(dx) + Math.abs(dy);
          diffCount++;
        }
      }

      const edgeStrength = diffCount > 0 ? diffSum / diffCount : 0;
      setBlurScore(edgeStrength);
      const isBlurry = edgeStrength < 4.8;
      setIsBlurryImage(isBlurry);

      // 3. Face Centering standard evaluation
      let facePoints = 0;
      let faceDetails = "Not Detected";
      const warnings: string[] = [];

      let skinCount = 0;
      let totalRegion = 0;
      for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y += 2) {
        for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x += 2) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
          if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
            skinCount++;
          }
          totalRegion++;
        }
      }
      const skinRatio = totalRegion > 0 ? skinCount / totalRegion : 0;

      if (skinRatio > 0.10) {
        facePoints = 30;
        faceDetails = "Centered";
      } else {
        warnings.push("Ensure student's face is fully visible and centered in the frame.");
      }

      // Exposure points
      let lightingPoints = 0;
      let lightingDetails = "Poor";
      if (avgBrightness >= 80 && avgBrightness <= 170) {
        lightingPoints = 35;
        lightingDetails = "Good";
      } else if (avgBrightness >= 55 && avgBrightness <= 200) {
        lightingPoints = 20;
        lightingDetails = "Acceptable";
        warnings.push("Lighting exposure is slightly off (dim or bright).");
      } else {
        warnings.push("Lighting exposure is poor. Face is too dark or washed out.");
      }

      // Focus points
      let focusPoints = 0;
      let focusDetails = "Blurry";
      if (!isBlurry) {
        if (edgeStrength >= 7.0) {
          focusPoints = 35;
          focusDetails = "Sharp";
        } else {
          focusPoints = 25;
          focusDetails = "Acceptable";
        }
      } else {
        warnings.push("Blur detected. Hold the camera steady and try capturing again.");
      }

      const totalScore = facePoints + lightingPoints + focusPoints;
      let grade: 'Good' | 'Fair' | 'Poor' = 'Poor';
      if (totalScore >= 80 && !isBlurry) {
        grade = 'Good';
      } else if (totalScore >= 50 && !isBlurry) {
        grade = 'Fair';
      } else {
        grade = 'Poor';
      }

      setQualityGrade(grade);
      setQualityMetrics({
        lighting: lightingDetails,
        focus: focusDetails,
        face: faceDetails,
        score: totalScore,
        warnings
      });
    };
    img.src = imgSrc;
  };

  // Auto-capture countdown timer
  const triggerAutoCapture = () => {
    if (countdownIntervalRef.current) return;
    setCountdown(3);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          return null;
        }
        if (prev === 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          captureSnap();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Toggle front vs back camera
  const toggleFacingMode = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    setRawCapturedImage(null);
    setQualityMetrics(null);
    setIsBlurryImage(false);
    startCamera();
  };

  // Save selection
  const handleConfirmSave = () => {
    if (isBlurryImage) {
      alert("Captured image is too blurry. Please recapture a clear image.");
      return;
    }
    if (capturedImage) {
      onCapture(capturedImage, isPassportStyle);
    } else if (rawCapturedImage) {
      onCapture(rawCapturedImage, isPassportStyle);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-2xl relative">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-indigo-400 animate-pulse" />
          <h4 className="text-[11px] font-mono font-black text-slate-100 uppercase tracking-widest">
            High Quality Photo Capture
          </h4>
        </div>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="text-[9px] hover:text-slate-200 text-slate-400 font-mono font-bold tracking-tight px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
        >
          [ CANCEL ]
        </button>
      </div>

      {permissionStatus === 'checking' && (
        <div className="flex flex-col items-center justify-center h-72 bg-slate-950/80 rounded-lg space-y-2 border border-slate-800">
          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
          <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">
            Initializing camera streams...
          </p>
        </div>
      )}

      {permissionStatus === 'prompt' && (
        <div className="flex flex-col items-center justify-center p-6 h-72 bg-slate-950/80 rounded-lg text-center space-y-3.5 border border-slate-800">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <div>
            <span className="text-[10px] font-black uppercase text-slate-200 tracking-wider block">
              Camera Access Required
            </span>
            <p className="text-[9.5px] text-slate-450 max-w-xs mx-auto mt-1 leading-normal">
              Please click below to request device camera permission for automatic student portrait capturing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.mediaDevices.getUserMedia({ video: true })
                .then((stream) => {
                  stream.getTracks().forEach(t => t.stop());
                  setPermissionStatus('granted');
                  startCamera();
                })
                .catch((e) => {
                  console.error(e);
                  setPermissionStatus('denied');
                  setPermissionError("Access rejected by browser. Please enable permissions explicitly.");
                });
            }}
            className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-500 rounded text-[9.5px] font-black uppercase tracking-widest text-white shadow-md active:scale-95 transition cursor-pointer"
          >
            Grant Camera Access
          </button>
        </div>
      )}

      {permissionStatus === 'denied' && (
        <div className="flex flex-col items-center justify-center p-6 min-h-[280px] bg-slate-950/80 rounded-lg text-center space-y-3.5 border border-slate-800">
          <VideoOff className="w-8 h-8 text-rose-500" />
          <div>
            <span className="text-[11px] font-black uppercase text-rose-350 tracking-wider block">
              Webcam Access Blocked / Failed
            </span>
            <p className="text-[10px] text-slate-400 mt-2 text-left max-w-xs mx-auto leading-relaxed">
              {permissionError || "No active webcam detected or permissions were denied."}
            </p>
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-left mt-3 max-w-xs mx-auto text-[9.5px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-200 block uppercase tracking-wider text-[8.5px]">How to unblock:</span>
              <p>1. Click the <strong>Camera Icon</strong> in the browser URL address bar.</p>
              <p>2. Select <strong>"Always allow..."</strong> and refresh the page.</p>
              <p>3. Ensure no other application (Zoom, Teams, Skype) is currently using your webcam.</p>
              <p>4. Check that the camera USB cable is securely plugged in.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={checkPermissions}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-bold uppercase tracking-wider rounded transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {permissionStatus === 'granted' && (
        <div className="space-y-3">
          {/* Main viewport */}
          <div className="relative aspect-[3/4] w-full max-w-[240px] mx-auto bg-black rounded-lg overflow-hidden border-2 border-slate-800 shadow-inner flex items-center justify-center group">
            
            {capturedImage ? (
              <img 
                src={capturedImage} 
                alt="Captured portrait" 
                className="w-full h-full object-cover" 
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
            )}

            {/* Guide Frame SVG Mask */}
            {!capturedImage && isActive && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Outer shading mask */}
                  <path 
                    fill="rgba(2, 6, 23, 0.45)" 
                    fillRule="evenodd" 
                    d="M0,0 H100 V100 H0 Z M50,15 C34.5,15 22,27.5 22,43 C22,58.5 34.5,71 50,71 C65.5,71 78,58.5 78,43 C78,27.5 65.5,15 50,15 Z" 
                  />
                  {/* Guide Oval */}
                  <ellipse cx="50" cy="43" rx="28" ry="28" fill="none" stroke={faceStatus === 'centered' ? '#10B981' : '#F59E0B'} strokeWidth="1.2" strokeDasharray="3,3" />
                  
                  {/* Eye alignment guidelines */}
                  <line x1="22" y1="38" x2="78" y2="38" stroke="#10B981" strokeWidth="0.8" strokeDasharray="4,4" className="opacity-60" />
                  
                  {/* Shoulders curves */}
                  <path d="M10,85 C25,73 75,73 90,85" fill="none" stroke="#10B981" strokeWidth="1" strokeDasharray="2,2" className="opacity-40" />
                </svg>

                {/* Status Bar */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-slate-950/75 px-2 py-0.5 rounded z-10 border border-slate-800">
                  <span className={`w-1.5 h-1.5 rounded-full ${faceStatus === 'centered' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
                  <span className="text-[7.5px] text-slate-350 font-mono tracking-wider font-bold">
                    {faceStatus === 'centered' ? 'ALIGNMENT: OK' : faceStatus === 'off-center' ? 'ALIGN FACE' : 'NO FACE DETECTED'}
                  </span>
                </div>
              </div>
            )}

            {/* Countdown overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center z-20 backdrop-blur-xs select-none">
                <span className="text-5xl font-extrabold text-indigo-400 animate-bounce">
                  {countdown}
                </span>
              </div>
            )}
          </div>

          {/* Real-time warnings during live stream */}
          {!capturedImage && realtimeWarnings.length > 0 && (
            <div className="p-2 bg-amber-950/25 border border-amber-900/40 rounded-lg text-[9.5px] text-amber-250 leading-relaxed max-w-[240px] mx-auto space-y-0.5">
              {realtimeWarnings.slice(0, 2).map((w, idx) => (
                <div key={idx} className="flex gap-1 items-start">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quality check results for captured image */}
          {capturedImage && qualityMetrics && (
            <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg max-w-[240px] mx-auto space-y-2">
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-850">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">
                  Captured Quality:
                </span>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                  qualityGrade === 'Good' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    : qualityGrade === 'Fair'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                }`}>
                  {qualityGrade} ({qualityMetrics.score}pts)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono text-slate-450">
                <div>Exposure: <strong className={qualityMetrics.lighting === 'Good' ? 'text-emerald-400' : 'text-amber-400'}>{qualityMetrics.lighting}</strong></div>
                <div>Focus: <strong className={qualityMetrics.focus === 'Sharp' || qualityMetrics.focus === 'Very Sharp' ? 'text-emerald-400' : 'text-rose-400'}>{qualityMetrics.focus}</strong></div>
                <div className="col-span-2">Position: <strong className="text-emerald-400">{qualityMetrics.face}</strong></div>
              </div>

              {qualityMetrics.warnings.length > 0 && (
                <div className="pt-1.5 border-t border-slate-850 space-y-1">
                  {qualityMetrics.warnings.map((w, idx) => (
                    <div key={idx} className="text-[8.5px] text-rose-350 leading-tight flex gap-1">
                      <span className="shrink-0">•</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* White Background Option Checkbox */}
          <div className="flex items-center justify-center gap-2 py-1 max-w-[240px] mx-auto">
            <label className="flex items-center gap-2 select-none cursor-pointer p-1.5 rounded-lg bg-slate-950/40 border border-slate-850/60 w-full justify-center">
              <input
                type="checkbox"
                checked={isPassportStyle}
                onChange={(e) => setIsPassportStyle(e.target.checked)}
                className="accent-indigo-500 rounded cursor-pointer w-3.5 h-3.5"
              />
              <span className="text-[9.5px] text-slate-300 font-bold uppercase tracking-wider font-mono">
                Passport Style (White Background)
              </span>
            </label>
          </div>

          {/* Action HUD */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
            {capturedImage ? (
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-[9.5px] font-black uppercase tracking-wider transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isBlurryImage}
                  className={`flex items-center gap-1 px-3.5 py-1.5 rounded text-[9.5px] font-black uppercase tracking-wider shadow-lg transition cursor-pointer ${
                    isBlurryImage 
                      ? 'bg-slate-805 border border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-emerald-600 hover:bg-emerald-505 text-white hover:shadow-emerald-950/20'
                  }`}
                  title={isBlurryImage ? "Cannot save blurry photo. Please retake." : "Save the passport image"}
                >
                  <Check className="w-3.5 h-3.5" /> Save Portrait
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5 justify-center">
                  <button
                    type="button"
                    onClick={captureSnap}
                    disabled={!isActive || countdown !== null}
                    className="flex-1 max-w-[120px] flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded text-[9px] font-black uppercase tracking-wider shadow-md transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" /> Shutter
                  </button>

                  <button
                    type="button"
                    onClick={triggerAutoCapture}
                    disabled={!isActive || countdown !== null}
                    className="flex-1 max-w-[124px] flex items-center justify-center gap-1 px-2.5 py-1.5 bg-amber-650 hover:bg-amber-600 disabled:bg-slate-850 disabled:text-slate-500 text-slate-100 hover:text-white rounded text-[9px] font-black uppercase tracking-wider shadow-md transition cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-amber-200" /> Auto-Shutter (3s)
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-slate-400 pt-1.5 border-t border-slate-850/40">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="flex items-center gap-1 text-[8.5px] font-mono hover:text-indigo-400 bg-slate-950/50 hover:bg-slate-950 px-2 py-0.5 rounded transition"
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5" /> Flip Camera
                  </button>

                  {devices.length > 1 && (
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        const devId = e.target.value;
                        setSelectedDeviceId(devId);
                        startCamera(devId);
                      }}
                      className="text-[8px] bg-slate-950 border border-slate-850 p-0.5 rounded text-slate-350 font-mono uppercase tracking-tight"
                    >
                      {devices.map((dev, idx) => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          Cam {idx + 1}: {dev.label.slice(0, 14)}...
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
