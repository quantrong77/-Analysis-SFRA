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
  /** Transformer groups the backup holds; absent in a backup of the whole browser storage */
  groups?: string[];
  files: { sha256: string; name: string; path: string; size: number; addedAt: string }[];
  workspace: WorkspaceState;
}

export async function makeBackup(files: StoredFile[], workspace: WorkspaceState, rulesetVersion: string, groups?: string[]): Promise<Blob> {
  const zip = new JSZip();
  const manifest: Manifest = {
    format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), rulesetVersion, workspace, ...(groups ? { groups } : {}),
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
    measurementEdits: { ...cur.measurementEdits, ...inc.measurementEdits },
    traceColors: { ...cur.traceColors, ...inc.traceColors },
    fileRoles: { ...cur.fileRoles, ...inc.fileRoles },
    customRules: inc.customRules ?? cur.customRules,
  };
}

/**
 * The part of the workspace that belongs to some groups: edits of their files and traces, their
 * session choices and report information. Column mappings travel along (files may need them);
 * an edited ruleset does not, so importing a group never changes the other session's rules.
 */
export function workspaceFor(ws: WorkspaceState, groupKeys: string[], shas: Set<string>): WorkspaceState {
  const ofFile = (traceId: string) => shas.has(traceId.split("#")[0]);
  const pick = <T,>(rec: Record<string, T>, keep: (k: string) => boolean) => Object.fromEntries(Object.entries(rec).filter(([k]) => keep(k)));
  const keys = new Set(groupKeys);
  return {
    ...emptyWorkspace(),
    dateEdits: pick(ws.dateEdits, ofFile),
    hidden: ws.hidden.filter(ofFile),
    infoEdits: pick(ws.infoEdits, (k) => keys.has(k)),
    sessions: pick(ws.sessions, (k) => keys.has(k)),
    mode: ws.mode,
    profiles: ws.profiles,
    txEdits: pick(ws.txEdits, (k) => shas.has(k)),
    measurementEdits: pick(ws.measurementEdits, ofFile),
    traceColors: pick(ws.traceColors, ofFile),
    fileRoles: pick(ws.fileRoles, (k) => shas.has(k)),
    customRules: null,
  };
}

/** Workspace without the edits of the given files and groups (after a group is deleted). */
export function workspaceWithout(ws: WorkspaceState, groupKeys: string[], shas: Set<string>): WorkspaceState {
  const mine = workspaceFor(ws, groupKeys, shas);
  const drop = <T,>(rec: Record<string, T>, gone: Record<string, unknown>) => Object.fromEntries(Object.entries(rec).filter(([k]) => !(k in gone)));
  return {
    ...ws,
    dateEdits: drop(ws.dateEdits, mine.dateEdits),
    hidden: ws.hidden.filter((h) => !mine.hidden.includes(h)),
    infoEdits: drop(ws.infoEdits, mine.infoEdits),
    sessions: drop(ws.sessions, mine.sessions),
    txEdits: drop(ws.txEdits, mine.txEdits),
    measurementEdits: drop(ws.measurementEdits, mine.measurementEdits),
    traceColors: drop(ws.traceColors, mine.traceColors),
    fileRoles: drop(ws.fileRoles, mine.fileRoles),
  };
}
