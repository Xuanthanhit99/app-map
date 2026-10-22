// Debug helper: prints colour-contrast failures (selector, html, colours) for the given URLs.
import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
import { readFileSync } from "node:fs";
const axeSource = readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const b = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const p = await (await b.newContext({ viewport: { width: 1536, height: 960 } })).newPage();
for (const url of process.argv.slice(2)) {
  await p.goto(url); await p.waitForTimeout(800);
  await p.addScriptTag({ content: axeSource });
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } })).violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), msg: n.any[0]?.message }))));
  console.log(url, JSON.stringify(r, null, 1));
}
await b.close();
