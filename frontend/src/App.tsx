import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { transformerConclusion } from "./core/rules";
import { NeedsMappingError, parseFile, type CsvProfile } from "./core/parsers";
import ErrorBoundary from "./components/ErrorBoundary";
import type { PendingMapping } from "./components/CsvMapping";
import { signatureOf } from "./core/parsers/genericCsv";
import { measurementIdOf, sameMeasurementId, withMeasurementId, type TransformerGroup } from "./core/pairing";
import type { GridMode } from "./core/resample";
import { loadStandards, sha256Hex, validateStandards, type Standards } from "./core/standards";
import { classify } from "./core/dlt911";
import type { Classification } from "./core/dlt911";
import type { Trace } from "./core/types";
import DetailView from "./views/DetailView";
import ImportView from "./views/ImportView";
import OverviewView from "./views/OverviewView";
import ResultsView from "./views/ResultsView";
import ReportView from "./views/ReportView";
import StandardsView from "./views/StandardsView";
import TrendView from "./views/TrendView";
import CompareView from "./views/CompareView";
import { defaultInfo, type ReportInfo } from "./report/info";
import { makeBackup, mergeWorkspace, readBackup, workspaceFor, workspaceWithout } from "./storage/backup";
import { canPickFolder, fileSafe, saveBlob, saveToFolder } from "./storage/saveFile";
import { emptyWorkspace, requestPersistence, SfraStore, type StoredFile, type WorkspaceState } from "./storage/db";
import { computeResults, regroup, setSessions, type LoadError } from "./workspace";
import Nameplate from "./components/Nameplate";
import { BrandMark, ICONS } from "./components/Icons";

type View = "overview" | "import" | "results" | "detail" | "trend" | "compare" | "report" | "standards";

const NAV: { id: View; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "import", label: "Nhập dữ liệu" },
  { id: "results", label: "Kết quả kỳ đo" },
  { id: "detail", label: "Chi tiết phép đo" },
  { id: "trend", label: "Xu hướng" },
  { id: "compare", label: "So sánh tham khảo" },
  { id: "report", label: "Báo cáo" },
  { id: "standards", label: "Cấu hình" },
];

/** Exercise a ruleset on fixed values so an edited YAML that cannot run is rejected before use. */
function probeStandards(s: Standards) {
  for (const v of [[0.3, 2, 2], [0.8, 2, 2], [1.5, 2, 2], [2.5, 1.5, 1], [2.5, 1.5, 0.3]]) {
    const c = classify({ LF: v[0], MF: v[1], HF: v[2] }, s);
    if (!(c.id in s.actions.by_level)) throw new Error(`Thiếu hành động cho mức "${c.id}"`);
  }
}

