/** CSV exported by the FRAX software: several sweeps in one file, told apart by Index (synthetic data). */
import { describe, expect, it } from "vitest";
import { parseFile } from "../src/core/parsers";
import { sniffFraxCsv } from "../src/core/parsers/fraxCsv";
import { std } from "./helpers";

const points = (idx: number, decimal = ".") =>
  [20, 100, 1000, 10000, 100000, 1000000]
    .map((f, i) => `${idx};${f};${(-10 - i - idx).toFixed(2)};${(45 - 10 * i).toFixed(1)}`.replace(/\.(\d)/g, `${decimal}$1`))
    .join("\n");

const file = (data: string) => `[Format]
FileVersion;SoftwareVersion
1.0.0;5.11.0.0

[Transformer]
SerialNumber;Manufacturer;TransformerType;Autotransformer;AdditionalInfo;TransformerLocation;VectorGroup;ManufactureYear;MVA;HighV;LowV;TertiaryV;Phases
SN-TEST;;;True;;TRAM X;Yd11;0;NaN;NaN;NaN;NaN;3

[Test]
TestName;TestDate;Location;Tester;Temperature;Notes;StartFrequency;StopFrequency
Thu nghiem;2024-03-02 09:30:00;TRAM X;Nguoi do;NaN;NLTCPos: 3¶LTCPos: 9b¶Reason: ¶Notes: ;20;1000000

[Traces]
Index;Color;SweepName;Date;Comment;RedChannel;BlueChannel
0;#000000;A-a;2024-03-02 08:10:00;;;
1;#000000;B-b;2024-03-02 08:20:00;;;
2;#008000;C-c;2024-03-02 08:30:00;;;

[Data]
Index;Frequency;Magnitude;Phase
${data}
`;

const bytes = (s: string) => new TextEncoder().encode(s);

describe("CSV xuất từ phần mềm FRAX", () => {
  it("nhận dạng theo các mục [Format] và [Traces]", () => {
    expect(sniffFraxCsv(file(points(0)))).toBe(true);
    expect(sniffFraxCsv("Frequency;Magnitude\n1;2")).toBe(false);
  });

  it("tách từng phép đo theo Index, lấy tên, ngày, số chế tạo; báo phép đo khai báo mà không có số liệu", async () => {
    const ts = await parseFile(bytes(file(`${points(0)}\n${points(2)}`)), "job.csv", await std);
    expect(ts.map((t) => t.label)).toEqual(["A-a", "C-c"]);
    expect(ts.map((t) => t.id.split("#")[1])).toEqual(["0", "2"]);
    const [a, c] = ts;
    expect(a.formatId).toBe("frax_csv");
    expect(a.freq).toHaveLength(6);
    expect(a.magDb[0]).toBeCloseTo(-10);
    expect(c.magDb[0]).toBeCloseTo(-12);
    expect(a.phaseDeg[1]).toBeCloseTo(35);
    expect(a.testDate).toEqual(new Date(2024, 2, 2, 8, 10));
    expect(c.testDate).toEqual(new Date(2024, 2, 2, 8, 30));
    expect([a.serialNumber, a.transformerKey, a.location]).toEqual(["SN-TEST", "SN-TEST", "TRAM X"]);
    expect([a.setting.ltcPosition, a.setting.detcPosition]).toEqual(["9b", "3"]);
    expect(a.parseNotes.join(" ")).toContain("Không có số liệu của: B-b");
  });

  it("đọc được dấu thập phân là dấu phẩy", async () => {
    const [a] = await parseFile(bytes(file(points(0, ","))), "job.csv", await std);
    expect(a.magDb[0]).toBeCloseTo(-10);
    expect(a.phaseDeg[1]).toBeCloseTo(35);
  });

  it("số liệu của Index không có trong [Traces] vẫn được giữ, đặt tên theo Index", async () => {
    const ts = await parseFile(bytes(file(`${points(0)}\n${points(7)}`)), "job.csv", await std);
    expect(ts.map((t) => t.label)).toEqual(["A-a", "Sweep 7"]);
  });

  it("không phép đo nào có số liệu thì báo lỗi rõ ràng", async () => {
    await expect(parseFile(bytes(file("")), "job.csv", await std)).rejects.toThrow(/không có số liệu/i);
  });
});
