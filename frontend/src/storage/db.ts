/**
 * Browser storage (IndexedDB) for the measurement history (spec 3.3, stage 4).
 * The original files are stored with their SHA-256 and re-parsed on start-up, so the
 * file stays the source of truth; only the user's edits are stored besides it.
 */
import type { MeasurementId } from "../core/pairing";
import type { CsvProfile } from "../core/parsers/genericCsv";
import type { GridMode } from "../core/resample";
import type { ReportInfo } from "../report/info";

export interface StoredFile {
  sha256: string;
  name: string;
  bytes: Uint8Array;
  size: number;
  addedAt: string;
}

export interface WorkspaceState {
  /** trace id -> ISO date-time entered by the user */
  dateEdits: Record<string, string>;
  /** trace ids removed by the user from a multi-sweep file */
  hidden: string[];
  /** transformer key -> report information edits */
  infoEdits: Record<string, Partial<ReportInfo>>;
  /** transformer key -> chosen sessions */
  sessions: Record<string, { baselineSession: string; testSession: string }>;
  mode: GridMode;
  /** saved column mappings for generic CSV files (spec 4.2) */
  profiles: CsvProfile[];
  /** file sha256 -> transformer key entered by the user (files without serial number) */
  txEdits: Record<string, string>;
  /** trace id -> STT, label and shorted terminals entered by the user so the trace pairs correctly */
  measurementEdits: Record<string, MeasurementId>;
  /** file sha256 -> frame the file was loaded in (baseline or test) */
  fileRoles: Record<string, "baseline" | "test">;
  /** trace id -> curve colour (#rrggbb) chosen by the user */
  traceColors: Record<string, string>;
  /** user-edited standards.yaml text; null = built-in ruleset */
  customRules: string | null;
}

export const emptyWorkspace = (): WorkspaceState => ({
  dateEdits: {}, hidden: [], infoEdits: {}, sessions: {}, mode: "auto", profiles: [], txEdits: {}, measurementEdits: {}, fileRoles: {}, traceColors: {}, customRules: null,
});

const DB_NAME = "sfra-analyzer";
const DB_VERSION = 1;
const FILES = "files";
const META = "meta";
const WS_KEY = "workspace";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Giao dịch IndexedDB bị hủy"));
  });
}

export class SfraStore {
  private constructor(private db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<SfraStore> {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "sha256" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    return new SfraStore(await req(r));
  }

  async putFiles(files: StoredFile[]): Promise<void> {
    const tx = this.db.transaction(FILES, "readwrite");
    const s = tx.objectStore(FILES);
    for (const f of files) s.put(f);
    await done(tx);
  }

  async listFiles(): Promise<StoredFile[]> {
    const tx = this.db.transaction(FILES, "readonly");
    const all = await req(tx.objectStore(FILES).getAll() as IDBRequest<StoredFile[]>);
    // stored as ArrayBuffer-backed views; normalise to Uint8Array
    return all.map((f) => ({ ...f, bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes as ArrayBufferLike) }));
  }

  async deleteFile(sha256: string): Promise<void> {
    const tx = this.db.transaction(FILES, "readwrite");
    tx.objectStore(FILES).delete(sha256);
    await done(tx);
  }

  async loadWorkspace(): Promise<WorkspaceState> {
    const tx = this.db.transaction(META, "readonly");
    const ws = (await req(tx.objectStore(META).get(WS_KEY))) as WorkspaceState | undefined;
    return { ...emptyWorkspace(), ...(ws ?? {}) };
  }

  async saveWorkspace(ws: WorkspaceState): Promise<void> {
    const tx = this.db.transaction(META, "readwrite");
    tx.objectStore(META).put(ws, WS_KEY);
    await done(tx);
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction([FILES, META], "readwrite");
    tx.objectStore(FILES).clear();
    tx.objectStore(META).clear();
    await done(tx);
  }

  close(): void {
    this.db.close();
  }
}

/** Ask the browser not to evict the data under storage pressure (best effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
