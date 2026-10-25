/** Word report (spec 8): structure and numbers, built from the golden data (expectations outside the repository). */
import { writeFileSync } from "node:fs";
import { Packer } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { analyzePair } from "../src/core/analysis";
import { transformerConclusion } from "../src/core/rules";
import { buildReport, fileName } from "../src/report/docxBuilder";
import { defaultInfo } from "../src/report/info";
import { EXPECTED, HAVE_GOLDEN, goldenSet, std } from "./helpers";

describe.skipIf(!HAVE_GOLDEN)("báo cáo Word", () => {
  it("đủ các mục, số liệu khớp kết quả, tên file đúng mẫu", async () => {
    const s = await std;
    const { traces, group: g } = await goldenSet();
    const e = EXPECTED.golden;
    const byId = new Map(traces.map((t) => [t.id, t]));
    const results = g.rows.map((r) =>
      analyzePair(byId.get(r.baselineId!)!, byId.get(r.testId!)!, s, { index: r.index, label: r.label }),
    );
    const info = defaultInfo(g, traces, s);
    // newer files may hold placeholders (0 kV): the value is taken from the older nameplate
    expect(info).toMatchObject(e.report_info);
    expect(fileName(info, s)).toBe(e.report_file_name);

    const conclusion = transformerConclusion(results, s);
    const doc = buildReport({
      std: s, info, results, skipped: [], conclusion, images: new Map(), imageKey: () => "", generatedAt: new Date(2026, 9, 25),
    });
    const buf = await Packer.toBuffer(doc);
    if (process.env.SFRA_REPORT_OUT) writeFileSync(process.env.SFRA_REPORT_OUT, buf);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    const styles = await zip.file("word/styles.xml")!.async("string");
    const text = xml.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "");

    for (const heading of [
      e.report_title, "1. Thông tin chung", "2. Phương pháp",
      "3. Bảng tổng hợp kết quả", "4. Chi tiết từng phép đo", "5. Kết luận", "6. Tài liệu tham khảo",
    ]) expect(text).toContain(heading);
    // 18 detail sections, golden numbers with 3 decimals and decimal comma
    expect(text.match(/4\.\d+\. Phép đo \d+ – /g)).toHaveLength(18);
    for (const v of e.report_values as string[]) expect(text).toContain(v);
    expect(text).toContain(conclusion.text);
    expect(text).toContain("Đầu đo đảo so với baseline");
    expect(text).toContain("DL/T 911-2004, Phụ lục A");
    expect(styles).toContain('w:ascii="Times New Roman"');
    expect(styles).toContain('<w:sz w:val="26"/>'); // 13 pt
    // A4
    const docXml = xml.match(/<w:pgSz [^>]+>/)![0];
    expect(docXml).toContain('w:w="11906"');
    expect(docXml).toContain('w:h="16838"');
  });
});
