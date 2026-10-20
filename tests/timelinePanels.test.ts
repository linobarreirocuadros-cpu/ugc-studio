import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePanelWidth, toolGrid } from "../src/app/timelinePanels";

test("los anchos internos toleran preferencias inválidas y limitan los extremos", () => {
  assert.equal(normalizePanelWidth("tools", undefined), 30);
  assert.equal(normalizePanelWidth("headers", NaN), 170);
  assert.equal(normalizePanelWidth("tools", -100), 28);
  assert.equal(normalizePanelWidth("tools", 900), 104);
  assert.equal(normalizePanelWidth("headers", 900), 300);
  assert.equal(normalizePanelWidth("headers", 1), 92);
});
test("las herramientas pasan de una a tres columnas y reservan acceso al sobrante sin desbordar", () => {
  assert.equal(toolGrid(30, 300).columns, 1);
  assert.equal(toolGrid(54, 300).columns, 2);
  assert.equal(toolGrid(80, 300).columns, 3);
  for (const width of [28, 30, 54, 80, 104]) for (const height of [50, 90, 150, 210, 300]) {
    const g = toolGrid(width, height);
    const rows = g.overflow ? Math.ceil((g.visible + 1) / g.columns) : Math.ceil(8 / g.columns) + Math.ceil(3 / g.columns);
    const used = rows * g.cell + Math.max(0, rows - 1) + 6 + (g.overflow ? 0 : 6);
    assert.ok(used <= height, `${width}×${height}: ${used}`);
    assert.ok(g.cell * g.columns + g.columns - 1 + 6 <= width);
    assert.equal(g.overflow, g.visible < 11);
  }
});
