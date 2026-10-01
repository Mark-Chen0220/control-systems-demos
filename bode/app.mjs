import { evaluateBode, sampleBode, validateModel } from './math.mjs';

const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let nextId = 1;
let factors = [];
let currentModel = null;
let samples = [];
let hoverHz = null;

const examples = {
  starter: { gain: 1, minHz: 0.1, maxHz: 10000, factors: [{type:'pole',side:'LHP',hz:10,order:1},{type:'zero',side:'RHP',hz:100,order:1}] },
  lowpass: { gain: 1, minHz: 0.1, maxHz: 10000, factors: [{type:'pole',side:'LHP',hz:10,order:1}] },
  rhpZero: { gain: 1, minHz: 0.1, maxHz: 10000, factors: [{type:'zero',side:'RHP',hz:10,order:1}] },
  rhpPole: { gain: 1, minHz: 0.1, maxHz: 10000, factors: [{type:'pole',side:'RHP',hz:10,order:1}] }
};

function applyExample(key) {
  const example = examples[key];
  $('gain').value = example.gain;
  $('minHz').value = example.minHz;
  $('maxHz').value = example.maxHz;
  factors = example.factors.map((factor) => ({ ...factor, id: nextId++ }));
  renderRows(); update();
}

function addFactor(type) {
  factors.push({ id: nextId++, type, side: 'LHP', hz: type === 'pole' ? 10 : 100, order: 1 });
  renderRows(); update();
  $('factorList').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderRows() {
  const list = $('factorList');
  list.replaceChildren();
  $('count').textContent = factors.length;
  for (const [index, factor] of factors.entries()) {
    const row = document.createElement('div');
    row.className = `factor-row ${factor.type}`;
    row.dataset.id = factor.id;
    row.innerHTML = `<div class="factor-row-head"><strong>Factor ${index + 1}</strong><button type="button" data-remove title="Remove factor" aria-label="Remove factor ${index + 1}">×</button></div>
      <div class="factor-fields">
        <label>Kind<select data-field="type" aria-label="Factor ${index + 1} kind"><option value="pole">Pole</option><option value="zero">Zero</option></select></label>
        <label>Plane<select data-field="side" aria-label="Factor ${index + 1} half-plane"><option value="LHP">LHP</option><option value="RHP">RHP</option></select></label>
        <label>Corner frequency · Hz<input data-field="hz" type="number" step="any" min="0" aria-label="Factor ${index + 1} corner frequency in hertz"></label>
        <label>Order<input data-field="order" type="number" step="1" min="1" max="20" aria-label="Factor ${index + 1} order"></label>
      </div>`;
    row.querySelector('[data-field="type"]').value = factor.type;
    row.querySelector('[data-field="side"]').value = factor.side;
    row.querySelector('[data-field="hz"]').value = factor.hz;
    row.querySelector('[data-field="order"]').value = factor.order;
    list.append(row);
  }
}

function readNumber(input) { return input.value.trim() === '' ? NaN : Number(input.value); }
function getModel() {
  return { gain: readNumber($('gain')), minHz: readNumber($('minHz')), maxHz: readNumber($('maxHz')), factors: factors.map(({type,side,hz,order}) => ({type,side,hz,order})) };
}
function pretty(value) { return Number(value).toLocaleString('en-US', {maximumSignificantDigits: 5}); }
function frequencyLabel(hz) {
  if (hz >= 1e6) return `${pretty(hz / 1e6)} MHz`;
  if (hz >= 1e3) return `${pretty(hz / 1e3)} kHz`;
  return `${pretty(hz)} Hz`;
}
function formula(model) {
  const gain = pretty(model.gain);
  const numerator = model.factors.filter(f => f.type === 'zero').map(factorText);
  const denominator = model.factors.filter(f => f.type === 'pole').map(factorText);
  const num = [gain, ...numerator].join(' · ');
  $('formula').textContent = denominator.length ? `H(s) = ${num} / [${denominator.join(' · ')}]` : `H(s) = ${num}`;
}
function factorText(f) {
  const sign = f.side === 'LHP' ? '+' : '−';
  const corner = pretty(2 * Math.PI * f.hz);
  return `(1 ${sign} s/${corner})${f.order > 1 ? `^${f.order}` : ''}`;
}
function svgElement(name, attrs = {}) {
  const el = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function niceStep(span) {
  const raw = Math.max(span / 4, 1e-9);
  const power = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}
function yScale(values) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 5; hi += 5; }
  const pad = (hi - lo) * 0.11;
  lo -= pad; hi += pad;
  const step = niceStep(hi - lo);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}
