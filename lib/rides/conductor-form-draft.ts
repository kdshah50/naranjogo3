const DRAFT_KEY = "naranjogo-conductor-draft-v1";
const DB_NAME = "naranjogo-conductor";
const PHOTO_STORE = "photos";

export type ConductorDraftStep = 1 | 2 | 3 | 4;

export type ConductorFormDraft = {
  step: ConductorDraftStep;
  name: string;
  whatsapp: string;
  curp: string;
  rfc: string;
  licenseNumber: string;
  licenseExpiry: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  vehiclePlates: string;
  insuranceProvider: string;
  insurancePolicy: string;
  insuranceExpiry: string;
  primaryColonia: string;
  extraColonias: string[];
  description: string;
  acceptedTerms: boolean;
  acceptedPricing: boolean;
  savedAt: string;
};

export type ConductorPhotoKind = "license" | "vehicle_card" | "insurance";

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB clear failed"));
  });
}

type StoredPhoto = {
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
};

export function loadConductorFormDraft(): ConductorFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConductorFormDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const step = parsed.step;
    if (step !== 1 && step !== 2 && step !== 3 && step !== 4) return null;
    return {
      step,
      name: String(parsed.name ?? ""),
      whatsapp: String(parsed.whatsapp ?? ""),
      curp: String(parsed.curp ?? ""),
      rfc: String(parsed.rfc ?? ""),
      licenseNumber: String(parsed.licenseNumber ?? ""),
      licenseExpiry: String(parsed.licenseExpiry ?? ""),
      vehicleMake: String(parsed.vehicleMake ?? ""),
      vehicleModel: String(parsed.vehicleModel ?? ""),
      vehicleYear: String(parsed.vehicleYear ?? new Date().getFullYear()),
      vehicleColor: String(parsed.vehicleColor ?? ""),
      vehiclePlates: String(parsed.vehiclePlates ?? ""),
      insuranceProvider: String(parsed.insuranceProvider ?? ""),
      insurancePolicy: String(parsed.insurancePolicy ?? ""),
      insuranceExpiry: String(parsed.insuranceExpiry ?? ""),
      primaryColonia: String(parsed.primaryColonia ?? "centro"),
      extraColonias: Array.isArray(parsed.extraColonias)
        ? parsed.extraColonias.map(String)
        : [],
      description: String(parsed.description ?? ""),
      acceptedTerms: Boolean(parsed.acceptedTerms),
      acceptedPricing: Boolean(parsed.acceptedPricing),
      savedAt: String(parsed.savedAt ?? ""),
    };
  } catch {
    return null;
  }
}

export function draftHasContent(draft: ConductorFormDraft | null): boolean {
  if (!draft) return false;
  return Boolean(
    draft.name.trim() ||
      draft.whatsapp.trim() ||
      draft.licenseNumber.trim() ||
      draft.vehiclePlates.trim(),
  );
}

export function saveConductorFormDraft(draft: ConductorFormDraft): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function saveConductorDraftPhoto(
  kind: ConductorPhotoKind,
  file: File,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openPhotoDb();
    const stored: StoredPhoto = {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      data: await file.arrayBuffer(),
    };
    await idbPut(db, kind, stored);
  } catch {
    /* photos won't survive refresh on this browser */
  }
}

export async function deleteConductorDraftPhoto(kind: ConductorPhotoKind): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openPhotoDb();
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(kind);
  } catch {
    /* ignore */
  }
}

export async function loadConductorDraftPhoto(
  kind: ConductorPhotoKind,
): Promise<File | null> {
  if (typeof window === "undefined") return null;
  try {
    const db = await openPhotoDb();
    const stored = await idbGet<StoredPhoto>(db, kind);
    if (!stored?.data) return null;
    return new File([stored.data], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
  } catch {
    return null;
  }
}

export async function clearConductorFormDraft(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  try {
    const db = await openPhotoDb();
    await idbClear(db);
  } catch {
    /* ignore */
  }
}

export function hasConductorFormDraft(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DRAFT_KEY) != null;
}
