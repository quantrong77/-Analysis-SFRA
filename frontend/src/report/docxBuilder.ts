/**
 * Word report (spec 8). Every number comes from the computed results; every sentence of
 * assessment comes from the templates in standards.yaml (via transformerConclusion).
 */
import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, PageNumber, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import type { PairResult } from "../core/analysis";
import { peakStatusLabel } from "../core/peaks";
import { fmtHz } from "../core/quality";
import type { Conclusion } from "../core/rules";
import type { Standards } from "../core/standards";
import { INFO_FIELDS, type ReportInfo } from "./info";

export interface PairImages {
  magnitude: Uint8Array;
  phase: Uint8Array;
  /** pixel size of the PNG */
  width: number;
  height: number;
}

export interface ReportInput {
  std: Standards;
  info: ReportInfo;
  results: PairResult[];
  /** Rows that could not be computed (missing file, grid mismatch …) */
  skipped: { label: string; reason: string }[];
  conclusion: Conclusion;
  images: Map<string, PairImages>;
  /** key of each result in `images` */
  imageKey: (r: PairResult) => string;
  generatedAt: Date;
}

const LEVEL_COLOR: Record<string, string> = {
  normal: "15803D", slight: "A16207", obvious: "C2410C", severe: "B91C1C", review: "6D28D9", insufficient: "4B5563",
};

// A4 portrait, margins: top/bottom 2 cm, left 3 cm, right 2 cm (twips; 1 cm = 567)
const PAGE = { width: 11906, height: 16838 };
const MARGIN = { top: 1134, bottom: 1134, left: 1701, right: 1134 };
/** usable width in pixels at 96 dpi for images: (11906 − 1701 − 1134) twips / 15 */
const CONTENT_PX = Math.floor((PAGE.width - MARGIN.left - MARGIN.right) / 15);

