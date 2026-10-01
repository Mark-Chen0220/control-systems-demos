const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };

export function parseTransferFunction(input) {
  const tokens = tokenize(input);
  let index = 0;

  function prefix() {
    const token = tokens[index++];
    if (!token) throw new Error("Enter a transfer function.");
    if (token.kind === "number") return { kind: "number", value: Number(token.value) };
    if (token.kind === "name") {
      if (token.value.toLowerCase() === "s") return { kind: "s" };
      if (token.value.toLowerCase() === "pi") return { kind: "number", value: Math.PI };
      throw new Error(`Unknown name “${token.value}”. Use s, pi, numbers, and operators.`);
    }
    if (token.value === "(" ) {
      const node = expression(0);
      if (tokens[index]?.value !== ")") throw new Error("A closing ) is missing.");
      index++;
      return node;
    }
    if (token.value === "+" || token.value === "-") {
      return { kind: "unary", op: token.value, child: expression(3) };
    }
    throw new Error(`Unexpected “${token.value}”. Check the expression near it.`);
  }

  function expression(minPrecedence) {
    let left = prefix();
    while (index < tokens.length) {
      const op = tokens[index].value;
      const precedence = PRECEDENCE[op];
      if (precedence === undefined || precedence < minPrecedence) break;
      index++;
      const right = expression(op === "^" ? precedence : precedence + 1);
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  const ast = expression(0);
  if (index !== tokens.length) {
    const token = tokens[index];
    if (token.value === "(") throw new Error("Write * before a parenthesis, for example 2*(s+1).");
    if (token.kind === "name") throw new Error("Write * for multiplication, for example 2*s.");
    throw new Error(`Unexpected “${token.value}”. Check parentheses and operators.`);
  }
  return ast;
}

function tokenize(input) {
  const tokens = [];
  let pos = 0;
  const source = String(input).trim();
  if (!source) return tokens;
  while (pos < source.length) {
    const rest = source.slice(pos);
    if (/^\s/.test(rest)) { pos++; continue; }
    const numeric = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (numeric) {
      tokens.push({ kind: "number", value: numeric[0] });
      pos += numeric[0].length;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(rest);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      pos += name[0].length;
      continue;
    }
    if ("+-*/^()".includes(source[pos])) {
      tokens.push({ kind: "operator", value: source[pos] });
      pos++;
      continue;
    }
    throw new Error(`Unsupported character “${source[pos]}” at position ${pos + 1}.`);
  }
  return tokens;
}

function multiply(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
function divide(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  if (d === 0) return [NaN, NaN];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
function integerPower(base, exponent) {
  if (exponent === 0) return [1, 0];
  let n = Math.abs(exponent), result = [1, 0], factor = base;
  while (n > 0) {
    if (n % 2) result = multiply(result, factor);
    factor = multiply(factor, factor);
    n = Math.floor(n / 2);
  }
  return exponent < 0 ? divide([1, 0], result) : result;
}

export function evaluateTransferFunction(ast, omega) {
  function evaluate(node) {
    if (node.kind === "number") return [node.value, 0];
    if (node.kind === "s") return [0, omega];
    if (node.kind === "unary") {
      const value = evaluate(node.child);
      return node.op === "-" ? [-value[0], -value[1]] : value;
    }
    const a = evaluate(node.left);
    const b = evaluate(node.right);
    if (node.op === "+") return [a[0] + b[0], a[1] + b[1]];
    if (node.op === "-") return [a[0] - b[0], a[1] - b[1]];
    if (node.op === "*") return multiply(a, b);
    if (node.op === "/") return divide(a, b);
    if (node.op === "^") {
      if (Math.abs(b[1]) > 1e-12 || !Number.isInteger(b[0]) || Math.abs(b[0]) > 30) {
        throw new Error("Powers must be whole numbers from −30 to 30 (for example s^2).");
      }
      return integerPower(a, b[0]);
    }
    throw new Error("Unsupported operator.");
  }
  return evaluate(ast);
}

export function sampleNyquist(ast, startHz, stopHz, samples) {
  if (!(Number.isFinite(startHz) && startHz > 0 && Number.isFinite(stopHz) && stopHz > startHz)) {
    throw new Error("Choose positive frequencies, with Stop greater than Start.");
  }
  if (!Number.isInteger(samples) || samples < 80 || samples > 3000) {
    throw new Error("Choose 80 to 3000 samples per branch.");
  }
  const positive = [], negative = [];
  const ratio = stopHz / startHz;
  for (let i = 0; i < samples; i++) {
    const f = startHz * Math.pow(ratio, i / (samples - 1));
    const omega = 2 * Math.PI * f;
    const [re, im] = evaluateTransferFunction(ast, omega);
    positive.push({ re, im, f, omega });
  }
  for (let i = samples - 1; i >= 0; i--) {
    const f = startHz * Math.pow(ratio, i / (samples - 1));
    const omega = -2 * Math.PI * f;
    const [re, im] = evaluateTransferFunction(ast, omega);
    negative.push({ re, im, f: -f, omega });
  }
  const finite = point => Number.isFinite(point.re) && Number.isFinite(point.im);
  if (![...positive, ...negative].some(finite)) throw new Error("No finite points in this range. Try a different frequency range.");
  return { positive, negative };
}
