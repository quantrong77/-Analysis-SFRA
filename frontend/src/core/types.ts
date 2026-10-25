export interface TestSetting {
  redLead: string;
  blackLead: string;
  measurementType: string;
  shortedTerminal: string;
  groundedTerminal: string;
  ltcPosition: string;
  detcPosition: string;
}

export interface Section {
  name: string;
  items: Record<string, string>;
}

export interface Trace {
  /** Unique within a workspace: sha256 + sweep index */
  id: string;
  freq: number[];
  magDb: number[];
  phaseDeg: number[];
  peaksDb: number[] | null;
  traceName: string;
  sourceName: string;
  sha256: string;
  formatId: string;
  formatLabel: string;
  sections: Section[];
  setting: TestSetting;
  serialNumber: string;
  location: string;
  /** Transformer identity used for grouping (serial number, else object/location) */
  transformerKey: string;
  /** Local date-time of the measurement, null when unknown */
  testDate: Date | null;
  dateSource: string;
  encoding: string;
  /** Pairing key parts (spec 4.4): STT from the file name (null if absent) and measurement label */
  index: number | null;
  label: string;
  /** Notes produced while parsing (assumptions, unconfirmed mappings) */
  parseNotes: string[];
}

export const emptySetting = (): TestSetting => ({
  redLead: "",
  blackLead: "",
  measurementType: "",
  shortedTerminal: "",
  groundedTerminal: "",
  ltcPosition: "",
  detcPosition: "",
});

export class ParseError extends Error {}
