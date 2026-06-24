import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export let db: any;
try {
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
} catch (e) {
  console.error("Synchronous Firestore initialization failed with custom database ID. Falling back to (default)...", e);
  db = getFirestore(app, '(default)');
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { GoogleAuthProvider, signInWithPopup, signOut };

// Track dynamic database routing state
export let isFallbackDbActive = false;

/**
 * Dynamically re-routes the live-bound 'db' export to the default Firestore database.
 */
export function fallbackToDefaultDatabase() {
  if (isFallbackDbActive) return;
  try {
    db = getFirestore(app, '(default)');
    isFallbackDbActive = true;
    console.info("Successfully re-routed db to standard (default) database.");
  } catch (e) {
    console.error("Critical: Failed to switch to default database:", e);
  }
}

// Enable offline persistence for seamless work when disconnected
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore persistence failed precondition (multiple tabs open).");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore persistence is unimplemented by this browser.");
    } else {
      console.error("Firestore persistence failed to enable:", err);
    }
  });
}

// Authentication state handling
let onAuthReadyCallback: (() => void) | null = null;
let isAuthInit = false;

onAuthStateChanged(auth, (user) => {
  isAuthInit = true;
  if (onAuthReadyCallback) {
    onAuthReadyCallback();
  }
});

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig && 
    firebaseConfig.apiKey && 
    !firebaseConfig.apiKey.includes('remixed') && 
    firebaseConfig.projectId && 
    !firebaseConfig.projectId.includes('remixed')
  );
}

/**
 * Ensures a user is signed in to communicate with backend.
 */
export async function ensureSignedIn(): Promise<User> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured yet (using placeholder API key). Please run Database Setup to connect.');
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }
  
  // Wait if auth is still initializing
  if (!isAuthInit) {
    await new Promise<void>((resolve) => {
      onAuthReadyCallback = resolve;
      // Safety timeout
      setTimeout(resolve, 1500);
    });
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    console.warn("Anonymous sign in is restricted or disabled in the Firebase Console. Falling back to unauthenticated public cloud sync.", error);
    return {
      uid: 'guest-public-user',
      isAnonymous: true,
      email: null,
      displayName: 'Guest Public User',
    } as any;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  if (!isFirebaseConfigured()) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
