/**
 * ClinixVault Zero-Egress Persistent Cache Service (IndexedDB)
 *
 * Implements HIPAA-compliant on-premises edge persistence for:
 * 1. In-flight SOAP notes & clinical dialogue drafts
 * 2. Pending clinical reports & radiology analyses queued during backend disconnection
 * 3. Offline encounters and patient roster registrations
 * 4. Automatic background synchronization upon backend connectivity restoration
 */

export interface CachedDraft {
  id: string; // e.g. "soap_PT-AMB-8821" or "rad_STUDY-9921"
  category: 'soap' | 'radiology' | 'summary' | 'general';
  patientId: string;
  encounterId?: string;
  title: string;
  data: any;
  updatedAt: number;
}

export interface PendingReportAction {
  id: string;
  category: 'soap' | 'radiology' | 'summary' | 'encounter';
  patientId: string;
  title: string;
  payload: any;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
  createdAt: number;
  syncedAt?: number;
  retryCount: number;
}

export interface OfflineEncounter {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  dob: string;
  chiefComplaint: string;
  examRoom: string;
  status: 'In Progress' | 'Synthesizing' | 'Ready for Review' | 'Committed';
  vitals: {
    bp: string;
    hr: string;
    spo2: string;
    temp: string;
    bmi: string;
  };
  timestamp: string;
  createdAt: number;
  synced: boolean;
}

const DB_NAME = 'clinixvault_zero_egress_db';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const PENDING_STORE = 'pending_reports';
const ENCOUNTERS_STORE = 'offline_encounters';

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Initialize or retrieve the singleton IndexedDB connection.
 */
export async function getOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB is not supported in this environment');
  }

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. In-flight drafts store
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const draftsStore = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
        draftsStore.createIndex('category', 'category', { unique: false });
        draftsStore.createIndex('patientId', 'patientId', { unique: false });
        draftsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Pending clinical actions store (queued while offline)
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
        pendingStore.createIndex('status', 'status', { unique: false });
        pendingStore.createIndex('category', 'category', { unique: false });
        pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 3. Offline encounters store
      if (!db.objectStoreNames.contains(ENCOUNTERS_STORE)) {
        const encStore = db.createObjectStore(ENCOUNTERS_STORE, { keyPath: 'id' });
        encStore.createIndex('patientId', 'patientId', { unique: false });
        encStore.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open ClinixVault IndexedDB'));
    };
  });

  return dbInitPromise;
}

// -----------------------------------------------------------------------------
// DRAFTS MANAGEMENT
// -----------------------------------------------------------------------------

/**
 * Save or update an in-flight clinical draft (e.g. SOAP note, radiology findings).
 */
export async function saveDraft(
  category: CachedDraft['category'],
  patientId: string,
  title: string,
  data: any,
  encounterId?: string
): Promise<void> {
  const id = `${category}_${patientId}`;
  const draft: CachedDraft = {
    id,
    category,
    patientId,
    encounterId,
    title,
    data,
    updatedAt: Date.now(),
  };

  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.put(draft);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('clinixvault:draft_saved', { detail: { id, category, patientId } })
      );
    }
  } catch (err) {
    console.warn('[OfflineDB] Fallback: storing draft in localStorage', err);
    try {
      localStorage.setItem(`cv_draft_${id}`, JSON.stringify(draft));
    } catch {}
  }
}

/**
 * Retrieve a saved draft by category and patient ID.
 */
