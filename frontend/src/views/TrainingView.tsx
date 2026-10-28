/** Training: theory, transfer-function lab, measurement setups, fault simulator, exercises and their authoring. */
import { useState } from "react";
import type { CsvProfile } from "../core/parsers";
import type { GridMode } from "../core/resample";
import type { Standards } from "../core/standards";
import { TRAINING } from "../core/training/content";
import AuthorTab from "./training/AuthorTab";
import ExerciseTab from "./training/ExerciseTab";
import SetupTab from "./training/SetupTab";
import SimulatorTab from "./training/SimulatorTab";
import TheoryTab from "./training/TheoryTab";
import TransferLab from "./training/TransferLab";

const TABS = [
  { id: "theory", label: "Lý thuyết" },
  { id: "lab", label: "Lab hàm truyền" },
  { id: "setup", label: "Cấu hình đo" },
  { id: "sim", label: "Giả lập hư hỏng" },
  { id: "exercise", label: "Bài tập" },
  { id: "author", label: "Soạn bài" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function TrainingView({ std, mode, profiles }: { std: Standards; mode: GridMode; profiles: CsvProfile[] }) {
  const [tab, setTab] = useState<Tab>("theory");
  return (
    <div className="view">
      <header className="view-head">
        <h1>{TRAINING.meta.title}</h1>
        <p className="lede">{TRAINING.meta.note}</p>
      </header>
      <div className="tabs" role="tablist" aria-label="Phần huấn luyện">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`ttab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tpanel-${t.id}`}
            className={tab === t.id ? "tab on" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section className="tab-panel" role="tabpanel" id={`tpanel-${tab}`} aria-labelledby={`ttab-${tab}`}>
        {tab === "theory" && <TheoryTab std={std} onOpenLab={() => setTab("lab")} />}
        {tab === "lab" && <TransferLab />}
        {tab === "setup" && <SetupTab />}
        {tab === "sim" && <SimulatorTab std={std} />}
        {/* exercise and authoring keep their state while switching between the other tabs */}
        <div hidden={tab !== "exercise"}>
          <ExerciseTab std={std} mode={mode} profiles={profiles} />
        </div>
        <div hidden={tab !== "author"}>
          <AuthorTab std={std} mode={mode} profiles={profiles} />
        </div>
      </section>
    </div>
  );
}
