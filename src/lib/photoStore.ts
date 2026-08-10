const DB_NAME = "balavie_photo_store";
const STORE_NAME = "meal_photos";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMealPhoto(mealId: string, photoDataUrl: string): Promise<void> {
  if (!mealId || !photoDataUrl) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ id: mealId, dataUrl: photoDataUrl, createdAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Error saving photo to IndexedDB:", err);
  }
}

export async function getMealPhoto(mealId: string): Promise<string | null> {
  if (!mealId) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(mealId);
      req.onsuccess = () => {
        resolve(req.result ? req.result.dataUrl : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("Error reading photo from IndexedDB:", err);
    return null;
  }
}

export async function deleteMealPhoto(mealId: string): Promise<void> {
  if (!mealId) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(mealId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("Error deleting photo from IndexedDB:", err);
  }
}

export async function clearAllMealPhotos(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("Error clearing photos from IndexedDB:", err);
  }
}

export async function getAllMealPhotosMap(): Promise<Record<string, string>> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        const map: Record<string, string> = {};
        for (const item of items) {
          if (item && item.id && item.dataUrl) {
            map[item.id] = item.dataUrl;
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  } catch (err) {
    console.warn("Error fetching all photos from IndexedDB:", err);
    return {};
  }
}
