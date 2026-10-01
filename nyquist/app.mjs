import { parseTransferFunction, sampleNyquist } from "./math.mjs";

const $ = id => document.getElementById(id);
const form = $("plot-form"), expression = $("expression"), startInput = $("start-hz"), stopInput = $("stop-hz"), samplesInput = $("samples");
const canvas = $("plot"), wrap = $("plot-wrap"), tooltip = $("tooltip"), error = $("error"), status = $("plot-status");
const ctx = canvas.getContext("2d");
const COLORS = { grid: "#e7ecea", axis: "#a9b8b8", text: "#778b8d", positive: "#196f83", negative: "#d78342", target: "#a73c38" };
const margins = { left: 66, right: 25, top: 28, bottom: 52 };
let data = null, view = { x: 0, y: 0, scale: 1 }, fitMode = true, hovered = null, drag = null;
let width = 0, height = 0;

function formatNumber(n) {
  if (!Number.isFinite(n)) return "undefined";
  if (Math.abs(n) < 1e-12) return "0";
  const magnitude = Math.abs(n);
  return magnitude >= 10000 || magnitude < 0.001 ? n.toExponential(2) : Number(n.toPrecision(4)).toString();
}
function plotBox() { return { left: margins.left, top: margins.top, width: Math.max(1, width - margins.left - margins.right), height: Math.max(1, height - margins.top - margins.bottom) }; }
function screen(point) {
  const b = plotBox();
  return { x: b.left + b.width / 2 + (point.re - view.x) * view.scale, y: b.top + b.height / 2 - (point.im - view.y) * view.scale };
}
function world(x, y) {
  const b = plotBox();
  return { re: view.x + (x - b.left - b.width / 2) / view.scale, im: view.y - (y - b.top - b.height / 2) / view.scale };
}
function niceStep(target) {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-14))));
  const unit = target / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}
