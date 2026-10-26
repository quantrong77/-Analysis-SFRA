import { useState } from "react";
import { UNKNOWN_DAY } from "../core/pairing";
import type { Trace } from "../core/types";
import { sessionLabel } from "../workspace";

/** dateSource of a measurement time entered by the user */
export const USER_DATE = "Người dùng nhập";

// <input type="datetime-local"> works in local time: "YYYY-MM-DDTHH:mm"
const pad = (n: number) => String(n).padStart(2, "0");
export const toLocalInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
export const fromLocalInput = (v: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null;
};
/** A session day ("2019-11-16") as a date, keeping the time of day of `keep` when given. */
export const onSessionDay = (s: string, keep: Date | null) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, keep?.getHours() ?? 0, keep?.getMinutes() ?? 0);
};

/** Date and time of one measurement file; a hand-entered time can be restored to the file's. */
export function DateTimeInput({ t, onSet }: { t: Trace; onSet: (d: Date | null) => void }) {
  return (
    <>
      <input
        key={toLocalInput(t.testDate)}
        type="datetime-local"
        aria-label={`Thời điểm đo ${t.sourceName}`}
        defaultValue={toLocalInput(t.testDate)}
        onBlur={(e) => {
          const d = fromLocalInput(e.target.value);
          if (d && d.getTime() !== t.testDate?.getTime()) onSet(d);
        }}
      />
      {t.dateSource === USER_DATE && (
        <button type="button" className="link date-restore" onClick={() => onSet(null)}>
          Khôi phục
        </button>
      )}
    </>
  );
}

/**
 * Move a whole session (baseline or test) to another day: every file of the session keeps its
 * time of day. Used when the instrument wrote a wrong date for all files of a visit.
 */
export function SessionDateEdit({ session, files, onSetDate }: {
  session: string;
  files: Trace[];
  onSetDate: (edits: [string, Date | null][]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(session === UNKNOWN_DAY ? "" : session);
  const edited = files.filter((t) => t.dateSource === USER_DATE);
  if (!files.length) return null;
  return (
    <span className="session-date">
      {open ? (
        <form
          className="session-date-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
            onSetDate(files.map((t) => [t.id, onSessionDay(day, t.testDate)]));
            setOpen(false);
          }}
        >
          <input type="date" aria-label={`Ngày đo mới cho kỳ ${sessionLabel(session)}`} value={day} onChange={(e) => setDay(e.target.value)} />
          <button type="submit" disabled={!day || day === session}>
            Áp dụng cho {files.length} file
          </button>
          <button type="button" className="link" onClick={() => setOpen(false)}>
            Hủy
          </button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Sửa ngày
        </button>
      )}
      {!open && edited.length > 0 && (
        <button type="button" className="link" onClick={() => onSetDate(edited.map((t) => [t.id, null]))}>
          Khôi phục ngày trong file
        </button>
      )}
    </span>
  );
}