export function fileName(info: ReportInfo, std: Standards): string {
  const date = info.testDate.replace(/[/\\:*?"<>|\s]+/g, "-");
  const name = (info.name || "MBA").replace(/[/\\:*?"<>|\s]+/g, "_");
  return (std.report.file_name_template as string).replace("{name}", name).replace("{date}", date);
}

export function buildReport(input: ReportInput): Document {
  const { std, info, results, conclusion } = input;
  const font = std.report.font as string;
  const body = (std.report.font_size_pt as number) * 2;
  const small = (std.report.table_font_size_pt as number) * 2;
  const dec = std.report.decimals as number;
  const num = (v: number | null | undefined, d = dec) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "–";
    const s = v.toFixed(d);
    return info.decimalComma ? s.replace(".", ",") : s;
  };
  const hz = (f: number) => (info.decimalComma ? fmtHz(f) : fmtHz(f).replace(",", "."));

  const p = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; color?: string } = {}) =>
    new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 80 },
      children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size, color: opts.color })],
    });
  const h1 = (text: string) => new Paragraph({ heading: "Heading1", children: [new TextRun(text)] });
  const h2 = (text: string, pageBreak = false) =>
    new Paragraph({ heading: "Heading2", pageBreakBefore: pageBreak, children: [new TextRun(text)] });

  const cell = (text: string, o: { bold?: boolean; header?: boolean; align?: "left" | "right" | "center"; color?: string; width?: number } = {}) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
      shading: o.header ? { fill: "E5E7EB", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: text.split("\n").map((line) =>
        new Paragraph({
          spacing: { after: 0 },
          alignment: o.align === "right" ? AlignmentType.RIGHT : o.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line, bold: o.bold || o.header, size: small, color: o.color })],
        }),
      ),
    });
  const table = (header: string[], rows: (string | TableCell)[][], widths?: number[], aligns?: ("left" | "right" | "center")[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, { header: true, width: widths?.[i], align: aligns?.[i] })) }),
        ...rows.map((r) =>
          new TableRow({
            cantSplit: true,
            children: r.map((c, i) => (typeof c === "string" ? cell(c, { width: widths?.[i], align: aligns?.[i] }) : c)),
          }),
        ),
      ],
    });
  const levelCell = (r: PairResult) => cell(r.classification.label, { bold: true, color: LEVEL_COLOR[r.classification.id] });
  const warnText = (r: PairResult) => r.warnings.filter((w) => w.severity === "warning").map((w) => w.message).join("\n");

  const children: (Paragraph | Table)[] = [];

  // 1. Title
  const title = (std.report.title_template as string)
    .replace("{name}", info.name || "–")
    .replace("{substation}", info.substation || "–");
  children.push(
    p(title, { bold: true, size: 30, align: AlignmentType.CENTER, after: 60 }),
    p(`Baseline ${info.baselineDate || "–"} – Lần đo ${info.testDate || "–"}`, { align: AlignmentType.CENTER, italics: true, after: 60 }),
    p(info.organization, { align: AlignmentType.CENTER, after: 240 }),
  );

  // 2. General information
  children.push(h1("1. Thông tin chung"));
  const fields = INFO_FIELDS.filter((f) => !["organization", "notes"].includes(f.key));
  const infoRows: TableCell[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const a = fields[i];
    const b = fields[i + 1];
    infoRows.push([
      cell(a.label, { bold: true, width: 20 }), cell(String(info[a.key]) || "–", { width: 30 }),
      cell(b ? b.label : "", { bold: true, width: 20 }), cell(b ? String(info[b.key]) || "–" : "", { width: 30 }),
    ]);
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: infoRows.map((r) => new TableRow({ children: r })) }));
  if (info.notes) children.push(p(`Ghi chú: ${info.notes}`, { italics: true }));

  // 3. Method
  const d = std.dlt911;
  children.push(
    h1("2. Phương pháp"),
    p(`Hệ số tương quan Rxy giữa đường baseline X(k) và đường lần đo Y(k) (biên độ dB, k = 0…N−1) được tính theo ${d.source}:`),
    table(
      ["Bước", "Công thức", "Ý nghĩa"],
      [
        ["A.1", "Dx = (1/N)·Σ(X(k) − X̄)²;  Dy = (1/N)·Σ(Y(k) − Ȳ)²", "Phương sai của hai dãy"],
        ["A.2", "Cxy = (1/N)·Σ(X(k) − X̄)(Y(k) − Ȳ)", "Hiệp phương sai"],
        ["A.3", "LRxy = Cxy / √(Dx·Dy)", "Hệ số hiệp phương sai chuẩn hóa"],
        ["A.4", `Rxy = ${num(d.rxy_max, 0)} nếu 1 − LRxy < 10⁻¹⁰; Rxy = −log₁₀(1 − LRxy) trong các trường hợp khác`, "Hệ số tương quan"],
      ],
      [10, 55, 35],
    ),
    p(""),
    p("Dải tần và ngưỡng bình thường:"),
    table(
      ["Dải", "Điều kiện tần số", "Ngưỡng bình thường", "Căn cứ"],
      Object.entries(d.bands).map(([k, b]) => [
        `R${k}`, `${hz(b.f_min)} ${b.include_min ? "≤" : "<"} f ${b.include_max ? "≤" : "<"} ${hz(b.f_max)}`,
        `R${k} ≥ ${num(b.threshold, 1)}`, b.source,
      ]),
      [10, 35, 20, 35],
    ),
    p(""),
    p(`Phân loại mức độ biến dạng theo ${d.classification.source}; xét từ mức nặng đến nhẹ, gặp điều kiện đầu tiên thì dừng. Hành động gợi ý là ngưỡng nội bộ (cấu hình được).`),
    table(
      ["Mức độ", "Điều kiện", "Hành động gợi ý"],
      d.classification.levels.map((l) => [
        l.in_standard ? l.label : `${l.label}*`,
        (l.any ?? [])
          .map((cl) => Object.entries(cl).map(([k, c]) => Object.entries(c).map(([op, v]) => `${k} ${{ lt: "<", le: "≤", gt: ">", ge: "≥" }[op]} ${num(v, 1)}`).join(" và ")).join(" và "))
          .join(" hoặc "),
        std.actions.by_level[l.id] ?? "",
      ]),
      [28, 42, 30],
    ),
  );
  const outside = d.classification.levels.filter((l) => !l.in_standard);
  for (const l of outside) children.push(p(`* ${l.source}. ${l.note ?? ""}`, { italics: true, size: small }));
  const modes = [...new Set(results.map((r) => r.aligned.modeLabel))].join("; ");
  const counts = [...new Set(results.map((r) => Object.values(r.bands).map((b) => b.n).join("/")))];
  children.push(
    p(`Chế độ căn lưới tần số: ${modes}. Số điểm mỗi dải LF/MF/HF: ${counts.join("; ")}.`),
    p(`Bộ quy tắc: ${std.ruleset.id}, phiên bản ${std.versionTag} (${std.ruleset.date}).`),
    p(`Đỉnh cộng hưởng: ${std.peaks.method}, prominence ≥ ${num(std.peaks.prominence_db, 1)} dB; ghép đỉnh baseline với đỉnh lần đo gần nhất theo log10(f) trong cửa sổ ±${num(std.peaks.match_window_ratio * 100, 0)} %. Ngưỡng dịch tần ${std.peaks.shift_thresholds_percent.warning} % / ${std.peaks.shift_thresholds_percent.alarm} % là ngưỡng nội bộ (cấu hình được), không có trong tiêu chuẩn tham chiếu. Căn cứ định tính: ${std.peaks.qualitative_source}.`),
  );
  const notes = [...new Set(results.flatMap((r) => r.warnings.filter((w) => w.severity === "note").map((w) => w.message.replace(/ là [\d,.]+ (k?Hz|MHz)/, ""))))];
  for (const n of notes) children.push(p(`Lưu ý: ${n}`, { italics: true, size: small }));
  const fraxNotes = [...new Set(results.flatMap((r) => [...r.baseline.parseNotes, ...r.test.parseNotes]))];
  for (const n of fraxNotes) children.push(p(`Lưu ý: ${n}`, { italics: true, size: small }));

  // 4. Summary table
  children.push(
    h1("3. Bảng tổng hợp kết quả"),
    table(
      ["STT", "Phép đo", "Nhóm", "RLF", "RMF", "RHF", "Mức độ", "Hành động", "Ghi chú"],
      results.map((r) => [
        r.index !== null ? String(r.index) : "–", r.label, r.group.label,
        num(r.bands.LF?.rxy), num(r.bands.MF?.rxy), num(r.bands.HF?.rxy),
        levelCell(r), r.action, warnText(r),
      ]),
      [6, 11, 10, 8, 8, 8, 13, 18, 18],
      ["center", "left", "left", "right", "right", "right", "left", "left", "left"],
    ),
  );
  if (input.skipped.length) {
    children.push(p(`Không tính (thiếu cặp hoặc lỗi): ${input.skipped.map((s) => `${s.label} – ${s.reason}`).join("; ")}.`, { italics: true }));
  }
  children.push(p(""), p("Nhận xét:", { bold: true }), ...conclusion.sentences.map((s) => p(s)));

  // 5. Detail per measurement
  children.push(h1("4. Chi tiết từng phép đo"), p(`Gồm ${results.length} phép đo, mỗi phép đo một trang: giản đồ Bode biên độ và góc pha xếp chồng, bảng tính trung gian theo ${d.source}.`));
  results.forEach((r, i) => {
    children.push(
      // each measurement on its own page, so heading, charts and table stay together
      h2(`4.${i + 1}. Phép đo ${r.index ?? ""} – ${r.label} (${r.group.label})`, true),
      p(`Baseline: ${r.baseline.sourceName}. Lần đo: ${r.test.sourceName}.`, { size: small }),
      p(`Đầu đo baseline ${r.baseline.setting.redLead || "–"} → ${r.baseline.setting.blackLead || "–"}, lần đo ${r.test.setting.redLead || "–"} → ${r.test.setting.blackLead || "–"}; ${r.test.setting.measurementType || ""}${r.test.setting.shortedTerminal && r.test.setting.shortedTerminal !== "none" ? `, nối tắt ${r.test.setting.shortedTerminal}` : ""}.`, { size: small }),
    );
    const img = input.images.get(input.imageKey(r));
    if (img) {
      const h = Math.round((CONTENT_PX * img.height) / img.width);
      children.push(
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: img.magnitude, transformation: { width: CONTENT_PX, height: h } })] }),
        p(`Hình 4.${i + 1}a. Giản đồ Bode biên độ – phép đo ${r.index ?? ""} ${r.label} (baseline xanh liền, lần đo đỏ đứt)`, { italics: true, size: small, align: AlignmentType.CENTER }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: img.phase, transformation: { width: CONTENT_PX, height: h } })] }),
        p(`Hình 4.${i + 1}b. Giản đồ Bode góc pha – phép đo ${r.index ?? ""} ${r.label}`, { italics: true, size: small, align: AlignmentType.CENTER }),
      );
    }
    children.push(
      table(
        ["Dải", "N", "X̄ (dB)", "Ȳ (dB)", "Dx", "Dy", "Cxy", "LRxy", "Rxy", "Ngưỡng"],
        Object.values(r.bands).map((b) => [
          b.band, String(b.n), num(b.xMean, 4), num(b.yMean, 4), num(b.dx, 4), num(b.dy, 4), num(b.cxy, 4), num(b.lrxy, 6),
          cell(num(b.rxy, 4), { bold: true, align: "right", color: b.rxy !== null && b.rxy < b.threshold ? "B91C1C" : undefined }),
          `≥ ${num(b.threshold, 1)}`,
        ]),
        [7, 7, 11, 11, 10, 10, 10, 13, 10, 11],
        ["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"],
      ),
    );
    const level = new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({ text: "Mức độ: ", bold: true }),
        new TextRun({ text: r.classification.label, bold: true, color: LEVEL_COLOR[r.classification.id] }),
        new TextRun({ text: ` (${r.classification.source}). Hành động: ${r.action}.` }),
      ],
    });
    children.push(level);
    if (r.classification.note) children.push(p(r.classification.note, { italics: true, size: small }));

    // peak shifts (spec 6.4, 8.5): summary + notable rows inside the DL/T 911 range
    const pk = r.peaks;
    const paired = pk.matches.filter((m) => m.ref && m.test);
    const maxShift = paired.reduce((m, x) => (Math.abs(x.shiftPercent!) > Math.abs(m) ? x.shiftPercent! : m), 0);
    const notable = pk.matches.filter((m) => m.status !== "ok" && ["LF", "MF", "HF"].includes(m.band));
    children.push(p(
      `Đỉnh/hố cộng hưởng trong dải 1 kHz – 1 MHz: ${pk.matches.filter((m) => ["LF", "MF", "HF"].includes(m.band) && m.ref && m.test).length} cặp ghép được, dịch tần lớn nhất ${num(maxShift, 2)} % (toàn dải đo). ${notable.length ? `${notable.length} mục cần chú ý:` : `Không có đỉnh/hố dịch ≥ ${std.peaks.shift_thresholds_percent.warning} %, mất hoặc mới xuất hiện.`}`,
      { size: small },
    ));
    if (notable.length) {
      children.push(table(
        ["Loại", "Dải", "f baseline", "f lần đo", "Dịch tần (%)", "ΔdB", "Đánh giá (ngưỡng nội bộ)"],
        notable.map((m) => [
          m.kind === "peak" ? "Đỉnh" : "Hố", m.band, m.ref ? hz(m.ref.freq) : "–", m.test ? hz(m.test.freq) : "–",
          num(m.shiftPercent, 2), num(m.deltaDb, 2), peakStatusLabel(m.status, std),
        ]),
        [9, 8, 17, 17, 13, 10, 26],
        ["left", "left", "right", "right", "right", "right", "left"],
      ));
    }
    for (const w of r.warnings.filter((x) => x.severity === "warning")) children.push(p(`Cảnh báo: ${w.message} (${w.source}).`, { size: small, color: "9A3412" }));
  });

  // 6. Final summary: MBA / Ngày thí nghiệm / Đánh giá / Hành động
  children.push(
    h1("5. Kết luận"),
    table(
      ["MBA", "Ngày thí nghiệm", "Đánh giá", "Hành động"],
      [[
        `${info.name || "–"}${info.substation ? `\n${info.substation}` : ""}${info.serialNumber ? `\nSố chế tạo ${info.serialNumber}` : ""}`,
        `${info.testDate || "–"}\n(baseline ${info.baselineDate || "–"})`,
        conclusion.text,
        std.actions.by_level[conclusion.worst.id] ?? "",
      ]],
      [18, 16, 44, 22],
    ),
  );

  // 7. References
  children.push(h1("6. Tài liệu tham khảo"), ...(std.report.references as string[]).map((ref, i) => p(`[${i + 1}] ${ref}`)));

  const gen = input.generatedAt;
  const stamp = `${String(gen.getDate()).padStart(2, "0")}/${String(gen.getMonth() + 1).padStart(2, "0")}/${gen.getFullYear()}`;

  return new Document({
    creator: info.organization || "SFRA Analyzer",
    title,
    description: `SFRA Analyzer, bộ quy tắc ${std.versionTag}`,
    styles: {
      default: { document: { run: { font, size: body }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font, size: body + 2, bold: true }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font, size: body, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: PAGE, margin: MARGIN } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 4 } },
            children: [
              new TextRun({ text: `${title} · Lập ngày ${stamp} · Trang `, size: 18, color: "6B7280" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "6B7280" }),
              new TextRun({ text: "/", size: 18, color: "6B7280" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "6B7280" }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}