function resize() {
  const rect = wrap.getBoundingClientRect();
  width = Math.max(1, Math.round(rect.width));
  height = Math.max(1, Math.round(rect.height));
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fitMode && data) fitView(); else draw();
}
function fitView() {
  if (!data) return;
  const points = [...data.positive, ...data.negative].filter(p => Number.isFinite(p.re) && Number.isFinite(p.im));
  const xs = points.map(p => p.re).concat([-1, 0]);
  const ys = points.map(p => p.im).concat([0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  view.x = (minX + maxX) / 2;
  view.y = (minY + maxY) / 2;
  const b = plotBox();
  view.scale = 0.82 * Math.min(b.width / Math.max(maxX - minX, 0.15), b.height / Math.max(maxY - minY, 0.15));
  fitMode = true;
  draw();
}
function drawGrid() {
  const b = plotBox(), min = world(b.left, b.top + b.height), max = world(b.left + b.width, b.top);
  const step = niceStep(Math.max(max.re - min.re, max.im - min.im) / 7);
  ctx.save();
  ctx.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.rect(b.left, b.top, b.width, b.height); ctx.clip();
  for (let x = Math.ceil(min.re / step) * step, count = 0; x <= max.re + step * 1e-8 && count < 80; x += step, count++) {
    const sx = screen({ re: x, im: 0 }).x;
    ctx.strokeStyle = Math.abs(x) < step * 1e-8 ? COLORS.axis : COLORS.grid;
    ctx.beginPath(); ctx.moveTo(sx, b.top); ctx.lineTo(sx, b.top + b.height); ctx.stroke();
  }
  for (let y = Math.ceil(min.im / step) * step, count = 0; y <= max.im + step * 1e-8 && count < 80; y += step, count++) {
    const sy = screen({ re: 0, im: y }).y;
    ctx.strokeStyle = Math.abs(y) < step * 1e-8 ? COLORS.axis : COLORS.grid;
    ctx.beginPath(); ctx.moveTo(b.left, sy); ctx.lineTo(b.left + b.width, sy); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let x = Math.ceil(min.re / step) * step, count = 0; x <= max.re + step * 1e-8 && count < 80; x += step, count++) {
    const sx = screen({ re: x, im: 0 }).x;
    ctx.fillText(formatNumber(x), sx, b.top + b.height + 8);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let y = Math.ceil(min.im / step) * step, count = 0; y <= max.im + step * 1e-8 && count < 80; y += step, count++) {
    const sy = screen({ re: 0, im: y }).y;
    ctx.fillText(formatNumber(y), b.left - 8, sy);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("Real G(jω)", b.left + b.width / 2, height - 4);
  ctx.save(); ctx.translate(14, b.top + b.height / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "top"; ctx.fillText("Imag G(jω)", 0, 0); ctx.restore();
}
function drawArrow(a, b, color) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (!Number.isFinite(angle)) return;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawBranch(points, color) {
  const b = plotBox();
  ctx.save(); ctx.beginPath(); ctx.rect(b.left, b.top, b.width, b.height); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
  ctx.beginPath(); let previous = null;
  for (const point of points) {
    if (!Number.isFinite(point.re) || !Number.isFinite(point.im)) { previous = null; continue; }
    const p = screen(point);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { previous = null; continue; }
    if (!previous || Math.hypot(p.x - previous.x, p.y - previous.y) > Math.max(width, height) * 1.6) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    previous = p;
  }
  ctx.stroke();
  for (const fraction of [0.25, 0.6, 0.86]) {
    const i = Math.round((points.length - 1) * fraction);
    const a = screen(points[Math.max(0, i - 3)]), z = screen(points[Math.min(points.length - 1, i + 3)]);
    if ([a.x, a.y, z.x, z.y].every(Number.isFinite) && Math.hypot(z.x - a.x, z.y - a.y) > 6) drawArrow(a, z, color);
  }
  ctx.restore();
}
function drawTarget() {
  const p = screen({ re: -1, im: 0 }), b = plotBox();
  if (p.x < b.left || p.x > b.left + b.width || p.y < b.top || p.y > b.top + b.height) return;
  ctx.save(); ctx.strokeStyle = COLORS.target; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - 6); ctx.lineTo(p.x + 6, p.y + 6); ctx.moveTo(p.x - 6, p.y + 6); ctx.lineTo(p.x + 6, p.y - 6); ctx.stroke();
  ctx.fillStyle = COLORS.target; ctx.font = "11px ui-monospace, monospace"; ctx.fillText("−1", p.x + 16, p.y - 8); ctx.restore();
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
  drawGrid();
  if (!data) return;
  drawBranch(data.negative, COLORS.negative);
  drawBranch(data.positive, COLORS.positive);
  drawTarget();
  if (hovered) {
    const p = screen(hovered);
    ctx.beginPath(); ctx.fillStyle = "#fff"; ctx.strokeStyle = hovered.omega > 0 ? COLORS.positive : COLORS.negative;
    ctx.lineWidth = 2.5; ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
function plot() {
  error.hidden = true;
  try {
    const ast = parseTransferFunction(expression.value);
    const start = Number(startInput.value), stop = Number(stopInput.value), samples = Number(samplesInput.value);
    data = sampleNyquist(ast, start, stop, samples);
    hovered = null; tooltip.hidden = true;
    const excluded = [...data.positive, ...data.negative].filter(p => !Number.isFinite(p.re) || !Number.isFinite(p.im)).length;
    status.textContent = `${samples * 2} points · ${formatNumber(start)}–${formatNumber(stop)} Hz${excluded ? ` · ${excluded} undefined` : ""}`;
    fitView();
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : "Could not plot this function.";
    error.hidden = false;
  }
}
function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function updateHover(event) {
  if (!data) return;
  const p = pointerPosition(event), b = plotBox();
  if (p.x < b.left || p.x > b.left + b.width || p.y < b.top || p.y > b.top + b.height) { hovered = null; tooltip.hidden = true; draw(); return; }
  let nearest = null, best = 18 * 18;
  for (const point of [...data.positive, ...data.negative]) {
    if (!Number.isFinite(point.re) || !Number.isFinite(point.im)) continue;
    const q = screen(point), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < best) { best = d; nearest = point; }
  }
  hovered = nearest;
  if (nearest) {
    const q = screen(nearest);
    tooltip.textContent = `f = ${formatNumber(nearest.f)} Hz · ω = ${formatNumber(nearest.omega)} rad/s\nG = ${formatNumber(nearest.re)} ${nearest.im < 0 ? "−" : "+"} j${formatNumber(Math.abs(nearest.im))}`;
    tooltip.style.left = `${Math.min(Math.max(q.x + 13, 5), width - 210)}px`;
    tooltip.style.top = `${Math.max(5, q.y - 56)}px`;
    tooltip.hidden = false;
  } else tooltip.hidden = true;
  draw();
}

form.addEventListener("submit", event => { event.preventDefault(); plot(); });
expression.addEventListener("keydown", event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); plot(); } });
document.querySelectorAll(".preset").forEach(button => button.addEventListener("click", () => {
  expression.value = button.dataset.expression;
  startInput.value = button.dataset.low;
  stopInput.value = button.dataset.high;
  plot();
}));
$("fit-button").addEventListener("click", fitView);
canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  const p = pointerPosition(event); drag = p; canvas.setPointerCapture(event.pointerId);
  tooltip.hidden = true; hovered = null; canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", event => {
  if (drag) {
    const p = pointerPosition(event);
    view.x -= (p.x - drag.x) / view.scale;
    view.y += (p.y - drag.y) / view.scale;
    drag = p; fitMode = false; draw();
  } else updateHover(event);
});
function endDrag() { drag = null; canvas.style.cursor = "crosshair"; }
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { if (!drag) { hovered = null; tooltip.hidden = true; draw(); } });
canvas.addEventListener("wheel", event => {
  if (!data) return;
  event.preventDefault();
  const p = pointerPosition(event), before = world(p.x, p.y);
  view.scale = Math.max(1e-12, Math.min(1e12, view.scale * Math.exp(-event.deltaY * 0.0015)));
  const after = world(p.x, p.y);
  view.x += before.re - after.re; view.y += before.im - after.im;
  fitMode = false; hovered = null; tooltip.hidden = true; draw();
}, { passive: false });
new ResizeObserver(resize).observe(wrap);
resize(); plot();

