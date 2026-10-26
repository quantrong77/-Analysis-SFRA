/** Frequency partitions shown on the plots come from standards.yaml, each with its source. */
import { expect, it } from "vitest";
import { frequencyPartitions, loadStandards, STANDARDS_TEXT } from "../src/core/standards";
import { std } from "./helpers";

it("năm cách chia dải tần theo tài liệu tham chiếu, mỗi cách có nguồn và các vùng nối tiếp", async () => {
  const ps = frequencyPartitions(await std);
  expect(ps.map((p) => p.id)).toEqual(["dlt911", "iec", "ieee", "cigre342", "cigre812"]);
  for (const p of ps) {
    expect(p.source.length).toBeGreaterThan(10);
    expect(p.zones.length).toBeGreaterThanOrEqual(3);
    p.zones.slice(1).forEach((z, i) => expect(z.f_min).toBe(p.zones[i].f_max));
  }
  const by = Object.fromEntries(ps.map((p) => [p.id, p.zones.map((z) => [z.f_min, z.f_max])]));
  expect(by.dlt911).toEqual([[1e3, 1e5], [1e5, 6e5], [6e5, 1e6]]);
  expect(by.iec).toEqual([[0, 2e3], [2e3, 2e4], [2e4, 1e6], [1e6, Infinity]]);
  expect(by.ieee).toEqual(by.iec);
  expect(by.cigre342).toEqual([[0, 2e3], [2e3, 2e4], [2e4, 2e6]]);
  expect(by.cigre812).toEqual([[1e3, 1e4], [1e4, 5e5], [5e5, 1e6]]);
});

it("bộ quy tắc tùy chỉnh chưa có mục phân vùng vẫn có dải DL/T 911 và vùng IEC", async () => {
  const old = await loadStandards(STANDARDS_TEXT);
  delete old.frequency_partitions;
  const ps = frequencyPartitions(old);
  expect(ps.map((p) => p.id)).toEqual(["dlt911", "iec"]);
});

it("mỗi vùng IEC 60076-18 có mô tả ảnh hưởng, kèm nguồn B.3", async () => {
  const iec = (await std).iec_zones;
  expect(iec.influence_source).toContain("B.3");
  for (const z of Object.values(iec.zones) as { influence?: string }[]) expect((z.influence ?? "").length).toBeGreaterThan(40);
});
