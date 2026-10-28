/** Word sheet of a trainee's results on a training pack: one row per case, then the total. */
import { AlignmentType, Document, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { faultInfo, TRAINING } from "../core/training/content";
import type { TrainingPack } from "../core/training/pack";
import type { CaseScore, Response } from "../core/training/score";

export interface ResultInput {
  pack: TrainingPack;
  learner: string;
  responses: Record<string, Response>;
  scores: Record<string, CaseScore>;
  date: Date;
}

const FONT = "Times New Roman";
const p = (text: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { after: 100 }, children: [new TextRun({ text, bold: o.bold, size: o.size ?? 26, font: FONT })] });
const cell = (text: string, bold = false) =>
  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 22, font: FONT })] })] });

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const bandLabel = (id: string) => TRAINING.bands.find((b) => b.id === id)?.label ?? id;
const recLabel = (id: string) => TRAINING.recommendations.find((r) => r.id === id)?.label ?? id;

export function buildResultSheet(input: ResultInput): Document {
  const { pack, learner, responses, scores } = input;
  const done = pack.cases.filter((c) => scores[c.id]);
  const points = done.reduce((s, c) => s + scores[c.id].points, 0);
  const max = done.reduce((s, c) => s + scores[c.id].max, 0);
  const rows = [
    new TableRow({ tableHeader: true, children: ["Bài", "Học viên chọn", "Đáp án", "Điểm"].map((h) => cell(h, true)) }),
    ...pack.cases.map((c) => {
      const r = responses[c.id];
      const s = scores[c.id];
      const chose = r
        ? `${faultInfo(r.fault)?.label ?? r.fault}; dải: ${r.bands.map(bandLabel).join(", ") || "không chọn"}; ${recLabel(r.recommendation)}`
        : "Chưa làm";
      const want = `${faultInfo(c.answer.fault)?.label ?? c.answer.fault}; dải: ${c.answer.bands.map(bandLabel).join(", ") || "không"}; ${recLabel(c.answer.recommendation)}`;
      return new TableRow({
        children: [cell(c.title), cell(chose), cell(want), cell(s ? `${s.points}/${s.max} (${s.percent} %)` : "–")],
      });
    }),
  ];
  return new Document({
    creator: "SFRA Analyzer",
    title: "Phiếu kết quả bài tập SFRA",
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
        children: [
          p("PHIẾU KẾT QUẢ BÀI TẬP CHẨN ĐOÁN SFRA", { bold: true, size: 30, align: AlignmentType.CENTER }),
          p("Kết quả huấn luyện nội bộ, không phải chứng chỉ", { size: 22, align: AlignmentType.CENTER }),
          p(`Học viên: ${learner || "(chưa ghi tên)"}`),
          p(`Gói bài tập: ${pack.title}${pack.author ? `, người soạn ${pack.author}` : ""}`),
          p(`Ngày làm bài: ${dmy(input.date)}`),
          p(`Số bài đã làm: ${done.length}/${pack.cases.length}. Tổng điểm: ${points}/${max}${max ? ` (${Math.round((points / max) * 1000) / 10} %)` : ""}.`, { bold: true }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
          p(""),
          p(`Thang điểm: ${TRAINING.scoring.source}. Dải tần theo ${TRAINING.bands_source}.`, { size: 20 }),
        ],
      },
    ],
  });
}
