/**
 * Motor de cálculo puro — Forward FX.
 * Covered Interest Rate Parity (CIP):  F = S × (1 + r_q × t) / (1 + r_b × t)
 * Todas las funciones devuelven null cuando el resultado es inválido.
 * Tasas se reciben como decimales (0.05 = 5%).
 */
const Engine = (() => {

  // Devuelve null si el resultado no es un número finito
  function safe(n) {
    return (n !== null && n !== undefined && isFinite(n) && !isNaN(n)) ? n : null;
  }

  // Valida que todos los argumentos son números finitos positivos (o no negativos)
  function ok(...args) {
    return args.every(v => v !== null && v !== undefined && isFinite(v) && !isNaN(v));
  }

  return {

    // ── Forward Rate ────────────────────────────────────────────────────────
    forwardRate(S, rb, rq, days, dc) {
      if (!ok(S, rb, rq, days, dc) || S <= 0 || days <= 0 || dc <= 0) return null;
      const t = days / dc;
      const denom = 1 + rb * t;
      if (Math.abs(denom) < 1e-12) return null;
      return safe(S * (1 + rq * t) / denom);
    },

    forwardPoints(F, S) {
      if (!ok(F, S)) return null;
      return safe(F - S);
    },

    // ── Despejes algebraicos de CIP ─────────────────────────────────────────

    // Dado F, despejar tasa cotizada (r_q)
    // r_q = [ (F/S) × (1 + rb×t) − 1 ] / t
    impliedRateQuote(F, S, rb, days, dc) {
      if (!ok(F, S, rb, days, dc) || S <= 0 || F <= 0 || days <= 0 || dc <= 0) return null;
      const t = days / dc;
      if (Math.abs(t) < 1e-12) return null;
      return safe(((F / S) * (1 + rb * t) - 1) / t);
    },

    // Dado F, despejar tasa base (r_b)
    // r_b = [ (S/F) × (1 + rq×t) − 1 ] / t
    impliedRateBase(F, S, rq, days, dc) {
      if (!ok(F, S, rq, days, dc) || S <= 0 || F <= 0 || days <= 0 || dc <= 0) return null;
      const t = days / dc;
      if (Math.abs(t) < 1e-12) return null;
      return safe(((S / F) * (1 + rq * t) - 1) / t);
    },

    // Dado F, despejar spot
    // S = F × (1 + rb×t) / (1 + rq×t)
    impliedSpot(F, rb, rq, days, dc) {
      if (!ok(F, rb, rq, days, dc) || F <= 0 || days <= 0 || dc <= 0) return null;
      const t = days / dc;
      const denom = 1 + rq * t;
      if (Math.abs(denom) < 1e-12) return null;
      return safe(F * (1 + rb * t) / denom);
    },

    // Dado F, despejar días
    // t = (S − F) / (F×rb − S×rq)   →   days = t × dc
    impliedDays(F, S, rb, rq, dc) {
      if (!ok(F, S, rb, rq, dc) || S <= 0 || F <= 0 || dc <= 0) return null;
      const den = F * rb - S * rq;
      if (Math.abs(den) < 1e-12) return null;  // r_b ≈ r_q: indeterminado
      const t = (S - F) / den;
      return safe(t * dc);
    },

    // ── Nocionales ──────────────────────────────────────────────────────────

    notionalQuote(Nb, F) {
      if (!ok(Nb, F) || F <= 0 || Nb <= 0) return null;
      return safe(Nb * F);
    },

    notionalBase(Nq, F) {
      if (!ok(Nq, F) || F <= 0 || Nq <= 0) return null;
      return safe(Nq / F);
    },

    // ── NPV (Mark-to-Market) ────────────────────────────────────────────────
    //
    // Para posición larga (buy base):
    //   NPV = N_base × [ S_mkt/(1+rb·t)  −  F_contract/(1+rq·t) ]
    //
    // Al inicio S_mkt = S_trade, y por construcción del precio CIP:
    //   S/(1+rb·t) = F/(1+rq·t)  →  NPV = 0
    //
    npv(Nb, Smkt, Fc, rb, rq, days, dc, dir) {
      if (!ok(Nb, Smkt, Fc, rb, rq, days, dc) || Nb <= 0 || Smkt <= 0 || Fc <= 0 || days <= 0) return null;
      const t = days / dc;
      const pv_base  = Smkt / (1 + rb * t);
      const pv_quote = Fc   / (1 + rq * t);
      const sign = dir === 'buy' ? 1 : -1;
      return safe(sign * Nb * (pv_base - pv_quote));
    },

    // Despejar S_mkt desde NPV:
    // S_mkt = [ npv/(sign×Nb) + Fc/(1+rq·t) ] × (1+rb·t)
    impliedSpotMarket(npv, Nb, Fc, rb, rq, days, dc, dir) {
      if (!ok(npv, Nb, Fc, rb, rq, days, dc) || Nb <= 0 || Fc <= 0 || days <= 0) return null;
      const t = days / dc;
      const sign = dir === 'buy' ? 1 : -1;
      const S_disc = npv / (sign * Nb) + Fc / (1 + rq * t);
      const result = S_disc * (1 + rb * t);
      return result > 0 ? safe(result) : null;  // spot nunca puede ser negativo
    },

    // ── NDF Settlement ──────────────────────────────────────────────────────
    //
    // Al vencimiento no hay intercambio de nocionales.
    // Se paga/recibe la diferencia entre el Forward pactado y el Spot de fixing,
    // convertida a la divisa de liquidación (normalmente USD = moneda base).
    //
    // Para BUY base (USD):
    //   Settlement_quote = Nb × (S_fixing − F_contract)
    //   Settlement_USD   = Settlement_quote / S_fixing   = Nb × (1 − F/S_fixing)
    //
    // Si positivo → contraparte paga al comprador (ganó). Negativo → comprador paga.
    //
    settlementQuote(Nb, Fcontract, Sfixing, dir) {
      if (!ok(Nb, Fcontract, Sfixing) || Nb <= 0 || Fcontract <= 0 || Sfixing <= 0) return null;
      const sign = dir === 'buy' ? 1 : -1;
      return safe(sign * Nb * (Sfixing - Fcontract));
    },

    settlementBase(Nb, Fcontract, Sfixing, dir) {
      if (!ok(Nb, Fcontract, Sfixing) || Nb <= 0 || Fcontract <= 0 || Sfixing <= 0) return null;
      const sign = dir === 'buy' ? 1 : -1;
      return safe(sign * Nb * (Sfixing - Fcontract) / Sfixing);
    },

    // ── Fechas ──────────────────────────────────────────────────────────────

    daysBetween(d1, d2) {
      if (!d1 || !d2) return null;
      const diff = new Date(d2) - new Date(d1);
      if (isNaN(diff)) return null;
      return Math.round(diff / 86_400_000);
    },

    addDays(dateStr, n) {
      if (!dateStr || !ok(n)) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + Math.round(n));
      return d.toISOString().slice(0, 10);
    },

    todayStr() {
      return new Date().toISOString().slice(0, 10);
    },
  };
})();
