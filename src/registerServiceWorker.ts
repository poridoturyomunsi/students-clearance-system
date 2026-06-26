export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered service worker for development');
            // Force reload to clear cache
            window.location.reload();
          }
        });
      }
    });
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