function drawPlot(svg, key, color, showX) {
  const width = Math.max(280, svg.clientWidth), height = svg.clientHeight || 260, left = 58, right = 32, top = 13, bottom = showX ? 35 : 14;
  const w = width - left - right, h = height - top - bottom;
  const lowLog = Math.log10(currentModel.minHz), highLog = Math.log10(currentModel.maxHz), spanLog = highLog - lowLog;
  const y = yScale(samples.map(s => s[key]));
  const xPos = hz => left + (Math.log10(hz) - lowLog) / spanLog * w;
  const yPos = value => top + (y.hi - value) / (y.hi - y.lo) * h;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();
  const grid = svgElement('g');
  for (let tick = Math.ceil(y.lo / y.step) * y.step; tick <= y.hi + y.step * .01; tick += y.step) {
    const yy = yPos(tick);
    grid.append(svgElement('line', {x1:left,y1:yy,x2:width-right,y2:yy,stroke:'#e8efef','stroke-width':1}));
    const label = svgElement('text',{x:left-10,y:yy+4,'text-anchor':'end',fill:'#91a6a9','font-size':11});
    label.textContent = `${Math.round(tick * 100) / 100}${key === 'phaseDeg' ? '°' : ''}`;
    grid.append(label);
  }
  const firstDecade = Math.ceil(lowLog), lastDecade = Math.floor(highLog);
  for (let decade = firstDecade; decade <= lastDecade; decade++) {
    const hz = 10 ** decade, xx = xPos(hz);
    grid.append(svgElement('line',{x1:xx,y1:top,x2:xx,y2:top+h,stroke:'#e8efef','stroke-width':1}));
    if (showX) { const label = svgElement('text',{x:xx,y:height-10,'text-anchor':'middle',fill:'#91a6a9','font-size':11}); label.textContent = frequencyLabel(hz); grid.append(label); }
  }
  svg.append(grid);
  const cornerGroup = svgElement('g');
  for (const factor of currentModel.factors) {
    if (factor.hz < currentModel.minHz || factor.hz > currentModel.maxHz) continue;
    const xx = xPos(factor.hz);
    cornerGroup.append(svgElement('line',{x1:xx,y1:top,x2:xx,y2:top+h,stroke:factor.type==='zero'?'#4eb5a3':'#eba565','stroke-opacity':.48,'stroke-width':1.3,'stroke-dasharray':'4 5'}));
  }
  svg.append(cornerGroup);
  const points = samples.map(s => `${xPos(s.hz).toFixed(2)},${yPos(s[key]).toFixed(2)}`).join(' ');
  svg.append(svgElement('polyline',{points,fill:'none',stroke:color,'stroke-width':2.7,'stroke-linecap':'round','stroke-linejoin':'round'}));
  if (hoverHz !== null) {
    const xx = xPos(hoverHz), yy = yPos(evaluateBode(currentModel,hoverHz)[key]);
    svg.append(svgElement('line',{x1:xx,y1:top,x2:xx,y2:top+h,stroke:'#8ba3a5','stroke-width':1,'stroke-dasharray':'3 3'}));
    svg.append(svgElement('circle',{cx:xx,cy:yy,r:5,fill:color,stroke:'#fff','stroke-width':2}));
  }
  const target = svgElement('rect',{x:left,y:top,width:w,height:h,fill:'transparent'});
  target.addEventListener('pointermove', event => {
    const box = svg.getBoundingClientRect();
    const relative = (event.clientX - box.left) / box.width * width;
    const fraction = Math.max(0,Math.min(1,(relative-left)/w));
    hoverHz = 10 ** (lowLog + fraction * spanLog);
    updateReadout(); drawBoth();
  });
  target.addEventListener('pointerleave', () => { hoverHz = null; updateReadout(); drawBoth(); });
  svg.append(target);
}
function drawBoth() {
  if (!currentModel) return;
  drawPlot($('magnitudePlot'),'magnitudeDb','#20a88f',false);
  drawPlot($('phasePlot'),'phaseDeg','#e29b61',true);
}
function updateReadout() {
  if (!currentModel) return;
  const hz = hoverHz ?? Math.sqrt(currentModel.minHz * currentModel.maxHz);
  const value = evaluateBode(currentModel,hz);
  $('readHz').textContent = frequencyLabel(hz);
  $('readMag').textContent = `${value.magnitudeDb.toFixed(2)} dB`;
  $('readPhase').textContent = `${value.phaseDeg.toFixed(1)}°`;
}
function update() {
  const model = getModel();
  const errors = validateModel(model);
  $('errors').hidden = !errors.length;
  $('errors').textContent = errors.join(' ');
  if (errors.length) { currentModel = null; $('formula').textContent = 'Enter valid values to plot.'; $('magnitudePlot').replaceChildren(); $('phasePlot').replaceChildren(); return; }
  currentModel = model;
  samples = sampleBode(model);
  if (hoverHz !== null && (hoverHz < model.minHz || hoverHz > model.maxHz)) hoverHz = null;
  formula(model); updateReadout(); drawBoth();
}

for (const id of ['gain','minHz','maxHz']) $(id).addEventListener('input',update);
$('addPole').addEventListener('click',()=>addFactor('pole'));
$('addZero').addEventListener('click',()=>addFactor('zero'));
$('reset').addEventListener('click',()=>applyExample('starter'));
$('factorList').addEventListener('input',event=>{
  const input = event.target.closest('[data-field]');
  if (!input) return;
  const factor = factors.find(f => f.id === Number(input.closest('[data-id]').dataset.id));
  if (!factor) return;
  const field = input.dataset.field;
  factor[field] = field === 'hz' || field === 'order' ? readNumber(input) : input.value;
  if (field === 'type') input.closest('.factor-row').className = `factor-row ${factor.type}`;
  update();
});
$('factorList').addEventListener('change',event=>{ if(event.target.matches('select')) event.target.dispatchEvent(new Event('input',{bubbles:true})); });
$('factorList').addEventListener('click',event=>{
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  factors = factors.filter(f=>f.id!==Number(button.closest('[data-id]').dataset.id));
  renderRows(); update();
});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyExample(button.dataset.preset)));
window.addEventListener('resize', drawBoth);
applyExample('starter');
