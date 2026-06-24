import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, OperationType, handleFirestoreError, ensureSignedIn, fallbackToDefaultDatabase, isFallbackDbActive } from './firebase.ts';
import { Student, StudentBalance, DepartmentalClearance, PrintQueueItem } from '../types.ts';
import { ClassTheme } from '../utils/classColors.ts';

const STUDENTS_COLL = 'students';
const BRANDING_COLL = 'branding';
const THEMES_COLL = 'classThemes';
const BALANCES_COLL = 'balances';
const CLEARANCES_COLL = 'clearance';
const PRINTING_QUEUE_COLL = 'printing_queue';

/**
 * Uploads a student passport photo (base64) to Firebase Storage.
 */
export async function uploadStudentPhotoToStorage(studentId: string, base64Data: string): Promise<string> {
  try {
    console.log("[Photo Storage] Starting upload of photo for student ID:", studentId);
    const storageRef = ref(storage, `students/${studentId}/photo`);
    const uploadResult = await uploadString(storageRef, base64Data, 'data_url');
    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log("[Photo Storage] Upload completed successfully. Download URL:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.warn("[Photo Storage] Storage upload error or permission denied, using base64 directly:", error);
    return base64Data;
  }
}

/**
 * Loads all student records from Cloud Firestore.
 * If empty/offline, can fallback to local or pre-populated values.
 */
export async function loadStudentsFromFirestore(): Promise<Student[]> {
  try {
    await ensureSignedIn();
    const querySnapshot = await getDocs(collection(db, STUDENTS_COLL));
    const list: Student[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        adminNo: data.adminNo || '',
        name: data.name || '',
        gender: data.gender || 'Male',
        gradeClass: data.gradeClass || '',
        boardingStatus: data.boardingStatus || 'Boarder',
        isCleared: !!data.isCleared,
        gateClearanceDate: data.gateClearanceDate,
        mealsClearanceDate: data.mealsClearanceDate,
        remarks: data.remarks,
        photo: data.photo,
        printStatus: data.printStatus || 'Not Printed'
      });
    });
    return list;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    if (!isFallbackDbActive && (errMsg.includes('not-found') || errMsg.includes('database') || errMsg.includes('permission') || errMsg.includes('exist') || errMsg.includes('NotFound') || error?.code === 'not-found')) {
      console.warn("loadStudentsFromFirestore failed on custom database. Retrying with default database...", error);
      try {
        fallbackToDefaultDatabase();
        const querySnapshot = await getDocs(collection(db, STUDENTS_COLL));
        const list: Student[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            adminNo: data.adminNo || '',
            name: data.name || '',
            gender: data.gender || 'Male',
            gradeClass: data.gradeClass || '',
            boardingStatus: data.boardingStatus || 'Boarder',
            isCleared: !!data.isCleared,
            gateClearanceDate: data.gateClearanceDate,
            mealsClearanceDate: data.mealsClearanceDate,
            remarks: data.remarks,
            photo: data.photo,
            printStatus: data.printStatus || 'Not Printed'
          });
        });
        return list;
      } catch (fallbackError) {
        console.error("loadStudentsFromFirestore failed on default database fallback as well:", fallbackError);
      }
    }
    handleFirestoreError(error, OperationType.LIST, STUDENTS_COLL);
  }
}

/**
 * Saves/Synchronizes the entire list of students in Firestore.
 * Performs a highly-efficient incremental write batch to avoid 
 * redundant read/write limits and never causes Transaction/Batch too large errors.
 * No destructive collection deletion is performed to prevent accidental data loss 
 * when syncing from stale or offline clients.
 */
export async function saveStudentsToFirestore(allStudents: Student[]): Promise<void> {
  try {
    await ensureSignedIn();
    
    interface DbOp {
      type: 'set';
      ref: any;
      data: any;
    }
    const ops: DbOp[] = [];

    // Add or set incoming students
    for (const std of allStudents) {
      let photoUrl = std.photo;
      if (photoUrl && photoUrl.startsWith('data:')) {
        photoUrl = await uploadStudentPhotoToStorage(std.id, photoUrl);
      }
      const docRef = doc(db, STUDENTS_COLL, std.id);
      ops.push({
        type: 'set',
        ref: docRef,
        data: {
          id: std.id,
          adminNo: std.adminNo || '',
          name: std.name || '',
          gender: std.gender || 'Male',
          gradeClass: std.gradeClass || '',
          boardingStatus: std.boardingStatus || 'Boarder',
          isCleared: !!std.isCleared,
          ...(std.gateClearanceDate ? { gateClearanceDate: std.gateClearanceDate } : {}),
          ...(std.mealsClearanceDate ? { mealsClearanceDate: std.mealsClearanceDate } : {}),
          ...(std.remarks ? { remarks: std.remarks } : {}),
          ...(photoUrl ? { photo: photoUrl } : {}),
          printStatus: std.printStatus || 'Not Printed'
        }
      });
    }

    // Commit in chunks of 400 to be perfectly safe from the 500 limit
    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.set(op.ref, op.data);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, STUDENTS_COLL);
  }
}

