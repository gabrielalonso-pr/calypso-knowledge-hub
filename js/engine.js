/**
 * Motor de cálculo puro para Forward FX.
 * Todas las funciones son puras (sin efectos en DOM).
 * Tasas se reciben como decimales (0.05 = 5%).
 * Fórmula base: Covered Interest Rate Parity (CIP)
 *   F = S × (1 + r_q × t) / (1 + r_b × t)   donde t = days / dayCount
 */
const Engine = {

  // ── Forward Rate ───────────────────────────────────────────────────────────

  forwardRate(S, rb, rq, days, dc) {
    const t = days / dc;
    return S * (1 + rq * t) / (1 + rb * t);
  },

  forwardPoints(F, S) {
    return F - S;
  },

  // ── Despejes de CIP ────────────────────────────────────────────────────────

  // Dado F, despejar tasa de la moneda cotizada (r_q)
  impliedRateQuote(F, S, rb, days, dc) {
    const t = days / dc;
    return ((F / S) * (1 + rb * t) - 1) / t;
  },

  // Dado F, despejar tasa de la moneda base (r_b)
  impliedRateBase(F, S, rq, days, dc) {
    const t = days / dc;
    return ((S / F) * (1 + rq * t) - 1) / t;
  },

  // Dado F, despejar spot (S)
  impliedSpot(F, rb, rq, days, dc) {
    const t = days / dc;
    return F * (1 + rb * t) / (1 + rq * t);
  },

  // Dado F, despejar días
  // F(1 + rb·t) = S(1 + rq·t)  =>  t = (S - F) / (F·rb - S·rq)
  impliedDays(F, S, rb, rq, dc) {
    const den = F * rb - S * rq;
    if (Math.abs(den) < 1e-12) return null;
    return ((S - F) / den) * dc;
  },

  // ── Nocionales ────────────────────────────────────────────────────────────

  notionalQuote(notionalBase, F) {
    return notionalBase * F;
  },

  notionalBase(notionalQuote, F) {
    return notionalQuote / F;
  },

  // ── NPV (Mark-to-Market) ──────────────────────────────────────────────────
  //
  // Valora el contrato forward usando un spot de mercado actual (puede diferir
  // del spot original). Para posición larga (buy base):
  //   NPV = N_base × [ S_mkt / (1 + rb·t)  −  F_contract / (1 + rq·t) ]
  //
  // Al inicio S_mkt = S_trade → NPV = 0 por construcción (precio justo).

  npv(notionalBase, spotMarket, fContract, rb, rq, days, dc, direction) {
    const t = days / dc;
    const pv_base  = spotMarket / (1 + rb * t);   // PV de recibir base, en cotizada
    const pv_quote = fContract  / (1 + rq * t);   // PV de pagar cotizada, por unidad base
    const sign = direction === 'buy' ? 1 : -1;
    return sign * notionalBase * (pv_base - pv_quote);
  },

  // Despejar S_mkt dado NPV
  impliedSpotMarket(npv, notionalBase, fContract, rb, rq, days, dc, direction) {
    const t = days / dc;
    const sign = direction === 'buy' ? 1 : -1;
    // npv = sign × N × (S/(1+rb·t) − F/(1+rq·t))
    // S = ( npv/(sign·N) + F/(1+rq·t) ) × (1+rb·t)
    const S_disc = npv / (sign * notionalBase) + fContract / (1 + rq * t);
    return S_disc * (1 + rb * t);
  },

  // ── Fechas ────────────────────────────────────────────────────────────────

  daysBetween(d1, d2) {
    return Math.round((new Date(d2) - new Date(d1)) / 86_400_000);
  },

  addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + Math.round(n));
    return d.toISOString().slice(0, 10);
  },

  todayStr() {
    return new Date().toISOString().slice(0, 10);
  },
};
