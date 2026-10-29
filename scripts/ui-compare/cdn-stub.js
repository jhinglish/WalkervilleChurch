window.jspdf = { jsPDF: class {
  constructor() { this.ops = []; window.__pdf = this; }
  setFont(...a) { this.ops.push(['font', ...a]); return this; }
  setFontSize(n) { this.ops.push(['size', n]); return this; }
  text(t, x, y) { this.ops.push(['text', t, x, y]); return this; }
  splitTextToSize(t, w) { return String(t).match(/.{1,30}/g) || []; }
  output() { return new Blob(['pdf']); }
} };
