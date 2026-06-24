// Basic web worker for heavy data processing (image compression, large merges)
addEventListener('message', async (ev) => {
  const { taskId, action, payload } = ev.data || {};
  try {
    if (action === 'compressImage') {
      // payload: { dataUrl, quality }
      const compressed = await compressImage(payload.dataUrl, payload.quality || 0.7);
      postMessage({ taskId, success: true, result: compressed });
      return;
    }

    // default: echo
    postMessage({ taskId, success: true, result: payload });
  } catch (e: any) {
    postMessage({ taskId, success: false, error: e && e.message });
  }
});

async function compressImage(dataUrl: string, quality = 0.7) {
  return new Promise<string>((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);
        canvas.convertToBlob({ type: 'image/jpeg', quality }).then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(dataUrl);
          reader.readAsDataURL(blob);
        }).catch(() => resolve(dataUrl));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (e) {
      resolve(dataUrl);
    }
  });
}