export interface StorageStatus {
  ok: boolean;
  message: string;
  fileCount: number;
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default function App() {
  const [std, setStd] = useState<Standards | null>(null);
  const [parsed, setParsed] = useState<Trace[]>([]);
  const [ws, setWs] = useState<WorkspaceState>(emptyWorkspace());
  const [groups, setGroups] = useState<TransformerGroup[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  // outcome of the last save / import / delete, shown on the import screen
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingMapping[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [rowKey, setRowKey] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageStatus>({ ok: false, message: "Đang mở bộ nhớ trình duyệt…", fileCount: 0 });
  const store = useRef<SfraStore | null>(null);
  const mode = ws.mode;

  const parseStored = useCallback(async (files: StoredFile[], s: Standards, profiles: CsvProfile[]) => {
    const out: Trace[] = [];
    const errs: LoadError[] = [];
    const maps: PendingMapping[] = [];
    for (const f of files) {
      try {
        out.push(...(await parseFile(f.bytes, f.name, s, profiles)));
      } catch (e) {
        if (e instanceof NeedsMappingError) maps.push({ filename: f.name, bytes: f.bytes, sniff: e.sniff });
        else errs.push({ file: f.name, message: (e as Error).message });
      }
    }
    return { out, errs, maps };
  }, []);

  // start-up: stored workspace, rules (custom if saved), then stored files
  useEffect(() => {
    (async () => {
      let s: Standards;
      try {
        s = await loadStandards();
      } catch (e) {
        setErrors([{ file: "standards.yaml", message: String(e) }]);
        return;
      }
      try {
        const st = await SfraStore.open();
        store.current = st;
        const [files, w] = await Promise.all([st.listFiles(), st.loadWorkspace()]);
        const startErrs: LoadError[] = [];
        if (w.customRules) {
          const v = await validateStandards(w.customRules, probeStandards);
          if (v.std) s = v.std;
          else startErrs.push({ file: "Bộ quy tắc tùy chỉnh", message: `Không dùng được, quay về bộ quy tắc mặc định: ${v.problems.join("; ")}` });
        }
        setStd(s);
        const { out, errs, maps } = await parseStored(files, s, w.profiles);
        errs.unshift(...startErrs);
        setParsed(out);
        setPending(maps);
        setWs(w);
        setErrors(errs);
        const persisted = await requestPersistence();
        setStorage({
          ok: true, fileCount: files.length,
          message: persisted ? "Dữ liệu lưu trong trình duyệt (đã yêu cầu lưu lâu dài)." : "Dữ liệu lưu trong trình duyệt.",
        });
      } catch (e) {
        setStd(s);
        setStorage({ ok: false, fileCount: 0, message: `Không dùng được bộ nhớ trình duyệt (${(e as Error).message}). Dữ liệu chỉ giữ đến khi tải lại trang.` });
      }
      setReady(true);
    })();
  }, [parseStored]);

  // a new screen or measurement starts at the top
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view, rowKey]);

  // persist workspace edits
  useEffect(() => {
    if (ready && store.current) void store.current.saveWorkspace(ws).catch(() => undefined);
  }, [ws, ready]);

  const traces = useMemo(() => {
    const hidden = new Set(ws.hidden);
    return parsed
      .filter((t) => !hidden.has(t.id))
      .map((t) => (ws.dateEdits[t.id] ? { ...t, testDate: new Date(ws.dateEdits[t.id]), dateSource: "Người dùng nhập" } : t))
      .map((t) => (ws.measurementEdits[t.id] ? withMeasurementId(t, ws.measurementEdits[t.id]) : t))
      .map((t) => {
        const key = ws.txEdits[t.sha256];
        // an edited serial number replaces the one read from the file everywhere (grouping, nameplate, report)
        return key ? { ...t, transformerKey: key, serialNumber: key, transformerKeyOriginal: t.transformerKey } : t;
      });
  }, [parsed, ws.hidden, ws.dateEdits, ws.txEdits, ws.measurementEdits]);

  // regroup when traces change; first time, seed with the stored session choices
  useEffect(() => {
    setGroups((prev) => {
      const seed: TransformerGroup[] = prev.length
        ? prev
        : Object.entries(ws.sessions).map(([key, s]) => ({ key, serialNumber: "", locations: [], sessions: [], rows: [], ...s }));
      return regroup(traces, seed);
    });
    // ws.sessions is only a seed; later choices flow from groups into ws below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces]);

  // keep the stored session choices in sync with the groups
  useEffect(() => {
    if (!ready) return;
    const sessions = Object.fromEntries(groups.map((g) => [g.key, { baselineSession: g.baselineSession, testSession: g.testSession }]));
    if (JSON.stringify(sessions) !== JSON.stringify(ws.sessions)) setWs((w) => ({ ...w, sessions }));
  }, [groups, ready, ws.sessions]);

  const addStoredFiles = useCallback(
    async (files: StoredFile[]) => {
      if (!std) return [];
      const known = new Set(parsed.map((t) => t.sha256));
      const fresh = files.filter((f) => !known.has(f.sha256));
      const { out, errs, maps } = await parseStored(fresh, std, ws.profiles);
      setPending((prev) => [...prev.filter((x) => !maps.some((m) => m.filename === x.filename)), ...maps]);
      const okSha = new Set(out.map((t) => t.sha256));
      const toStore = fresh.filter((f) => okSha.has(f.sha256));
      if (store.current && toStore.length) {
        try {
          await store.current.putFiles(toStore);
        } catch (e) {
          errs.push({ file: "(bộ nhớ trình duyệt)", message: `Không lưu được: ${(e as Error).message}` });
        }
      }
      setParsed((prev) => [...prev, ...out]);
      setStorage((s) => ({ ...s, fileCount: s.fileCount + toStore.length }));
      return errs;
    },
    [std, parsed, parseStored, ws.profiles],
  );

  // the user mapped the columns of a CSV: save the profile, read every pending file with the same header
  const onMap = useCallback(
    async (profile: CsvProfile, item: PendingMapping) => {
      if (!std) return;
      const same = pending.filter(
        (x) => x === item || (signatureOf(x.sniff.headers) === profile.signature && x.sniff.delimiter === profile.delimiter),
      );
      const stored: StoredFile[] = [];
      const out: Trace[] = [];
      const errs: LoadError[] = [];
      for (const x of same) {
        try {
          out.push(...(await parseFile(x.bytes, x.filename, std, [], profile)));
          stored.push({ sha256: out[out.length - 1].sha256, name: x.filename, bytes: x.bytes, size: x.bytes.length, addedAt: new Date().toISOString() });
        } catch (e) {
          errs.push({ file: x.filename, message: (e as Error).message });
        }
      }
      if (store.current && stored.length) await store.current.putFiles(stored).catch(() => undefined);
      setWs((w) => ({ ...w, profiles: [...w.profiles, profile] }));
      setParsed((prev) => [...prev, ...out.filter((t) => !prev.some((q) => q.id === t.id))]);
      setPending((prev) => prev.filter((x) => !same.includes(x)));
      setStorage((s) => ({ ...s, fileCount: s.fileCount + stored.length }));
      setErrors(errs);
    },
    [std, pending],
  );

  /** Read files; with `groupKey` they all go to that transformer group (a new one or an existing one). */
  const onFiles = useCallback(
    async (files: File[], groupKey?: string) => {
      setBusy(true);
      const stored: StoredFile[] = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        stored.push({ sha256: await sha256Hex(bytes), name: f.name, bytes, size: bytes.length, addedAt: new Date().toISOString() });
      }
      setErrors(await addStoredFiles(stored));
      const key = groupKey?.trim();
      if (key) {
        setWs((w) => ({ ...w, txEdits: { ...w.txEdits, ...Object.fromEntries(stored.map((f) => [f.sha256, key])) } }));
        setActiveGroup(key);
        setNotice(`Đã thêm ${stored.length} file vào nhóm ${key}.`);
      }
      setBusy(false);
    },
    [addStoredFiles],
  );

  const onRemove = useCallback(
    async (id: string) => {
      const sha = id.split("#")[0];
      const sameFile = parsed.filter((t) => t.sha256 === sha && !ws.hidden.includes(t.id));
      if (sameFile.length <= 1) {
        await store.current?.deleteFile(sha).catch(() => undefined);
        setParsed((p) => p.filter((t) => t.sha256 !== sha));
        setWs((w) => ({ ...w, hidden: w.hidden.filter((h) => !h.startsWith(`${sha}#`)) }));
        setStorage((s) => ({ ...s, fileCount: Math.max(0, s.fileCount - 1) }));
      } else {
        setWs((w) => ({ ...w, hidden: [...w.hidden, id] }));
      }
    },
    [parsed, ws.hidden],
  );

  const onClear = useCallback(async () => {
    if (!window.confirm("Xóa toàn bộ file đo và chỉnh sửa đã lưu trong trình duyệt này?")) return;
    await store.current?.clear().catch(() => undefined);
    setParsed([]);
    setPending([]);
    setGroups([]);
    setWs(emptyWorkspace());
    setErrors([]);
    setRowKey(null);
    setStorage((s) => ({ ...s, fileCount: 0 }));
  }, []);

  const onBackup = useCallback(async () => {
    if (!store.current || !std) return;
    const files = await store.current.listFiles();
    const blob = await makeBackup(files, ws, std.versionTag);
    const d = new Date();
    download(blob, `SFRA_saoluu_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.zip`);
  }, [ws, std]);

  const onRestore = useCallback(
    async (packages: File[]) => {
      setBusy(true);
      const errs: LoadError[] = [];
      let fileCount = 0;
      let opened = 0;
      for (const file of packages) {
        try {
          const { files, workspace } = await readBackup(file);
          errs.push(...(await addStoredFiles(files)));
          setWs((w) => mergeWorkspace(w, workspace));
          fileCount += files.length;
          opened++;
        } catch (e) {
          errs.push({ file: file.name, message: (e as Error).message });
        }
      }
      setGroups([]); // regroup with the restored session choices
      setErrors(errs);
      setNotice(opened ? `Đã nhập ${opened} gói dữ liệu, ${fileCount} file đo.` : "");
      setBusy(false);
    },
    [addStoredFiles],
  );

  const filesOfGroup = useCallback(
    (key: string) => new Set(traces.filter((t) => t.transformerKey === key).map((t) => t.sha256)),
    [traces],
  );

  /** One package (.zip) with the files and edits of some groups, in the backup format, so it can be imported again. */
  const groupPackage = useCallback(
    async (keys: string[]) => {
      if (!store.current || !std) throw new Error("Bộ nhớ trình duyệt chưa sẵn sàng");
      const shas = new Set(keys.flatMap((k) => [...filesOfGroup(k)]));
      const files = (await store.current.listFiles()).filter((f) => shas.has(f.sha256));
      return makeBackup(files, workspaceFor(ws, keys, shas), std.versionTag, keys);
    },
    [filesOfGroup, ws, std],
  );

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const onSaveGroup = useCallback(
    async (key: string) => {
      setBusy(true);
      try {
        const name = `SFRA_${fileSafe(key)}_${today()}.zip`;
        if (await saveBlob(await groupPackage([key]), name)) setNotice(`Đã lưu nhóm ${key} vào ${name}.`);
      } catch (e) {
        setErrors([{ file: key, message: `Không lưu được: ${(e as Error).message}` }]);
      }
      setBusy(false);
    },
    [groupPackage],
  );

  /** Every group: one package per group in a folder the user picks, or one package of all groups. */
  const onSaveAll = useCallback(async () => {
    const keys = groups.map((g) => g.key);
    if (!keys.length) return;
    setBusy(true);
    try {
      if (canPickFolder()) {
        const dir = await saveToFolder(keys.map((k) => ({ name: `SFRA_${fileSafe(k)}_${today()}.zip`, blob: () => groupPackage([k]) })));
        if (dir) setNotice(`Đã lưu ${keys.length} nhóm vào thư mục ${dir}, mỗi nhóm một file .zip.`);
      } else {
        const name = `SFRA_tat_ca_nhom_${today()}.zip`;
        if (await saveBlob(await groupPackage(keys), name)) setNotice(`Đã lưu ${keys.length} nhóm vào ${name}.`);
      }
    } catch (e) {
      setErrors([{ file: "Lưu tất cả nhóm", message: `Không lưu được: ${(e as Error).message}` }]);
    }
    setBusy(false);
  }, [groups, groupPackage]);

  const onDeleteGroup = useCallback(
    async (key: string) => {
      const shas = filesOfGroup(key);
      if (!window.confirm(`Xóa nhóm ${key} cùng ${shas.size} file đo và các chỉnh sửa của nhóm khỏi trình duyệt này? Nên lưu nhóm trước khi xóa.`)) return;
      for (const sha of shas) await store.current?.deleteFile(sha).catch(() => undefined);
      setParsed((prev) => prev.filter((t) => !shas.has(t.sha256)));
      setWs((w) => workspaceWithout(w, [key], shas));
      setStorage((s) => ({ ...s, fileCount: Math.max(0, s.fileCount - shas.size) }));
      if (activeGroup === key) setActiveGroup(null);
      setNotice(`Đã xóa nhóm ${key}.`);
    },
    [filesOfGroup, activeGroup],
  );

  /** Measurement times entered by the user, per trace; null restores the time read from the file. */
  const setDates = useCallback(
    (edits: [string, Date | null][]) =>
      setWs((w) => {
        const dates = { ...w.dateEdits };
        for (const [id, d] of edits) {
          if (d) dates[id] = d.toISOString();
          else delete dates[id];
        }
        return { ...w, dateEdits: dates };
      }),
    [],
  );

  const byId = useMemo(() => new Map(traces.map((t) => [t.id, t])), [traces]);
  // Groups are rebuilt in an effect after the traces change, one render later. Until then, drop
  // files that are no longer loaded (just removed) so no screen looks up a file that is gone.
  const live = useMemo(
    () =>
      groups
        .filter((g) => traces.some((t) => t.transformerKey === g.key))
        .map((g) => ({
          ...g,
          rows: g.rows
            .map((r) => ({
              ...r,
              candidates: r.candidates.filter((id) => byId.has(id)),
              baselineId: r.baselineId && byId.has(r.baselineId) ? r.baselineId : null,
              testId: r.testId && byId.has(r.testId) ? r.testId : null,
            }))
            .filter((r) => r.candidates.length > 0),
        })),
    [groups, traces, byId],
  );
  const group = live.find((g) => g.key === activeGroup) ?? live[0] ?? null;
  const results = useMemo(() => (std && group ? computeResults(group, byId, std, mode) : []), [std, group, byId, mode]);
  const worst = useMemo(() => {
    const out: Record<string, Classification | null> = {};
    if (!std) return out;
    for (const g of live) {
      const ok = computeResults(g, byId, std, mode).flatMap((r) => (r.result ? [r.result] : []));
      out[g.key] = ok.length ? transformerConclusion(ok, std).worst : null;
    }
    return out;
  }, [live, byId, std, mode]);
  const traceCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of traces) out[t.transformerKey] = (out[t.transformerKey] ?? 0) + 1;
    return out;
  }, [traces]);

  const firstOk = results.find((r) => r.result)?.row.key ?? null;
  const currentRow = rowKey && results.some((r) => r.row.key === rowKey && r.result) ? rowKey : firstOk;

  if (!std || !ready) {
    return <div className="boot">{errors.length && !std ? `Lỗi nạp bộ quy tắc: ${errors[0].message}` : "Đang nạp dữ liệu…"}</div>;
  }

  const needsResults = (v: View) => v === "results" || v === "detail" || v === "report";
  const disabled = (v: View) => (needsResults(v) && !results.some((r) => r.result)) || ((v === "trend" || v === "compare") && !live.length);
  // dates typed into the report before they followed the sessions are ignored: the sessions decide
  const info = group
    ? (({ baselineDate: _b, testDate: _t, ...edits }) => ({ ...defaultInfo(group, traces, std), ...edits }))(ws.infoEdits[group.key] ?? {})
    : null;
  const setMode = (m: GridMode) => setWs((w) => ({ ...w, mode: m }));

  const plateViews: View[] = ["results", "detail", "trend", "compare", "report"];
  const showPlate = Boolean(group && info && plateViews.includes(view));

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">SFRA Analyzer</div>
            <div className="brand-sub">Biến dạng cuộn dây MBA</div>
          </div>
        </div>
        <nav className="nav-list" aria-label="Chức năng">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-item on" : "nav-item"}
              aria-current={view === n.id ? "page" : undefined}
              disabled={disabled(n.id)}
              onClick={() => setView(n.id)}
            >
              {ICONS[n.id]}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        {live.length > 0 && (
          <label className="rail-tx">
            <span>Máy biến áp</span>
            <select value={group?.key} onChange={(e) => setActiveGroup(e.target.value)}>
              {live.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.key}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="rail-foot">
          <span className={storage.ok ? "dot ok" : "dot off"} aria-hidden />
          {storage.ok ? `${storage.fileCount} file đo lưu trong trình duyệt` : "Chưa lưu được vào trình duyệt"}
          <div>Bộ quy tắc {std.versionTag}</div>
        </div>
      </aside>

      <main className="main">
        {/* a new screen starts without the error of the previous one */}
        <ErrorBoundary key={view} onHome={() => setView("overview")}>
        {showPlate && group && info && (
          <Nameplate
            group={group}
            name={info.name}
            manufacturer={info.manufacturer}
            year={info.year}
            worst={worst[group.key] ?? null}
            mode={mode}
            onMode={setMode}
            onSessions={(b, t) => setGroups((gs) => gs.map((g) => (g.key === group.key ? setSessions(g, traces, b, t) : g)))}
          />
        )}
        {view === "overview" && (
          <OverviewView
            std={std}
            groups={live}
            traces={traces}
            worst={worst}
            traceCount={traceCount}
            mode={mode}
            storage={storage}
            busy={busy}
            errors={errors}
            onImport={() => setView("import")}
            onOpen={(k) => {
              setActiveGroup(k);
              setView("results");
            }}
            onTrend={(k) => {
              setActiveGroup(k);
              setView("trend");
            }}
            onBackup={onBackup}
            onRestore={onRestore}
          />
        )}
        {view === "import" && (
          <ImportView
            std={std}
            traces={traces}
            groups={live}
            errors={errors}
            busy={busy}
            onFiles={onFiles}
            onGroups={setGroups}
            onSetDate={(ids, d) => setDates(ids.map((id) => [id, d]))}
            onSetDates={setDates}
            onRemove={onRemove}
            onClear={onClear}
            pending={pending}
            onMap={onMap}
            onSkipPending={(item) => setPending((prev) => prev.filter((x) => x !== item))}
            onSetMeasurement={(id, m) => {
              const original = parsed.find((t) => t.id === id);
              setWs((w) => {
                const edits = { ...w.measurementEdits };
                // null, or back to what the file says: drop the edit
                if (m && original && !sameMeasurementId(m, measurementIdOf(original))) edits[id] = m;
                else delete edits[id];
                return { ...w, measurementEdits: edits };
              });
            }}
            onSetTransformer={(shas, key, from) => {
              const original = new Map(parsed.map((t) => [t.sha256, t.transformerKey]));
              setWs((w) => {
                const tx = { ...w.txEdits };
                for (const sha of shas) {
                  // empty, or back to the value in the file: drop the edit
                  if (key.trim() && key.trim() !== original.get(sha)) tx[sha] = key.trim();
                  else delete tx[sha];
                }
                return { ...w, txEdits: tx };
              });
              if (from && activeGroup === from) setActiveGroup(key.trim() || null);
            }}
            onAnalyze={(k) => {
              setActiveGroup(k);
              setView("results");
            }}
            onCompare={(k) => {
              setActiveGroup(k);
              setView("compare");
            }}
            onSaveGroup={onSaveGroup}
            onSaveAll={onSaveAll}
            onDeleteGroup={onDeleteGroup}
            onRestore={onRestore}
            notice={notice}
            onPlot={(k, row) => {
              setActiveGroup(k);
              setRowKey(row);
              setView("detail");
            }}
          />
        )}
        {view === "results" && group && (
          <ResultsView
            std={std}
            group={group}
            results={results}
            onOpen={(k) => {
              setRowKey(k);
              setView("detail");
            }}
            onCompare={() => setView("compare")}
          />
        )}
        {view === "detail" && group && currentRow && (
          <DetailView
            std={std}
            group={group}
            results={results}
            rowKey={currentRow}
            traces={traces}
            onSelect={setRowKey}
            onSetDates={setDates}
            onPick={(rowKey, field, id) =>
              setGroups((gs) =>
                gs.map((g) => (g.key === group.key ? { ...g, rows: g.rows.map((x) => (x.key === rowKey ? { ...x, [field]: id } : x)) } : g)),
              )
            }
          />
        )}
        {view === "trend" && group && (
          <TrendView std={std} group={group} traces={traces} mode={mode} />
        )}
        {view === "compare" && group && <CompareView std={std} group={group} traces={traces} mode={mode} />}
        {view === "report" && group && info && (
          <ReportView
            std={std}
            group={group}
            results={results}
            info={info}
            onInfo={(next) => {
              const base = defaultInfo(group, traces, std);
              const diff = Object.fromEntries(Object.entries(next).filter(([k, v]) => base[k as keyof ReportInfo] !== v));
              setWs((w) => ({ ...w, infoEdits: { ...w.infoEdits, [group.key]: diff } }));
            }}
            onReset={() => setWs((w) => ({ ...w, infoEdits: { ...w.infoEdits, [group.key]: {} } }))}
          />
        )}
        {view === "standards" && (
          <StandardsView
            std={std}
            profiles={ws.profiles}
            onDeleteProfile={(id) => setWs((w) => ({ ...w, profiles: w.profiles.filter((p) => p.id !== id) }))}
            onSaveRules={async (text) => {
              const v = await validateStandards(text, probeStandards);
              if (v.std) {
                setStd(v.std);
                setWs((w) => ({ ...w, customRules: text }));
              }
              return v.problems;
            }}
            onResetRules={async () => {
              setStd(await loadStandards());
              setWs((w) => ({ ...w, customRules: null }));
            }}
          />
        )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
