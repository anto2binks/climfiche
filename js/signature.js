// FrigoFiche — pavé de signature au doigt (partagé par la fiche Cerfa et le bon d'intervention).

// Épaisseur du trait proportionnelle à la largeur du canevas (et non à l'écran) :
// 0,9 % de la largeur, soit environ 3 px sur un canevas de 340 px.
const EPAISSEUR_RELATIVE = 0.009;
export class PaveSignature {
  constructor(canvas) {
    this.canvas = canvas;
    this.traits = [];
    this.trait = null;
    canvas.addEventListener('pointerdown', (e) => this.debut(e));
    canvas.addEventListener('pointermove', (e) => this.deplacer(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, () => { this.trait = null; }));
    new ResizeObserver(() => this.redimensionner()).observe(canvas);
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  debut(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.trait = [this.point(e)];
    this.traits.push(this.trait);
    this.dessiner();
  }
  deplacer(e) {
    if (!this.trait) return;
    e.preventDefault();
    const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evts) this.trait.push(this.point(ev));
    this.dessiner();
  }
  redimensionner() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dessiner();
  }
  get epaisseur() { return this.canvas.getBoundingClientRect().width * EPAISSEUR_RELATIVE || 3; }
  static tracer(ctx, traits, echelle, epaisseur, dx = 0, dy = 0) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a2a6b'; ctx.fillStyle = '#0a2a6b';
    ctx.lineWidth = epaisseur * echelle;
    for (const t of traits) {
      ctx.beginPath();
      if (t.length === 1) { ctx.arc((t[0][0] - dx) * echelle, (t[0][1] - dy) * echelle, (epaisseur / 2) * echelle, 0, 7); ctx.fill(); continue; }
      t.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - dx) * echelle, (y - dy) * echelle));
      ctx.stroke();
    }
  }
  dessiner() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    PaveSignature.tracer(ctx, this.traits, this.canvas.width / (this.canvas.getBoundingClientRect().width || 1), this.epaisseur);
  }
  get vide() { return this.traits.length === 0; }
  effacer() { this.traits = []; this.dessiner(); }
  /** Tracé pour le PDF : copie des traits (coordonnées du canevas). */
  trace() {
    return this.vide ? null : { traits: this.traits.map((t) => t.map((p) => [p[0], p[1]])) };
  }
  /** Aperçu PNG recadré sur l'encre (récapitulatif). */
  png() {
    if (this.vide) return null;
    const pts = this.traits.flat();
    const marge = this.epaisseur;
    const x0 = Math.min(...pts.map((p) => p[0])) - marge, y0 = Math.min(...pts.map((p) => p[1])) - marge;
    const x1 = Math.max(...pts.map((p) => p[0])) + marge, y1 = Math.max(...pts.map((p) => p[1])) + marge;
    const echelle = 3;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((x1 - x0) * echelle));
    c.height = Math.max(1, Math.ceil((y1 - y0) * echelle));
    PaveSignature.tracer(c.getContext('2d'), this.traits, echelle, this.epaisseur, x0, y0);
    return c.toDataURL('image/png');
  }
}
