export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (!window.location.protocol.startsWith('http')) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service worker registered with scope:', registration.scope);
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}
