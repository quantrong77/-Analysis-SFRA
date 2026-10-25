import { useState } from "react";
import { Packer } from "docx";
import { LevelBadge } from "../components/common";
import type { PairResult } from "../core/analysis";
import type { TransformerGroup } from "../core/pairing";
import { transformerConclusion } from "../core/rules";
import type { Standards } from "../core/standards";
import { buildReport, fileName } from "../report/docxBuilder";
import { INFO_FIELDS, type ReportInfo } from "../report/info";
import type { RowResult } from "../workspace";

interface Props {
  std: Standards;
  group: TransformerGroup;
  results: RowResult[];
  info: ReportInfo;
  onInfo: (info: ReportInfo) => void;
  onReset: () => void;
}

export default function ReportView({ std, group, results, info, onInfo, onReset }: Props) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ok = results.flatMap((r) => (r.result ? [r.result] : []));
  const skipped = results.filter((r) => !r.result).map((r) => ({ label: `${r.row.index ?? ""} ${r.row.label}`.trim(), reason: r.error ?? "" }));
  const conclusion = ok.length ? transformerConclusion(ok, std) : null;
  const name = fileName(info, std);

  const exportDocx = async () => {
    if (!conclusion) return;
    setError(null);
    try {
      setProgress("Đang vẽ giản đồ…");
      const { renderPairImages } = await import("../report/images");
      const key = (r: PairResult) => `${r.index ?? ""}|${r.label}`;
      const images = await renderPairImages(ok, std, key, (d, t) => setProgress(`Đang vẽ giản đồ ${d}/${t}…`));
      setProgress("Đang tạo file Word…");
      const doc = buildReport({ std, info, results: ok, skipped, conclusion, images, imageKey: key, generatedAt: new Date() });
      const blob = await Packer.toBlob(doc);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setProgress(null);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  };

  return (
    <div className="view">
      <div className="row between wrap">
        <div>
          <h1>Báo cáo Word</h1>
          <div className="muted">
            MBA {group.key} · {ok.length} phép đo · Baseline {info.baselineDate} → Lần đo {info.testDate}
          </div>
        </div>
        <div className="row gap wrap">
          {conclusion && <LevelBadge c={conclusion.worst} />}
          <button className="primary" disabled={!conclusion || progress !== null} onClick={exportDocx}>
            Xuất {name}
          </button>
        </div>
      </div>
      {progress && <p className="muted">{progress}</p>}
      {error && <p className="err">Lỗi khi tạo báo cáo: {error}</p>}

      <section className="panel">
        <div className="row between wrap">
          <h2>Thông tin chung</h2>
          <button className="link" onClick={onReset}>
            Lấy lại từ file đo
          </button>
        </div>
        <p className="muted small">
          Điền sẵn từ metadata trong file đo; ô trống là thông tin file không có. Sửa trước khi xuất báo cáo.
        </p>
        <div className="form-grid">
          {INFO_FIELDS.map((f) => (
            <label key={f.key} className={f.wide ? "field wide" : "field"}>
              <span>{f.label}</span>
              <input
                value={String(info[f.key])}
                onChange={(e) => onInfo({ ...info, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={info.decimalComma} onChange={(e) => onInfo({ ...info, decimalComma: e.target.checked })} />
            Dấu thập phân kiểu Việt Nam (dấu phẩy)
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Bố cục báo cáo</h2>
        <ol className="outline">
          <li>Tiêu đề: {(std.report.title_template as string).replace("{name}", info.name || "–").replace("{substation}", info.substation || "–")}</li>
          <li>Thông tin chung (bảng trên)</li>
          <li>Phương pháp: công thức DL/T 911 Phụ lục A, dải tần, Bảng A.1, chế độ căn lưới, phiên bản bộ quy tắc {std.versionTag}</li>
          <li>Bảng tổng hợp {ok.length} phép đo và nhận xét</li>
          <li>Chi tiết từng phép đo: giản đồ Bode biên độ và góc pha, bảng tính trung gian, cảnh báo</li>
          <li>Kết luận: MBA / Ngày thí nghiệm / Đánh giá / Hành động</li>
          <li>Tài liệu tham khảo</li>
        </ol>
        {conclusion && (
          <>
            <h3>Nhận xét sẽ in trong báo cáo</h3>
            <p>{conclusion.text}</p>
          </>
        )}
        {skipped.length > 0 && <p className="note">Không đưa vào báo cáo: {skipped.map((s) => s.label).join(", ")}.</p>}
        <p className="muted small">
          Font {std.report.font} {std.report.font_size_pt} pt (bảng {std.report.table_font_size_pt} pt), khổ A4, số liệu {std.report.decimals} chữ số
          thập phân. Mỗi phép đo kèm tóm tắt dịch đỉnh cộng hưởng và bảng các đỉnh/hố cần chú ý.
        </p>
      </section>
    </div>
  );
}
