/** Generic CSV (spec 4.2): detection, units, mapping profile. */
import { describe, expect, it } from "vitest";
import { NeedsMappingError, parseFile, type CsvProfile } from "../src/core/parsers";
import { std } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);
const pts = (n: number) => Array.from({ length: n }, (_, i) => 20 * 1.2 ** i);

describe("CSV hãng khác", () => {
  it("tiêu đề có từ khóa, dấu phẩy, đơn vị Hz/dB/độ → tự nhận dạng", async () => {
    const body = pts(60).map((f, i) => `${f.toFixed(3)},${(-30 - i / 10).toFixed(3)},${(i % 90).toFixed(1)}`).join("\n");
    const [t] = await parseFile(enc(`Frequency (Hz),Magnitude (dB),Phase (deg)\n${body}\n`), "7_a-N_2027-06-01_10-00-00.csv", await std);
    expect(t.formatId).toBe("generic_csv");
    expect(t.freq.length).toBe(60);
    expect(t.magDb[0]).toBeCloseTo(-30, 9);
    expect(t.index).toBe(7);
    expect(t.label).toBe("a-N");
    expect(t.parseNotes[0]).toContain("CSV tự nhận dạng");
  });

  it("dấu ;, thập phân ',', tần số kHz, biên độ tuyến tính → đổi Hz và dB", async () => {
    const body = pts(40).map((f) => `${(f / 1000).toFixed(6).replace(".", ",")};${"0,1"};${"1,5708"}`).join("\n");
    const [t] = await parseFile(enc(`f (kHz);Amplitude (V/V);Phase (rad)\n${body}\n`), "x.csv", await std);
    expect(t.freq[0]).toBeCloseTo(20, 6);
    expect(t.magDb[0]).toBeCloseTo(-20, 9); // 20·log10(0,1)
    expect(t.phaseDeg[0]).toBeCloseTo(90, 2);
    expect(t.parseNotes[0]).toContain("tỷ số tuyến tính");
  });

  it("biên độ không ghi đơn vị → chưa chắc chắn, yêu cầu ánh xạ", async () => {
    const body = pts(40).map((f) => `${f};0.1;10`).join("\n");
    await expect(parseFile(enc(`Freq;Amplitude;Phase\n${body}\n`), "z.csv", await std)).rejects.toBeInstanceOf(NeedsMappingError);
  });

  it("không có tiêu đề → yêu cầu ánh xạ; hồ sơ đã lưu được dùng lại", async () => {
    const s = await std;
    const text = `${pts(30).map((f, i) => `${f};${-20 - i};${i}`).join("\n")}\n`;
    let err: NeedsMappingError | null = null;
    try {
      await parseFile(enc(text), "y.csv", s);
    } catch (e) {
      err = e as NeedsMappingError;
    }
    expect(err).toBeInstanceOf(NeedsMappingError);
    expect(err!.sniff.headerRow).toBe(-1);
    expect(err!.sniff.delimiter).toBe(";");
    const profile: CsvProfile = { ...err!.sniff.guess, id: "p1", name: "Máy X", magUnit: "dB" };
    const [t] = await parseFile(enc(text), "y.csv", s, [profile]);
    expect(t.formatLabel).toBe('CSV (hồ sơ "Máy X")');
    expect(t.magDb[0]).toBe(-20);
  });
});
