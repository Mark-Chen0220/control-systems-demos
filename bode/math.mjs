export function validateModel(model) {
  const errors = [];
  if (!Number.isFinite(model.gain) || model.gain === 0) errors.push('Gain must be a nonzero number.');
  if (!Number.isFinite(model.minHz) || model.minHz <= 0) errors.push('Start frequency must be above 0 Hz.');
  if (!Number.isFinite(model.maxHz) || model.maxHz <= 0) errors.push('End frequency must be above 0 Hz.');
  if (Number.isFinite(model.minHz) && Number.isFinite(model.maxHz) && model.maxHz <= model.minHz) errors.push('End frequency must be higher than start frequency.');
  for (const [index, factor] of model.factors.entries()) {
    if (!['pole', 'zero'].includes(factor.type)) errors.push(`Item ${index + 1} needs a pole or zero.`);
    if (!['LHP', 'RHP'].includes(factor.side)) errors.push(`Item ${index + 1} needs an LHP or RHP side.`);
    if (!Number.isFinite(factor.hz) || factor.hz <= 0) errors.push(`Item ${index + 1} needs a frequency above 0 Hz.`);
    if (!Number.isInteger(factor.order) || factor.order < 1 || factor.order > 20) errors.push(`Item ${index + 1} needs an order from 1 to 20.`);
  }
  return errors;
}

// Each factor is normalized to 1 at DC. RHP/LHP changes the phase sign,
// while pole/zero changes both the magnitude and phase signs.
export function evaluateBode(model, hz) {
  if (!Number.isFinite(hz) || hz <= 0) throw new Error('Frequency must be above 0 Hz.');
  let magnitudeDb = 20 * Math.log10(Math.abs(model.gain));
  let phaseDeg = model.gain < 0 ? 180 : 0;
  for (const factor of model.factors) {
    const ratio = hz / factor.hz;
    const poleSign = factor.type === 'zero' ? 1 : -1;
    const sideSign = factor.side === 'LHP' ? 1 : -1;
    magnitudeDb += poleSign * factor.order * 10 * Math.log10(1 + ratio * ratio);
    phaseDeg += poleSign * sideSign * factor.order * Math.atan(ratio) * 180 / Math.PI;
  }
  return { magnitudeDb, phaseDeg };
}

export function sampleBode(model, count = 601) {
  const low = Math.log10(model.minHz);
  const span = Math.log10(model.maxHz) - low;
  return Array.from({ length: count }, (_, index) => {
    const hz = 10 ** (low + span * index / (count - 1));
    return { hz, ...evaluateBode(model, hz) };
  });
}
