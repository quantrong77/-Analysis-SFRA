/** Colour of each band's Rxy and the Table A.1 key, both read from standards.yaml. */
import { describe, expect, it } from "vitest";
import { bandLevel, levelConditions } from "../src/core/dlt911";
import { std } from "./helpers";

describe("mã màu theo Bảng A.1", () => {
  it("mức mà riêng hệ số của từng dải chỉ ra", async () => {
    const s = await std;
    const lv = (b: string, v: number | null) => bandLevel(b, v, s)?.id ?? null;
    expect([0.5, 0.8, 1.5, 2.5].map((v) => lv("LF", v))).toEqual(["severe", "obvious", "slight", "normal"]);
    expect([0.5, 0.8, 1.2].map((v) => lv("MF", v))).toEqual(["obvious", "slight", "normal"]);
    expect([0.5, 0.7].map((v) => lv("HF", v))).toEqual(["review", "normal"]);
    expect(lv("LF", null)).toBeNull();
  });

  it("điều kiện các mức đọc từ quy tắc", async () => {
    const s = await std;
    const key = levelConditions(s, (v) => v.toFixed(1).replace(".", ","));
    expect(key.map((k) => k.level.id)).toEqual(["severe", "obvious", "slight", "normal", "review", "insufficient"]);
    expect(key[0].text).toBe("RLF < 0,6");
    expect(key[1].text).toBe("0,6 ≤ RLF < 1,0 hoặc RMF < 0,6");
    expect(key[3].text).toBe("RLF ≥ 2,0 và RMF ≥ 1,0 và RHF ≥ 0,6");
  });
});