/**
 * Saves an individual student record.
 */
export async function saveStudentInFirestore(std: Student): Promise<void> {
  try {
    await ensureSignedIn();
    let photoUrl = std.photo;
    if (photoUrl && photoUrl.startsWith('data:')) {
      photoUrl = await uploadStudentPhotoToStorage(std.id, photoUrl);
    }
    const docRef = doc(db, STUDENTS_COLL, std.id);
    await setDoc(docRef, {
      id: std.id,
      adminNo: std.adminNo || '',
      name: std.name || '',
      gender: std.gender || 'Male',
      gradeClass: std.gradeClass || '',
      boardingStatus: std.boardingStatus || 'Boarder',
      isCleared: !!std.isCleared,
      ...(std.gateClearanceDate ? { gateClearanceDate: std.gateClearanceDate } : {}),
      ...(std.mealsClearanceDate ? { mealsClearanceDate: std.mealsClearanceDate } : {}),
      ...(std.remarks ? { remarks: std.remarks } : {}),
      ...(photoUrl ? { photo: photoUrl } : {}),
      printStatus: std.printStatus || 'Not Printed'
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${STUDENTS_COLL}/${std.id}`);
  }
}

/**
 * Deletes an individual student record.
 */
export async function deleteStudentInFirestore(studentId: string): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, STUDENTS_COLL, studentId);
    await deleteDoc(docRef);
    try {
      const storageRef = ref(storage, `students/${studentId}/photo`);
      await deleteObject(storageRef);
      console.log(`[Photo Storage] Photo deleted for student ID: ${studentId}`);
    } catch (photoErr) {
      // Photo might not exist or deletion might fail silently
      console.warn(`[Photo Storage] Photo delete failed or not found for student ID: ${studentId}`, photoErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${STUDENTS_COLL}/${studentId}`);
  }
}

/**
 * Deletes multiple student records in chunks to bypass batch size limits limit safely.
 */
export async function deleteMultipleStudentsInFirestore(studentIds: string[]): Promise<void> {
  try {
    await ensureSignedIn();
    const CHUNK_SIZE = 400;
    for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
      const chunk = studentIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        const docRef = doc(db, STUDENTS_COLL, id);
        batch.delete(docRef);
      });
      await batch.commit();

      // Delete photos from Firebase Storage
      for (const id of chunk) {
        try {
          const storageRef = ref(storage, `students/${id}/photo`);
          await deleteObject(storageRef);
        } catch (photoErr) {
          console.warn(`[Photo Storage] Photo delete failed or not found for student ID: ${id}`, photoErr);
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, STUDENTS_COLL);
  }
}

/**
 * Loads the official school logo branding.
 */
export async function loadBrandingFromFirestore(): Promise<{ logo: string; logoCleaned: boolean } | null> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, BRANDING_COLL, 'school');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        logo: data.logo || '',
        logoCleaned: !!data.logoCleaned
      };
    }
    return null;
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    if (!isFallbackDbActive && (errMsg.includes('not-found') || errMsg.includes('database') || errMsg.includes('permission') || errMsg.includes('exist') || errMsg.includes('NotFound') || error?.code === 'not-found')) {
      console.warn("loadBrandingFromFirestore failed on custom database. Retrying with default database...", error);
      try {
        fallbackToDefaultDatabase();
        const docRef = doc(db, BRANDING_COLL, 'school');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            logo: data.logo || '',
            logoCleaned: !!data.logoCleaned
          };
        }
        return null;
      } catch (fallbackError) {
        console.error("loadBrandingFromFirestore failed on default database fallback as well:", fallbackError);
      }
    }
    handleFirestoreError(error, OperationType.GET, `${BRANDING_COLL}/school`);
  }
}

/**
 * Uploads school logo (base64) to Firebase Storage.
 */
