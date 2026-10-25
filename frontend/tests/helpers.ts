/**
 * Test data lives OUTSIDE the repository (device information is never committed):
 * measurement files in backend/tests/golden, $SFRA_GOLDEN_DIR or <project>/data/csv, and the
 * expected values in $SFRA_EXPECTED or <project>/data/golden_expected.json. Tests skip when absent.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFile } from "../src/core/parsers";
import { groupTraces } from "../src/core/pairing";
import { loadStandards, type Standards } from "../src/core/standards";
import type { Trace } from "../src/core/types";

const HERE = __dirname;
const PROJECT = resolve(HERE, "../../..");
const GOLDEN_FILE = /^\d+_.+\.(csv|sfra)$/i;

const hasGolden = (d: string, ext: string) => existsSync(d) && readdirSync(d).some((f) => GOLDEN_FILE.test(f) && f.endsWith(ext));

export const GOLDEN_DIR =
  [resolve(HERE, "../../backend/tests/golden"), process.env.SFRA_GOLDEN_DIR ?? "", join(PROJECT, "data/csv")]
    .filter(Boolean)
    .find((d) => hasGolden(d, ".csv")) ?? null;
export const SFRA_DIR = [join(PROJECT, "data/csv")].find((d) => hasGolden(d, ".sfra")) ?? null;
export const DATA_DIR = join(PROJECT, "data/csv");
export const VENDOR_DIR = [join(PROJECT, "file_vendor")].find((d) => existsSync(d)) ?? null;

const EXPECTED_PATH = process.env.SFRA_EXPECTED ?? join(PROJECT, "data/golden_expected.json");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXPECTED: any = existsSync(EXPECTED_PATH) ? JSON.parse(readFileSync(EXPECTED_PATH, "utf-8")) : null;
export const HAVE_GOLDEN = Boolean(GOLDEN_DIR && EXPECTED);

export const std: Promise<Standards> = loadStandards(
  readFileSync(resolve(HERE, "../../backend/app/config/standards.yaml"), "utf-8"),
);

/** Parse the golden files of a folder (STT_PhepDo_date_time names only). */
export async function parseDir(dir: string, ext: string): Promise<Trace[]> {
  const s = await std;
  const out: Trace[] = [];
  for (const f of readdirSync(dir).filter((n) => GOLDEN_FILE.test(n) && n.endsWith(ext)).sort()) {
    out.push(...(await parseFile(new Uint8Array(readFileSync(join(dir, f))), f, s)));
  }
  return out;
}

/** Golden traces with the oldest session (baseline) and newest session, and the pair of a given STT. */
export async function goldenSet(ext = ".csv") {
  const traces = await parseDir(ext === ".csv" ? GOLDEN_DIR! : SFRA_DIR!, ext);
  const [g] = groupTraces(traces);
  const byId = new Map(traces.map((t) => [t.id, t]));
  const pair = (stt: number) => {
    const row = g.rows.find((r) => r.index === stt)!;
    return { baseline: byId.get(row.baselineId!)!, test: byId.get(row.testId!)! };
  };
  return { traces, group: g, byId, baselineSession: g.sessions[0], testSession: g.sessions[g.sessions.length - 1], pair };
}

export async function parseText(text: string, name: string): Promise<Trace[]> {
  return parseFile(new TextEncoder().encode(text), name, await std);
}
