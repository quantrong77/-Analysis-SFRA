/** Tiny dependency-free XML reader (works in the browser and in Node tests). */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITY[e] ?? m;
  });
}

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[3]) {
      if (m[2] === "/") {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs: Record<string, string> = {};
      const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[4] ?? ""))) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? "");
      const node: XmlNode = { name: m[3], attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6]);
    }
  }
  return root;
}

export function child(n: XmlNode | undefined, name: string): XmlNode | undefined {
  return n?.children.find((c) => c.name === name);
}

export function children(n: XmlNode | undefined, name: string): XmlNode[] {
  return n?.children.filter((c) => c.name === name) ?? [];
}

export function textOf(n: XmlNode | undefined, name: string): string {
  return (child(n, name)?.text ?? "").trim();
}

/** Flatten: every element with leaf children becomes a section of key -> text. */
export function leafSections(n: XmlNode, skip: Set<string> = new Set()): { name: string; items: Record<string, string> }[] {
  const out: { name: string; items: Record<string, string> }[] = [];
  const walk = (node: XmlNode) => {
    const items: Record<string, string> = {};
    for (const c of node.children) {
      if (skip.has(c.name)) continue;
      if (c.children.length === 0) {
        let k = c.name;
        if (k in items) {
          let i = 2;
          while (`${k}#${i}` in items) i++;
          k = `${k}#${i}`;
        }
        items[k] = c.text.trim();
      }
    }
    if (Object.keys(items).length) out.push({ name: node.name, items });
    for (const c of node.children) if (c.children.length && !skip.has(c.name)) walk(c);
  };
  walk(n);
  return out;
}