export async function uploadSchoolLogoToStorage(base64Data: string): Promise<string> {
  try {
    console.log("[Logo Storage] Starting upload of school logo");
    const storageRef = ref(storage, 'branding/school_logo');
    const uploadResult = await uploadString(storageRef, base64Data, 'data_url');
    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log("[Logo Storage] Upload completed successfully. Download URL:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.warn("[Logo Storage] Storage upload error or permission denied, using base64 directly:", error);
    return base64Data;
  }
}

/**
 * Saves the official school logo branding.
 */
export async function saveBrandingToFirestore(logo: string, logoCleaned: boolean): Promise<void> {
  try {
    await ensureSignedIn();
    let logoUrl = logo;
    if (logoUrl && logoUrl.startsWith('data:')) {
      logoUrl = await uploadSchoolLogoToStorage(logoUrl);
    }
    const docRef = doc(db, BRANDING_COLL, 'school');
    await setDoc(docRef, {
      logo: logoUrl,
      logoCleaned,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${BRANDING_COLL}/school`);
  }
}

/**
 * Deletes the official school branding, restoring defaults.
 */
export async function deleteBrandingFromFirestore(): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, BRANDING_COLL, 'school');
    await deleteDoc(docRef);
    try {
      const storageRef = ref(storage, 'branding/school_logo');
      await deleteObject(storageRef);
      console.log(`[Logo Storage] School logo deleted from storage`);
    } catch (logoErr) {
      console.warn(`[Logo Storage] School logo delete failed or not found in storage`, logoErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${BRANDING_COLL}/school`);
  }
}

/**
 * Loads custom class themes mapping.
 */
export async function loadClassThemesFromFirestore(): Promise<Record<string, ClassTheme> | null> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, THEMES_COLL, 'custom');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.themes || null;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${THEMES_COLL}/custom`);
  }
}

/**
 * Saves custom class themes mapping.
 */
export async function saveClassThemesToFirestore(themes: Record<string, ClassTheme>): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, THEMES_COLL, 'custom');
    await setDoc(docRef, {
      themes,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${THEMES_COLL}/custom`);
  }
}

/**
 * Loads all student balances from Firestore.
 */
export async function loadBalancesFromFirestore(): Promise<StudentBalance[]> {
  try {
    await ensureSignedIn();
    const querySnapshot = await getDocs(collection(db, BALANCES_COLL));
    const list: StudentBalance[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        studentId: doc.id,
        amountDue: data.amountDue || 0,
        status: data.status || 'Pending',
        updatedAt: data.updatedAt || new Date().toISOString()
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, BALANCES_COLL);
  }
}

/**
 * Saves a balance for a student in Firestore.
 */
export async function saveBalanceToFirestore(balance: StudentBalance): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, BALANCES_COLL, balance.studentId);
    await setDoc(docRef, {
      studentId: balance.studentId,
      amountDue: balance.amountDue,
      status: balance.status,
      updatedAt: balance.updatedAt
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${BALANCES_COLL}/${balance.studentId}`);
  }
}

/**
 * Loads all departmental clearances from Firestore.
 */
export async function loadClearancesFromFirestore(): Promise<DepartmentalClearance[]> {
  try {
    await ensureSignedIn();
    const querySnapshot = await getDocs(collection(db, CLEARANCES_COLL));
    const list: DepartmentalClearance[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        studentId: data.studentId || '',
        department: data.department || 'Bursar',
        status: data.status || 'Hold',
        remarks: data.remarks || '',
        clearedBy: data.clearedBy || '',
        approvedAt: data.approvedAt || ''
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CLEARANCES_COLL);
  }
}

/**
 * Saves a departmental clearance.
 */
export async function saveClearanceToFirestore(clearance: DepartmentalClearance): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, CLEARANCES_COLL, clearance.id);
    await setDoc(docRef, {
      id: clearance.id,
      studentId: clearance.studentId,
      department: clearance.department,
      status: clearance.status,
      remarks: clearance.remarks || '',
      clearedBy: clearance.clearedBy || '',
      approvedAt: clearance.approvedAt || new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${CLEARANCES_COLL}/${clearance.id}`);
  }
}

/**
 * Loads all print queue items from Firestore.
 */
export async function loadPrintQueueFromFirestore(): Promise<PrintQueueItem[]> {
  try {
    await ensureSignedIn();
    const querySnapshot = await getDocs(collection(db, PRINTING_QUEUE_COLL));
    const list: PrintQueueItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        studentId: data.studentId || '',
        queuedAt: data.queuedAt || '',
        status: data.status || 'Queued'
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, PRINTING_QUEUE_COLL);
  }
}

/**
 * Saves or updates a print queue item.
 */
export async function savePrintQueueItemToFirestore(item: PrintQueueItem): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, PRINTING_QUEUE_COLL, item.id);
    await setDoc(docRef, {
      id: item.id,
      studentId: item.studentId,
      queuedAt: item.queuedAt,
      status: item.status
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${PRINTING_QUEUE_COLL}/${item.id}`);
  }
}

/**
 * Removes a print queue item.
 */
export async function deletePrintQueueItemInFirestore(itemId: string): Promise<void> {
  try {
    await ensureSignedIn();
    const docRef = doc(db, PRINTING_QUEUE_COLL, itemId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PRINTING_QUEUE_COLL}/${itemId}`);
  }
}
