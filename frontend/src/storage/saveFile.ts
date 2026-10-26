/**
 * Saving files to a folder the user picks. Chromium browsers (Chrome, Edge) offer a save dialog
 * and a folder picker; elsewhere the file goes to the browser's download folder.
 */

interface Writable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FileHandle {
  createWritable: () => Promise<Writable>;
}
interface DirHandle {
  name: string;
  getFileHandle: (name: string, opts: { create: boolean }) => Promise<FileHandle>;
}
type Picker = {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
  showDirectoryPicker?: (opts?: unknown) => Promise<DirHandle>;
};

const ZIP_TYPE = [{ description: "Gói dữ liệu SFRA Analyzer", accept: { "application/zip": [".zip"] } }];

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const cancelled = (e: unknown) => (e as Error)?.name === "AbortError";

/** Ask where to save one file; false when the user cancelled. */
export async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  const w = window as unknown as Picker;
  if (!w.showSaveFilePicker) {
    downloadBlob(blob, name);
    return true;
  }
  try {
    const handle = await w.showSaveFilePicker({ suggestedName: name, types: ZIP_TYPE });
    const out = await handle.createWritable();
    await out.write(blob);
    await out.close();
    return true;
  } catch (e) {
    if (cancelled(e)) return false;
    throw e;
  }
}

export const canPickFolder = (): boolean => typeof (window as unknown as Picker).showDirectoryPicker === "function";

/** Ask for a folder and write every file into it; returns the folder name, or null when cancelled. */
export async function saveToFolder(files: { name: string; blob: () => Promise<Blob> }[]): Promise<string | null> {
  const w = window as unknown as Picker;
  if (!w.showDirectoryPicker) throw new Error("Trình duyệt không hỗ trợ chọn thư mục");
  let dir: DirHandle;
  try {
    dir = await w.showDirectoryPicker({ mode: "readwrite" });
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
  for (const f of files) {
    const out = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
    await out.write(await f.blob());
    await out.close();
  }
  return dir.name;
}

/** A transformer key made safe for a file name. */
export const fileSafe = (s: string): string => s.trim().replace(/[\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "nhom";
