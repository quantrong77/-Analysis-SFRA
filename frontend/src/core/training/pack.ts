/**
 * Training pack: a .zip the instructor builds in the app from measurement files and hands to the
 * trainees. It holds the original files (so they are parsed exactly as in the analysis screens) and
 * training.json with the cases and their answers. Packs stay on the user's computer: measurement
 * data never goes into the repository.
 */
import JSZip from "jszip";

export const PACK_FORMAT = "sfra-training-pack";
export const PACK_VERSION = 1;

export interface CaseAnswer {
  /** failure mode id (training.yaml faults) */
  fault: string;
  /** answer band ids (training.yaml bands) */
  bands: string[];
  /** recommendation id (training.yaml recommendations) */
  recommendation: string;
}

export interface TrainingCase {
  id: string;
  title: string;
  /** transformer data shown to the trainee: rating, type, history of operation */
  transformer: string;
  history: string;
  /** what the trainee is asked to compare, e.g. "Pha A trước và sau sự cố ngắn mạch ngoài" */
  task: string;
  /** trace ids (sha256#k) of the reference curve and of the curve to evaluate */
  refId: string;
  testId: string;
  answer: CaseAnswer;
  /** ask for the frequency of the resonance that moved most (scored against the app's peak matching) */
  askMeasure: boolean;
  explanation: string;
}

export interface PackFile {
  sha256: string;
  name: string;
  bytes: Uint8Array;
}

export interface TrainingPack {
  title: string;
  author: string;
  createdAt: string;
  cases: TrainingCase[];
  /** score weights; missing keys fall back to training.yaml */
  weights?: Partial<{ fault: number; bands: number; measure: number; recommendation: number }>;
  files: PackFile[];
}

interface Manifest extends Omit<TrainingPack, "files"> {
  format: string;
  version: number;
  files: { sha256: string; name: string; path: string }[];
}

export async function writePack(pack: TrainingPack): Promise<Blob> {
  const zip = new JSZip();
  // only the files the cases use
  const used = new Set(pack.cases.flatMap((c) => [c.refId, c.testId].map((id) => id.split("#")[0])));
  const files = pack.files.filter((f) => used.has(f.sha256));
  const { files: _drop, ...rest } = pack;
  const manifest: Manifest = {
    ...rest,
    format: PACK_FORMAT,
    version: PACK_VERSION,
    files: files.map((f) => ({ sha256: f.sha256, name: f.name, path: `files/${f.sha256.slice(0, 12)}_${f.name}` })),
  };
  manifest.files.forEach((m, i) => zip.file(m.path, files[i].bytes));
  zip.file("training.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readPack(data: Blob | Uint8Array | ArrayBuffer): Promise<TrainingPack> {
  const zip = await JSZip.loadAsync(data);
  const mf = zip.file("training.json");
  if (!mf) throw new Error("Không phải gói bài tập SFRA (thiếu training.json)");
  const m = JSON.parse(await mf.async("string")) as Manifest;
  if (m.format !== PACK_FORMAT) throw new Error("Không phải gói bài tập SFRA");
  if (m.version > PACK_VERSION) throw new Error(`Gói bài tập phiên bản ${m.version}, app chỉ đọc được tới phiên bản ${PACK_VERSION}`);
  const files: PackFile[] = [];
  for (const f of m.files) {
    const entry = zip.file(f.path);
    if (!entry) throw new Error(`Gói bài tập thiếu ${f.path}`);
    files.push({ sha256: f.sha256, name: f.name, bytes: await entry.async("uint8array") });
  }
  const { format: _f, version: _v, files: _m, ...rest } = m;
  return { ...rest, files };
}

export const newCaseId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
