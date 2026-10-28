/**
 * How each failure mode of IEEE Std C57.149-2012 6.5 is represented in the teaching ladder model:
 * which elements change and in which sections. The physical reading of each change follows the
 * text of 6.5 and Annex A (L, Cs, Cg determine the resonances; the core magnetizing inductance the
 * lowest frequencies); the size of the change for a given severity is a teaching choice, not data.
 * Overall bulk movement (6.5.3) and transport looseness (6.5.8) are not simulated: in this model
 * without mutual coupling they also change the lowest frequencies, which C57.149 Tables 9 and 14
 * say they leave unaffected.
 */
import { HEALTHY, noScale, type SectionScale, type WindingModel } from "./ladder";

export type FaultId =
  | "radial"
  | "axial"
  | "core"
  | "contact"
  | "turn_short"
  | "open_winding"
  | "residual"
  | "earth_lead";

/** Part of the winding a local fault sits in */
export type Where = "start" | "middle" | "end";

export interface Simulated {
  model: WindingModel;
  scale: SectionScale;
}

const span = (n: number, where: Where): number[] => {
  const third = Math.max(1, Math.round(n / 3));
  const from = where === "start" ? 0 : where === "middle" ? Math.floor((n - third) / 2) : n - third;
  return Array.from({ length: third }, (_, i) => from + i);
};

/**
 * The model with one failure mode at severity s (0 = none, 1 = the largest the slider allows).
 * Local faults change the sections in `where`; the others change the whole winding or the core.
 */
export function simulate(id: FaultId | "none", s: number, where: Where = "middle", base: WindingModel = HEALTHY): Simulated {
  const model: WindingModel = { ...base };
  const scale = noScale(base.n);
  const local = span(base.n, where);
  const each = (key: "L" | "Cs" | "Cg", f: number, ks: number[] = local) => {
    for (const k of ks) scale[key][k] *= f;
  };
  switch (id) {
    case "radial":
      // inward buckling: the winding comes closer to the core or inner winding, its capacitance to
      // them (Cg) rises; its inductance falls a little
      each("Cg", 1 + 1.2 * s);
      break;
    case "axial":
      // telescoping: discs move apart, series capacitance (Cs) falls; inductance changes
      each("Cs", 1 - 0.6 * s);
      each("L", 1 + 0.15 * s);
      break;
    case "core":
      // shorted or burnt laminations, extra core grounds: the core loads (more loss, less inductance)
      model.Rm = base.Rm * (1 - 0.9 * s);
      model.Lm = base.Lm * (1 - 0.4 * s);
      break;
    case "contact":
      // resistance added in series at the terminal connection
      model.Rc = 40 * s;
      break;
    case "turn_short":
      // a shorted turn acts as a shorted winding on the core limb: the core's reluctance no longer
      // shows in the open-circuit response; the shorted section loses inductance
      model.Lm = base.Lm * (1 - 0.995 * s);
      each("L", 1 - 0.9 * s, [local[0]]);
      break;
    case "open_winding":
      // a break in one section: very high resistance in series there, bridged only by its Cs
      if (s > 0) scale.Rx[local[0]] = 10 ** (2 + 4 * s);
      break;
    case "residual":
      // remanent flux lowers the core's effective inductance: the core resonance moves up
      model.Lm = base.Lm * (1 - 0.6 * s);
      break;
    case "earth_lead":
      // response lead earthed through a longer braid or wire (IEC 60076-18 A.4): inductance in the
      // earth path, about 1 µH per metre
      model.Le = 3e-6 * s;
      break;
    case "none":
      break;
  }
  return { model, scale };
}