export async function getDraft(
  category: CachedDraft['category'],
  patientId: string
): Promise<CachedDraft | null> {
  const id = `${category}_${patientId}`;
  try {
    const db = await getOfflineDB();
    return await new Promise<CachedDraft | null>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const raw = localStorage.getItem(`cv_draft_${id}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return null;
  }
}

/**
 * Delete a saved draft after it has been finalized / committed.
 */
export async function deleteDraft(category: CachedDraft['category'], patientId: string): Promise<void> {
  const id = `${category}_${patientId}`;
  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
  try {
    localStorage.removeItem(`cv_draft_${id}`);
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('clinixvault:draft_deleted', { detail: { id, category, patientId } })
    );
  }
}

/**
 * List all saved drafts across all patients.
 */
export async function getAllDrafts(category?: CachedDraft['category']): Promise<CachedDraft[]> {
  try {
    const db = await getOfflineDB();
    return await new Promise<CachedDraft[]>((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const results: CachedDraft[] = req.result || [];
        if (category) {
          resolve(results.filter((d) => d.category === category));
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const drafts: CachedDraft[] = [];
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('cv_draft_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const item: CachedDraft = JSON.parse(raw);
              if (!category || item.category === category) {
                drafts.push(item);
              }
            }
          }
        }
      }
      return drafts;
    } catch {
      return [];
    }
  }
}

// -----------------------------------------------------------------------------
// PENDING REPORTS / ACTIONS (OFFLINE QUEUE)
// -----------------------------------------------------------------------------

/**
 * Queue a clinical report / action to be synchronized when backend comes back online.
 */
export async function queuePendingAction(
  category: PendingReportAction['category'],
  patientId: string,
  title: string,
  payload: any
): Promise<PendingReportAction> {
  const item: PendingReportAction = {
    id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    category,
    patientId,
    title,
    payload,
    status: 'pending',
    createdAt: Date.now(),
    retryCount: 0,
  };

  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Fallback: queueing action in localStorage', err);
    try {
      const queueKey = 'cv_pending_queue';
      const existing = JSON.parse(localStorage.getItem(queueKey) || '[]');
      existing.push(item);
      localStorage.setItem(queueKey, JSON.stringify(existing));
    } catch {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('clinixvault:pending_queued', { detail: item }));
  }

  return item;
}

/**
 * Retrieve all pending or failed synchronization actions.
 */
export async function getPendingActions(): Promise<PendingReportAction[]> {
  try {
    const db = await getOfflineDB();
    return await new Promise<PendingReportAction[]>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readonly');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      return JSON.parse(localStorage.getItem('cv_pending_queue') || '[]');
    } catch {
      return [];
    }
  }
}

/**
 * Mark a pending action as synced, failed, or update retry count.
 */
export async function updatePendingActionStatus(
  id: string,
  status: PendingReportAction['status'],
  error?: string
): Promise<void> {
  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item: PendingReportAction = getReq.result;
        if (!item) return resolve();
        item.status = status;
        if (error) item.error = error;
        if (status === 'synced') item.syncedAt = Date.now();
        if (status === 'failed') item.retryCount = (item.retryCount || 0) + 1;
        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {}

  try {
    const queueKey = 'cv_pending_queue';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(queueKey) : null;
    if (raw) {
      const items: PendingReportAction[] = JSON.parse(raw);
      const target = items.find((i) => i.id === id);
      if (target) {
        target.status = status;
        if (error) target.error = error;
        if (status === 'synced') target.syncedAt = Date.now();
        if (status === 'failed') target.retryCount = (target.retryCount || 0) + 1;
        localStorage.setItem(queueKey, JSON.stringify(items));
      }
    }
  } catch {}
}

/**
 * Remove a successfully synchronized action from the queue.
 */
export async function removePendingAction(id: string): Promise<void> {
  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}

  try {
    const queueKey = 'cv_pending_queue';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(queueKey) : null;
    if (raw) {
      const items: PendingReportAction[] = JSON.parse(raw);
      const remaining = items.filter((i) => i.id !== id);
      localStorage.setItem(queueKey, JSON.stringify(remaining));
    }
  } catch {}
}

// -----------------------------------------------------------------------------
// OFFLINE ENCOUNTERS
// -----------------------------------------------------------------------------

/**
 * Save an offline patient encounter.
 */
export async function saveOfflineEncounter(enc: OfflineEncounter): Promise<void> {
  try {
    const db = await getOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ENCOUNTERS_STORE, 'readwrite');
      const store = tx.objectStore(ENCOUNTERS_STORE);
      const req = store.put(enc);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[OfflineDB] Error saving encounter to IndexedDB:', e);
  }

  try {
    const encKey = 'cv_offline_encounters';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(encKey) : null;
    const encounters: OfflineEncounter[] = raw ? JSON.parse(raw) : [];
    const idx = encounters.findIndex((e) => e.id === enc.id || e.patientId === enc.patientId);
    if (idx >= 0) {
      encounters[idx] = enc;
    } else {
      encounters.push(enc);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(encKey, JSON.stringify(encounters));
    }
  } catch {}
}

/**
 * Retrieve all offline encounters.
 */
export async function getOfflineEncounters(): Promise<OfflineEncounter[]> {
  try {
    const db = await getOfflineDB();
    return await new Promise<OfflineEncounter[]>((resolve, reject) => {
      const tx = db.transaction(ENCOUNTERS_STORE, 'readonly');
      const store = tx.objectStore(ENCOUNTERS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('cv_offline_encounters') || '[]');
      }
      return [];
    } catch {
      return [];
    }
  }
}

// -----------------------------------------------------------------------------
// CACHE TELEMETRY & AUTO-SYNC ENGINE
// -----------------------------------------------------------------------------

export interface CacheTelemetry {
  draftsCount: number;
  pendingCount: number;
  offlineEncountersCount: number;
  lastSyncedAt: number | null;
  isSyncing: boolean;
}

let isSyncInProgress = false;

/**
 * Retrieve cache statistics for the UI telemetry pill / modal.
 */
export async function getCacheTelemetry(): Promise<CacheTelemetry> {
  const drafts = await getAllDrafts();
  const pending = await getPendingActions();
  const encounters = await getOfflineEncounters();
  const lastSyncStr = typeof window !== 'undefined' ? localStorage.getItem('cv_last_synced_at') : null;
  const lastSyncedAt = lastSyncStr ? parseInt(lastSyncStr, 10) : null;

  return {
    draftsCount: drafts.length,
    pendingCount: pending.filter((p) => p.status === 'pending' || p.status === 'failed').length,
    offlineEncountersCount: encounters.filter((e) => !e.synced).length,
    lastSyncedAt,
    isSyncing: isSyncInProgress,
  };
}

/**
 * Flushes all pending reports, actions, and encounters to the backend.
 * Called automatically upon network/backend reconnection or manually by the clinician.
 */
export async function syncPendingActions(clinixApi: any): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  if (isSyncInProgress) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  isSyncInProgress = true;
  let succeeded = 0;
  let failed = 0;

  try {
    const pending = await getPendingActions();
    const itemsToSync = pending.filter((p) => p.status === 'pending' || p.status === 'failed');

    for (const item of itemsToSync) {
      await updatePendingActionStatus(item.id, 'syncing');
      try {
        if (item.category === 'soap') {
          // Commit in-flight SOAP note or summarize
          if (item.payload.dialogue) {
            await clinixApi.synthesizeSoap(
              item.payload.dialogue,
              item.patientId,
              item.payload.modelName || 'qwen2.5-coder:1.5b'
            );
          }
        } else if (item.category === 'radiology') {
          // Commit radiology analysis using correct clinixApi method
          if (item.payload.imageBase64 || item.payload.clinicalIndication) {
            await clinixApi.analyzeRadiologyImage({
              patientId: item.patientId,
              imageBase64: item.payload.imageBase64,
              clinicalIndication: item.payload.clinicalIndication,
              projection: item.payload.projection,
            });
          }
        } else if (item.category === 'encounter') {
          // Sync offline encounter
          if (item.payload.firstName || item.payload.patientName) {
            const first = item.payload.firstName || item.payload.patientName?.split(' ')[0] || 'Patient';
            const last = item.payload.lastName || item.payload.patientName?.split(' ')[1] || 'Offline';
            const mrn = item.payload.mrn;
            await clinixApi.createPatient({
              first_name: first,
              last_name: last,
              dob: item.payload.dob || '1980-01-01',
              gender: item.payload.gender || 'unknown',
              mrn: mrn,
              chief_complaint: item.payload.chiefComplaint || 'Offline consultation',
              exam_room: item.payload.examRoom || 'Room 1',
            });

            // Mark matching record in offline_encounters store as synced to prevent double creation
            const allEnc = await getOfflineEncounters();
            const matching = allEnc.find((e) => e.patientId === item.patientId || e.id === item.patientId || (mrn && e.mrn === mrn));
            if (matching && !matching.synced) {
              matching.synced = true;
              await saveOfflineEncounter(matching);
            }
          }
        } else if (item.category === 'summary') {
          if (item.payload.clinicalText) {
            await clinixApi.summarizeClinicalText(
              item.payload.clinicalText,
              item.payload.summaryType || 'discharge',
              item.payload.modelName
            );
          }
        }

        await updatePendingActionStatus(item.id, 'synced');
        // Delete synced action after successful sync
        await removePendingAction(item.id);
        succeeded++;
      } catch (err: any) {
        console.warn(`[OfflineDB] Failed to sync item ${item.id}:`, err);
        await updatePendingActionStatus(item.id, 'failed', err?.message || 'Sync failed');
        failed++;
      }
    }

    // Sync any standalone offline encounters not covered by pending actions
    const encounters = await getOfflineEncounters();
    const unsyncedEncounters = encounters.filter((e) => !e.synced);
    for (const enc of unsyncedEncounters) {
      try {
        const [first, ...rest] = (enc.patientName || 'Patient').split(' ');
        await clinixApi.createPatient({
          first_name: first || 'Patient',
          last_name: rest.join(' ') || 'Offline',
          dob: enc.dob || '1980-01-01',
          gender: 'unknown',
          mrn: enc.mrn,
          chief_complaint: enc.chiefComplaint,
          exam_room: enc.examRoom,
        });
        enc.synced = true;
        await saveOfflineEncounter(enc);
        succeeded++;
      } catch (err) {
        console.warn('[OfflineDB] Could not sync offline encounter:', err);
        failed++;
      }
    }

    if (succeeded > 0 && typeof window !== 'undefined') {
      localStorage.setItem('cv_last_synced_at', String(Date.now()));
      window.dispatchEvent(
        new CustomEvent('clinixvault:cache_synced', {
          detail: { succeeded, failed, total: itemsToSync.length + unsyncedEncounters.length },
        })
      );
    }

    return {
      total: itemsToSync.length + unsyncedEncounters.length,
      succeeded,
      failed,
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Setup event listeners for auto-sync on network online & backend recovery events.
 */
export function setupAutoSync(clinixApi: any): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnlineOrRecovered = () => {
    void syncPendingActions(clinixApi);
  };

  window.addEventListener('online', handleOnlineOrRecovered);
  window.addEventListener('clinixvault:backend_recovered', handleOnlineOrRecovered);
  window.addEventListener('clinixvault:node_failover', handleOnlineOrRecovered);
  window.addEventListener('clinixvault:failover_event', handleOnlineOrRecovered);
  window.addEventListener('clinixvault:colab_recovered', handleOnlineOrRecovered);
  window.addEventListener('clinixvault:backend_changed', handleOnlineOrRecovered);

  // Initial attempt if network is currently online
  if (navigator.onLine) {
    setTimeout(() => {
      void syncPendingActions(clinixApi);
    }, 1500);
  }

  return () => {
    window.removeEventListener('online', handleOnlineOrRecovered);
    window.removeEventListener('clinixvault:backend_recovered', handleOnlineOrRecovered);
    window.removeEventListener('clinixvault:node_failover', handleOnlineOrRecovered);
    window.removeEventListener('clinixvault:failover_event', handleOnlineOrRecovered);
    window.removeEventListener('clinixvault:colab_recovered', handleOnlineOrRecovered);
    window.removeEventListener('clinixvault:backend_changed', handleOnlineOrRecovered);
  };
}
