// One Euro filter (Casiez et al.): heavy smoothing when still, little lag when moving.
// Values are filtered per component; time is in milliseconds.
export class OneEuro {
  private x: number[] = [];
  private dx: number[] = [];
  private last = -1;
  private minCutoff: number; private beta: number; private dCutoff: number;
  constructor(minCutoff = 1.0, beta = 0.3, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; }
  reset() { this.x = []; this.dx = []; this.last = -1; }
  filter(values: number[], now: number): number[] {
    const dt = this.last < 0 ? 0 : (now - this.last) / 1000;
    this.last = now;
    if (!this.x.length || this.x.length !== values.length || dt <= 0 || dt > 0.5) {
      this.x = values.slice(); this.dx = values.map(() => 0);
      return this.x.slice();
    }
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const ad = alpha(this.dCutoff);
    for (let i = 0; i < values.length; i++) {
      const rate = (values[i] - this.x[i]) / dt;
      this.dx[i] += ad * (rate - this.dx[i]);
      this.x[i] += alpha(this.minCutoff + this.beta * Math.abs(this.dx[i])) * (values[i] - this.x[i]);
    }
    return this.x.slice();
  }
}
