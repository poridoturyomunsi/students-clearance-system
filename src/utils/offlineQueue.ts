/**
 * Offline-First IndexedDB Scan Queue & Edge Synchronization Service
 * Stores gate check-in/out records locally when offline and auto-syncs when online.
 */

export interface OfflineScanRecord {
  id: string;
  scanValue: string;
  direction?: 'clock-in' | 'clock-out' | 'auto';
  timestamp: number;
  synced: boolean;
}

const DB_NAME = 'StPaulGateOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_scans';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineScan(scanValue: string, direction: 'clock-in' | 'clock-out' | 'auto' = 'auto'): Promise<OfflineScanRecord> {
  const scanRecord: OfflineScanRecord = {
    id: `offscan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    scanValue,
    direction,
    timestamp: Date.now(),
    synced: false
  };

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(scanRecord);
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    console.log('[OfflineQueue] Successfully stored scan record locally:', scanRecord.id);
  } catch (err) {
    console.error('[OfflineQueue] Failed to store offline scan:', err);
  }

  return scanRecord;
}

export async function getPendingOfflineScans(): Promise<OfflineScanRecord[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[OfflineQueue] Failed to retrieve pending scans:', err);
    return [];
  }
}

export async function removeOfflineScan(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[OfflineQueue] Failed to delete scan:', err);
  }
}

export async function syncPendingOfflineScans(apiSyncFn: (scan: OfflineScanRecord) => Promise<boolean>): Promise<{ syncedCount: number; remainingCount: number }> {
  const pendingScans = await getPendingOfflineScans();
  if (pendingScans.length === 0) {
    return { syncedCount: 0, remainingCount: 0 };
  }

  console.log(`[OfflineQueue] Starting auto-sync for ${pendingScans.length} pending offline gate scans...`);
  let syncedCount = 0;

  for (const scan of pendingScans) {
    try {
      const success = await apiSyncFn(scan);
      if (success) {
        await removeOfflineScan(scan.id);
        syncedCount++;
      }
    } catch (err) {
      console.warn(`[OfflineQueue] Sync failed for item ${scan.id}, retaining in queue:`, err);
    }
  }

  const remaining = await getPendingOfflineScans();
  console.log(`[OfflineQueue] Sync finished. Synced: ${syncedCount}, Remaining: ${remaining.length}`);
  return { syncedCount, remainingCount: remaining.length };
}

// Auto-sync event listener on network restore
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Network reconnected. Dispatched online sync check.');
    window.dispatchEvent(new CustomEvent('spss_network_reconnected'));
  });
}