// Optional browser agent interface; it invokes the same plot action as the form.
if (document.modelContext?.registerTool) {
  try {
    void Promise.resolve(document.modelContext.registerTool({
      name: "plot_transfer_function",
      title: "Plot transfer function",
      description: "Plot a real-coefficient transfer function G(s) on this Nyquist chart over a frequency range in hertz.",
      inputSchema: {
        type: "object",
        properties: {
          expression: { type: "string", description: "G(s), for example 10/(s*(s+2)). Use * for multiplication." },
          startHz: { type: "number", description: "Positive sweep start in hertz." },
          stopHz: { type: "number", description: "Sweep stop in hertz, greater than startHz." },
          samples: { type: "integer", description: "Samples per branch, from 80 to 3000." }
        },
        required: ["expression", "startHz", "stopHz"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const next = input || {};
        const count = next.samples ?? 700;
        const ast = parseTransferFunction(next.expression);
        sampleNyquist(ast, next.startHz, next.stopHz, count);
        expression.value = next.expression;
        startInput.value = String(next.startHz);
        stopInput.value = String(next.stopHz);
        samplesInput.value = String(count);
        plot();
        return { plotted: true, expression: next.expression, startHz: next.startHz, stopHz: next.stopHz, points: count * 2 };
      }
    })).catch(() => {});
  } catch { /* Browsers without WebMCP still use the visible form. */ }
}
