/** A group saved as a package holds only its own files and edits, and opens again unchanged. */
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { makeBackup, readBackup, workspaceFor, workspaceWithout } from "../src/storage/backup";
import { emptyWorkspace, type StoredFile, type WorkspaceState } from "../src/storage/db";

const file = (sha: string): StoredFile => ({ sha256: sha, name: `${sha}.csv`, bytes: new TextEncoder().encode(sha), size: 3, addedAt: "2026-01-01" });

const ws: WorkspaceState = {
  ...emptyWorkspace(),
  dateEdits: { "a1#0": "2019-11-16T07:38:00.000Z", "b1#0": "2020-01-01T00:00:00.000Z" },
  hidden: ["a2#1", "b1#2"],
  infoEdits: { A: { name: "Máy A" }, B: { name: "Máy B" } },
  sessions: { A: { baselineSession: "2019-11-16", testSession: "2026-05-26" }, B: { baselineSession: "x", testSession: "y" } },
  txEdits: { a1: "A", b1: "B" },
  measurementEdits: { "a2#0": { index: 1, label: "A-a", shorted: "" }, "b1#0": { index: 2, label: "B-b", shorted: "" } },
  customRules: "ruleset: {}",
};

it("gói một nhóm chỉ chứa file và chỉnh sửa của nhóm, không mang bộ quy tắc", () => {
  const mine = workspaceFor(ws, ["A"], new Set(["a1", "a2"]));
  expect(Object.keys(mine.dateEdits)).toEqual(["a1#0"]);
  expect(mine.hidden).toEqual(["a2#1"]);
  expect(Object.keys(mine.infoEdits)).toEqual(["A"]);
  expect(Object.keys(mine.sessions)).toEqual(["A"]);
  expect(mine.txEdits).toEqual({ a1: "A" });
  expect(Object.keys(mine.measurementEdits)).toEqual(["a2#0"]);
  expect(mine.customRules).toBeNull();
});

it("xóa nhóm bỏ chỉnh sửa của nhóm, giữ của nhóm khác", () => {
  const rest = workspaceWithout(ws, ["A"], new Set(["a1", "a2"]));
  expect(Object.keys(rest.dateEdits)).toEqual(["b1#0"]);
  expect(rest.hidden).toEqual(["b1#2"]);
  expect(Object.keys(rest.sessions)).toEqual(["B"]);
  expect(rest.txEdits).toEqual({ b1: "B" });
  expect(rest.customRules).toBe("ruleset: {}");
});

it("lưu rồi mở lại gói nhóm: đủ file và chỉnh sửa", async () => {
  const mine = workspaceFor(ws, ["A"], new Set(["a1", "a2"]));
  const blob = await makeBackup([file("a1"), file("a2")], mine, "1.0.0", ["A"]);
  const back = await readBackup(new Uint8Array(await blob.arrayBuffer()));
  expect(back.files.map((f) => f.sha256)).toEqual(["a1", "a2"]);
  expect(new TextDecoder().decode(back.files[1].bytes)).toBe("a2");
  expect(back.workspace.txEdits).toEqual({ a1: "A" });
  expect(back.workspace.measurementEdits["a2#0"].label).toBe("A-a");
});
