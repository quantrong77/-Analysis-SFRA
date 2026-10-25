/** Backup / restore of the browser storage as a .zip (original files + workspace.json). */
import JSZip from "jszip";
import { emptyWorkspace, type StoredFile, type WorkspaceState } from "./db";

const FORMAT = "sfra-analyzer-backup";
const VERSION = 1;

interface Manifest {
  format: string;
  version: number;
  createdAt: string;
  rulesetVersion: string;
  files: { sha256: string; name: string; path: string; size: number; addedAt: string }[];
  workspace: WorkspaceState;
}

export async function makeBackup(files: StoredFile[], workspace: WorkspaceState, rulesetVersion: string): Promise<Blob> {
  const zip = new JSZip();
  const manifest: Manifest = {
    format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), rulesetVersion, workspace,
    files: files.map((f) => ({
      sha256: f.sha256, name: f.name, size: f.size, addedAt: f.addedAt,
      path: `files/${f.sha256.slice(0, 12)}_${f.name}`,
    })),
  };
  manifest.files.forEach((m, i) => zip.file(m.path, files[i].bytes));
  zip.file("workspace.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readBackup(data: Blob | Uint8Array | ArrayBuffer): Promise<{ files: StoredFile[]; workspace: WorkspaceState }> {
  const zip = await JSZip.loadAsync(data);
  const mf = zip.file("workspace.json");
  if (!mf) throw new Error("Không phải file sao lưu SFRA Analyzer (thiếu workspace.json)");
  const manifest = JSON.parse(await mf.async("string")) as Manifest;
  if (manifest.format !== FORMAT) throw new Error("Không phải file sao lưu SFRA Analyzer");
  const files: StoredFile[] = [];
  for (const m of manifest.files) {
    const entry = zip.file(m.path);
    if (!entry) throw new Error(`File sao lưu thiếu ${m.path}`);
    files.push({ sha256: m.sha256, name: m.name, size: m.size, addedAt: m.addedAt, bytes: await entry.async("uint8array") });
  }
  return { files, workspace: { ...emptyWorkspace(), ...manifest.workspace } };
}

/** Merge a restored workspace into the current one (restored values win). */
export function mergeWorkspace(cur: WorkspaceState, inc: WorkspaceState): WorkspaceState {
  return {
    dateEdits: { ...cur.dateEdits, ...inc.dateEdits },
    hidden: [...new Set([...cur.hidden, ...inc.hidden])],
    infoEdits: { ...cur.infoEdits, ...inc.infoEdits },
    sessions: { ...cur.sessions, ...inc.sessions },
    mode: inc.mode ?? cur.mode,
    profiles: [...cur.profiles.filter((p) => !inc.profiles.some((q) => q.id === p.id)), ...inc.profiles],
    txEdits: { ...cur.txEdits, ...inc.txEdits },
    customRules: inc.customRules ?? cur.customRules,
  };
}
