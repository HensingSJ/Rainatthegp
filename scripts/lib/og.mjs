// Share images (1200x630 PNG) for link previews on WhatsApp, X, Reddit, etc.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const font = (pkg, file) => fs.readFile(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files", file));
const FONTS = [
  { name: "Saira", data: await font("@fontsource/saira-extra-condensed", "saira-extra-condensed-latin-900-normal.woff"), weight: 900, style: "normal" },
  { name: "Saira", data: await font("@fontsource/saira-extra-condensed", "saira-extra-condensed-latin-800-normal.woff"), weight: 800, style: "normal" },
  { name: "Titillium", data: await font("@fontsource/titillium-web", "titillium-web-latin-600-normal.woff"), weight: 600, style: "normal" },
  { name: "Titillium", data: await font("@fontsource/titillium-web", "titillium-web-latin-400-normal.woff"), weight: 400, style: "normal" }
];
const SKY = {
  no: ["#ff9a52", "#2b1830"], maybe: ["#5a6b7d", "#141b23"], yes: ["#2a5d9c", "#081120"],
  early: ["#3a4552", "#11161c"], over: ["#3a4552", "#11161c"]
};
const h = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });

// Deterministic "rain" streaks, denser for wetter answers
function streaks(v) {
  const n = { no: 6, maybe: 26, yes: 60, early: 10, over: 10 }[v] ?? 10, out = [];
  let x = 17;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const left = (x / 233280) * 1260 - 30, top = ((x * 7) % 630) - 40, len = 26 + (x % 40);
    out.push(h("div", { position: "absolute", left, top, width: 2, height: len, background: "rgba(210,230,255,0.28)", transform: "rotate(16deg)" }, []));
  }
  return out;
}

export async function ogImage({ v, word, q, pct, pctLab, topLeft, topRight, footer }) {
  const [c1, c2] = SKY[v] || SKY.early;
  const clean = word.replace("­", "");
  const size = clean.length <= 4 ? 300 : clean.length <= 6 ? 250 : clean.length <= 8 ? 190 : 150;
  const tree = h("div", { width: 1200, height: 630, position: "relative", color: "#f3f6f9", fontFamily: "Titillium",
    backgroundImage: `radial-gradient(circle at 85% -10%, ${c1}, ${c2} 70%)` }, [
    h("div", { position: "absolute", left: 0, top: 0, width: 1200, height: 630 }, streaks(v)),
    h("div", { position: "absolute", left: 64, top: 48, width: 1072, height: 534, flexDirection: "column", justifyContent: "space-between" }, [
    h("div", { width: "100%", justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }, [
      h("div", {}, [topLeft]), h("div", { opacity: 0.75 }, [topRight])
    ]),
    h("div", { flexDirection: "column" }, [
      h("div", { fontSize: 40, fontWeight: 600, marginBottom: 6, maxWidth: 1060 }, [q]),
      h("div", { alignItems: "flex-end" }, [
        h("div", { fontFamily: "Saira", fontWeight: 900, fontSize: size, lineHeight: 0.85, textTransform: "uppercase", transform: "skewX(-9deg)", marginRight: 44, color: "#ffffff" }, [clean]),
        pct && pct !== "–" ? h("div", { flexDirection: "column", paddingBottom: 14 }, [
          h("div", { fontFamily: "Saira", fontWeight: 800, fontSize: 110, lineHeight: 0.9 }, [pct]),
          h("div", { fontSize: 24, letterSpacing: 3, textTransform: "uppercase", opacity: 0.8 }, [pctLab])
        ]) : h("div", {}, [])
      ])
    ]),
    h("div", { width: "100%", justifyContent: "space-between", alignItems: "center", fontSize: 26 }, [
      h("div", { fontFamily: "Saira", fontWeight: 800, fontSize: 34, letterSpacing: 2, textTransform: "uppercase" }, ["rainatthegp.com"]),
      h("div", { opacity: 0.8 }, [footer || ""])
    ])
    ])
  ]);
  const svg = await satori(tree, { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
