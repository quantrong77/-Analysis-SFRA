/// <reference types="vite/client" />

declare module "plotly.js-basic-dist-min" {
  const Plotly: {
    react: (el: HTMLElement, data: unknown[], layout: unknown, config?: unknown) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
    toImage: (fig: { data: unknown[]; layout: unknown }, opts: { format: "png"; width: number; height: number }) => Promise<string>;
    Plots: { resize: (el: HTMLElement) => void };
  };
  export default Plotly;
}
