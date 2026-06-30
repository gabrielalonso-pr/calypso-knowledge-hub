/**
 * Controlador UI — FX Simulator (Forward FX / FX Spot / FX NDF).
 *
 * ESTADO: `state` es la fuente única de verdad.
 * LOCKS:  Los outputs bloqueables se bloquean al editarlos y se liberan al borrarlos.
 *
 *   fwdRate      bloqueado → despeja rateQuote
 *   fwdPoints    bloqueado → convierte a fwdRate → despeja rateQuote
 *   notionalQuote bloqueado → despeja notionalBase
 *   npv          bloqueado → despeja spotMarket
 *
 * PRODUCTO:
 *   forward → comportamiento completo (CIP, MTM, fórmula)
 *   spot    → sin tasas, sin fwd, value date T+2, flujos simples
 *   ndf     → como forward + sección de fixing y settlement
 */

// ── Formato numérico ───────────────────────────────────────────────────────
function fmt(n, decimals) {
  if (n == null || isNaN(n)) return '';
  return n.toFixed(decimals);
}
const f4  = n => fmt(n, 4);
const f6  = n => fmt(n, 6);
const f2  = n => fmt(n, 2);
const f0  = n => n == null || isNaN(n) ? '' : String(Math.round(n));
const loc = n => n == null || isNaN(n) ? '—' :
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function parseNum(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// ── Estado central ─────────────────────────────────────────────────────────
const state = {
  productType:   'spot',      // 'forward' | 'spot' | 'ndf'
  direction:     'buy',
  currencyPair:  'USDMXN',
  baseCcy:       'USD',
  quoteCcy:      'MXN',
  settleCcy:     'USD',
  notionalBase:  1_000_000,
  tradeDate:     Engine.todayStr(),
  valueDate:     null,
  days:          90,
  spot:          17.00,
  rateBase:      5.00,
  rateQuote:     11.00,
  dayCount:      360,

  // Outputs calculados
  fwdRate:       null,
  fwdPoints:     null,
  notionalQuote: null,
  spotMarket:    17.00,
  npv:           null,

  // NDF
  fixingDate:    null,
  spotFixing:    null,

  // Locks activos (outputs que el usuario ha fijado manualmente)
  locked: new Set(),
};

// ── Referencias DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Warning / error banner ─────────────────────────────────────────────────
function warn(msg) {
  $('warn-msg').textContent = msg;
  $('warn-banner').classList.remove('hidden');
}
function clearWarn() {
  $('warn-banner').classList.add('hidden');
}

// ── DOM helpers ────────────────────────────────────────────────────────────
function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v ?? '';
}

function setOut(id, lockKey, formattedValue) {
  if (state.locked.has(lockKey)) return;
  setVal(id, formattedValue);
}

function markSolved(id) {
  const el = $(id);
  if (el) el.classList.add('input--solved');
}
function clearSolved(id) {
  const el = $(id);
  if (el) el.classList.remove('input--solved');
}

function hint(id, text) {
  const el = $(id);
  if (el) el.textContent = text || '';
}

function show(id) { $(id)?.classList.remove('hidden'); }
function hide(id) { $(id)?.classList.add('hidden'); }

// ── Locks ──────────────────────────────────────────────────────────────────
const MUTUAL_EXCL = { fwdRate: 'fwdPoints', fwdPoints: 'fwdRate' };

function lock(key) {
  if (MUTUAL_EXCL[key]) state.locked.delete(MUTUAL_EXCL[key]);
  state.locked.add(key);
  updateLockUI();
}

function unlock(key) {
  state.locked.delete(key);
  if (key === 'fwdRate' || key === 'fwdPoints') clearSolved('f-rate-quote');
  if (key === 'notionalQuote') clearSolved('f-notional-base');
  if (key === 'npv') clearSolved('f-spot-market');
  updateLockUI();
  recalc();
}

function unlockAll() {
  state.locked.clear();
  ['f-rate-quote', 'f-notional-base', 'f-spot-market'].forEach(clearSolved);
  updateLockUI();
}

function updateLockUI() {
  // Resaltar campos bloqueados con fondo ámbar; sin botón de desbloqueo
  const lockFields = {
    fwdRate:       'f-fwd-rate',
    fwdPoints:     'f-fwd-points',
    notionalQuote: 'f-notional-quote',
    npv:           'f-npv',
  };
  for (const [key, inputId] of Object.entries(lockFields)) {
    $(inputId)?.classList.toggle('price-val--locked', state.locked.has(key));
  }
  // spotMarket: readonly si npv está bloqueado
  const smEl = $('f-spot-market');
  if (smEl) smEl.readOnly = state.locked.has('npv');
}

// ── Visibilidad de secciones según tipo de producto ────────────────────────
function applyProductType(type) {
  state.productType = type;

  // Actualizar botones
  document.querySelectorAll('.ptype-btn').forEach(btn => {
    btn.classList.toggle('ptype-btn--active', btn.dataset.ptype === type);
  });

  const isSpot    = type === 'spot';
  const isForward = type === 'forward';
  const isNDF     = type === 'ndf';

  // Secciones que solo aparecen en forward / NDF
  const hasFwd = isForward || isNDF;
  $('row-fwd-points')?.classList.toggle('hidden', !hasFwd);
  $('row-fwd-rate')?.classList.toggle('hidden',   !hasFwd);
  $('rates-section')?.classList.toggle('hidden',   isSpot);
  $('mtm-card')?.classList.toggle('hidden',        isSpot);
  $('formula-card')?.classList.toggle('hidden',    isSpot);

  // NDF card
  $('ndf-card')?.classList.toggle('hidden', !isNDF);

  // Días: ocultos en Spot (valor fijo T+2)
  $('days-section')?.classList.toggle('hidden', isSpot);

  // Label fecha valor
  $('lbl-value-date').textContent = isSpot ? 'Fecha valor (T+2)' : 'Fecha valor';

  // Textos de cabecera
  const titles = {
    forward: ['Forward FX', 'Compraventa de divisas a precio fijado hoy para liquidación futura · <strong>Covered Interest Rate Parity (CIP)</strong>'],
    spot:    ['FX Spot',    'Compraventa de divisas con liquidación en T+2 · Precio de mercado actual'],
    ndf:     ['FX NDF',     'Non-Deliverable Forward · Sin intercambio de nocionales · Liquidación por diferencia en divisa de settle'],
  };
  $('page-subtitle').textContent = titles[type][0];
  $('product-desc').innerHTML    = titles[type][1];

  // Rellenar pares filtrados por tipo
  rebuildPairSelect(type);
}

// ── Reconstruir select de pares según tipo ─────────────────────────────────
function rebuildPairSelect(type) {
  const config = Loader.get();
  const sel = $('f-pair');
  sel.innerHTML = '';
  const pairs = config.currencyPairs.filter(p => p.products?.includes(type) ?? true);
  pairs.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.id;
    opt.textContent = `${p.base}/${p.quote}`;
    sel.appendChild(opt);
  });
  // Intentar mantener el par actual; si no está disponible, usar el primero
  const available = pairs.find(p => p.id === state.currencyPair);
  if (available) {
    sel.value = state.currencyPair;
  } else {
    sel.value = pairs[0]?.id ?? '';
    state.currencyPair = sel.value;
  }
  applyPair(sel.value);
}

// ── Cálculo central ────────────────────────────────────────────────────────
function recalc() {
  clearWarn();

  if (state.productType === 'spot') {
    recalcSpot();
  } else {
    recalcForwardOrNDF();
  }
}

function recalcSpot() {
  const { spot, notionalBase, direction } = state;

  if (!spot || spot <= 0)               { warn('El Spot Rate debe ser mayor que cero.'); return; }
  if (!notionalBase || notionalBase <= 0) { warn('El Nocional debe ser mayor que cero.'); return; }

  const Nq = Engine.notionalQuote(notionalBase, spot);
  state.notionalQuote = Nq;
  setVal('f-notional-quote', f0(Nq));

  updateCashflow(notionalBase, Nq, direction);
}

function recalcForwardOrNDF() {
  const rb = state.rateBase  / 100;
  const rq = state.rateQuote / 100;
  const { spot, days, dayCount, notionalBase, spotMarket, direction } = state;

  if (!spot || spot <= 0)               { warn('El Spot Rate debe ser mayor que cero.'); return; }
  if (!days || days <= 0)               { warn('Los días al vencimiento deben ser > 0.'); return; }
  if (!notionalBase || notionalBase <= 0) { warn('El Nocional debe ser mayor que cero.'); return; }

  // ── Paso 1: Forward Rate ─────────────────────────────────────────────────
  let F = null;

  if (state.locked.has('fwdRate')) {
    F = state.fwdRate;
    if (!F || F <= 0) { warn('Forward Rate bloqueado tiene valor inválido.'); return; }

    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    if (rq_new !== null) {
      if (rq_new < -0.5 || rq_new > 5) warn(`Tasa ${state.quoteCcy} implícita (${f2(rq_new * 100)}%) está fuera de rango razonable.`);
      state.rateQuote = rq_new * 100;
      setVal('f-rate-quote', f4(state.rateQuote));
      markSolved('f-rate-quote');
    } else {
      warn('No se puede despejar la Tasa cotizada con esos valores.');
    }
    state.fwdPoints = Engine.forwardPoints(F, spot);
    setOut('f-fwd-points', 'fwdPoints', f4(state.fwdPoints));
    hint('hint-fwd-rate',   `Fijado → despeja Tasa ${state.quoteCcy}`);
    hint('hint-fwd-points', '');

  } else if (state.locked.has('fwdPoints')) {
    if (state.fwdPoints == null) { warn('Forward Points no tiene valor válido.'); return; }
    F = spot + state.fwdPoints;
    state.fwdRate = F;
    if (F <= 0) { warn('Forward Points implica un Forward Rate negativo. Inválido.'); return; }

    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    if (rq_new !== null) {
      if (rq_new < -0.5 || rq_new > 5) warn(`Tasa ${state.quoteCcy} implícita (${f2(rq_new * 100)}%) está fuera de rango razonable.`);
      state.rateQuote = rq_new * 100;
      setVal('f-rate-quote', f4(state.rateQuote));
      markSolved('f-rate-quote');
    } else {
      warn('No se puede despejar la Tasa cotizada con esos valores.');
    }
    setOut('f-fwd-rate', 'fwdRate', f4(state.fwdRate));
    hint('hint-fwd-points', `Fijado → despeja Tasa ${state.quoteCcy}`);
    hint('hint-fwd-rate',   '');

  } else {
    F = Engine.forwardRate(spot, rb, rq, days, dayCount);
    if (F === null) { warn('Error en el cálculo del Forward Rate. Revisa los datos de entrada.'); return; }

    state.fwdRate   = F;
    state.fwdPoints = Engine.forwardPoints(F, spot);
    setVal('f-fwd-rate',   f4(state.fwdRate));
    setVal('f-fwd-points', f4(state.fwdPoints));
    clearSolved('f-rate-quote');
    hint('hint-fwd-rate',   '');
    hint('hint-fwd-points', '');
  }

  // ── Paso 2: Nocionales ───────────────────────────────────────────────────
  let Nb, Nq;

  if (state.locked.has('notionalQuote')) {
    Nq = state.notionalQuote;
    if (!Nq || Nq <= 0) { warn('Nocional cotizado bloqueado tiene valor inválido.'); return; }

    Nb = Engine.notionalBase(Nq, F);
    if (Nb !== null) {
      state.notionalBase = Nb;
      setVal('f-notional-base', f0(Nb));
      markSolved('f-notional-base');
      hint('hint-notional-quote', `Fijado → despeja Nocional ${state.baseCcy}`);
    } else {
      warn('No se puede calcular el Nocional base. Verifica el Forward Rate.');
    }
  } else {
    Nb = notionalBase;
    Nq = Engine.notionalQuote(Nb, F);
    state.notionalQuote = Nq;
    setVal('f-notional-quote', f0(Nq));
    clearSolved('f-notional-base');
    hint('hint-notional-quote', '');
  }

  // ── Paso 3: NPV / MTM ────────────────────────────────────────────────────
  if (state.locked.has('npv')) {
    const Smkt = Engine.impliedSpotMarket(state.npv, Nb, F, rb, rq, days, dayCount, direction);
    if (Smkt !== null) {
      state.spotMarket = Smkt;
      setVal('f-spot-market', f4(Smkt));
      markSolved('f-spot-market');
      hint('hint-npv', 'Fijado → despeja Spot mercado');
    } else {
      warn('El NPV ingresado implica un Spot de mercado imposible (negativo o incalculable).');
    }
  } else {
    const SM = state.spotMarket && state.spotMarket > 0 ? state.spotMarket : spot;
    const npv_val = Engine.npv(Nb, SM, F, rb, rq, days, dayCount, direction);
    state.npv = npv_val;
    setVal('f-npv', f2(npv_val));
    clearSolved('f-spot-market');
    hint('hint-npv', '');
  }

  // ── Paso 4: NDF settlement ───────────────────────────────────────────────
  if (state.productType === 'ndf') {
    updateNDFSettlement(Nb, F);
  }

  // ── Paso 5: UI derivada ──────────────────────────────────────────────────
  const N_display_base  = Nb  ?? notionalBase;
  const N_display_quote = Nq  ?? Engine.notionalQuote(N_display_base, F) ?? 0;

  updateCashflow(N_display_base, N_display_quote, direction);
  updateFormula(spot, rb, rq, days, dayCount, F);
  updateNPVColor();
  Dictionary.refreshLive();
}

// ── Fórmula "con tus valores actuales" para el tooltip del diccionario ──────
function getLiveFormula(key) {
  const { spot, rateBase, rateQuote, days, dayCount, fwdRate, fwdPoints,
          notionalBase, notionalQuote, npv, spotMarket, direction, quoteCcy } = state;
  if (state.productType === 'spot') return null;
  const rb = rateBase / 100, rq = rateQuote / 100, t = days / dayCount;

  switch (key) {
    case 'forward_rate':
      return `F = ${f4(spot)} &times; (1 + ${f4(rq)} &times; ${days}/${dayCount}) / (1 + ${f4(rb)} &times; ${days}/${dayCount})<br>` +
             `F = ${f4(spot)} &times; ${f6(1 + rq * t)} / ${f6(1 + rb * t)}<br>` +
             `<strong>F = ${f4(fwdRate)}</strong>`;

    case 'forward_points':
      return `FP = ${f4(fwdRate)} &minus; ${f4(spot)}<br>` +
             `<strong>FP = ${f4(fwdPoints)}</strong>`;

    case 'nocional_cotizada':
      return `N<sub>${quoteCcy}</sub> = ${loc(notionalBase)} &times; ${f4(fwdRate)}<br>` +
             `<strong>N<sub>${quoteCcy}</sub> = ${loc(notionalQuote)} ${quoteCcy}</strong>`;

    case 'npv': {
      const sign = direction === 'buy' ? '+1' : '&minus;1';
      return `NPV = ${sign} &times; ${loc(notionalBase)} &times; [ ${f4(spotMarket)}/(1+${f4(rb)}&times;${t.toFixed(4)}) &minus; ${f4(fwdRate)}/(1+${f4(rq)}&times;${t.toFixed(4)}) ]<br>` +
             `<strong>NPV = ${f2(npv)} ${quoteCcy}</strong>`;
    }

    default:
      return null;
  }
}

// ── NDF: calcular settlement ───────────────────────────────────────────────
function updateNDFSettlement(Nb, Fcontract) {
  const Sf = state.spotFixing;
  const settlEl  = $('ndf-settlement');
  const detailEl = $('ndf-settlement-detail');
  if (!Sf || Sf <= 0 || !Nb || !Fcontract) {
    if (settlEl) { settlEl.textContent = '—'; settlEl.className = 'ndf-settlement'; }
    if (detailEl) detailEl.textContent = 'Ingresa el Spot de fixing para calcular el settlement';
    return;
  }
  const settlBase  = Engine.settlementBase(Nb, Fcontract, Sf, state.direction);
  const settlQuote = Engine.settlementQuote(Nb, Fcontract, Sf, state.direction);
  if (settlBase == null) {
    if (settlEl) { settlEl.textContent = '—'; settlEl.className = 'ndf-settlement'; }
    return;
  }
  const sign = settlBase >= 0 ? '+' : '';
  settlEl.textContent = `${sign}${settlBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${state.settleCcy}`;
  settlEl.className   = 'ndf-settlement ' + (settlBase > 0 ? 'ndf-settlement--positive' : settlBase < 0 ? 'ndf-settlement--negative' : '');

  const signQ = settlQuote >= 0 ? '+' : '';
  detailEl.textContent = `Diferencia en ${state.quoteCcy}: ${signQ}${settlQuote?.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} → convertido a ${state.settleCcy} al spot de fixing (${f4(Sf)})`;
}

// ── Cashflow visual ────────────────────────────────────────────────────────
function updateCashflow(Nb, Nq, dir) {
  const isSpot = state.productType === 'spot';
  const isNDF  = state.productType === 'ndf';
  const isBuy  = dir === 'buy';

  if (isNDF) {
    // NDF: no hay intercambio de nocionales, se muestra como referencia
    $('cf-pay-amount').textContent  = loc(isBuy ? Nq : Nb) + '*';
    $('cf-pay-ccy').textContent     = isBuy ? state.quoteCcy : state.baseCcy;
    $('cf-recv-amount').textContent = loc(isBuy ? Nb : Nq) + '*';
    $('cf-recv-ccy').textContent    = isBuy ? state.baseCcy  : state.quoteCcy;
  } else {
    $('cf-pay-amount').textContent  = loc(isBuy ? Nq : Nb);
    $('cf-pay-ccy').textContent     = isBuy ? state.quoteCcy : state.baseCcy;
    $('cf-recv-amount').textContent = loc(isBuy ? Nb : Nq);
    $('cf-recv-ccy').textContent    = isBuy ? state.baseCcy  : state.quoteCcy;
  }
}

// ── Fórmula ────────────────────────────────────────────────────────────────
function updateFormula(S, rb, rq, d, dc, F) {
  const b = state.baseCcy, q = state.quoteCcy;
  $('formula-symbolic').innerHTML =
    `F = S &times; (1 + r<sub>${q}</sub> &times; d/${dc}) / (1 + r<sub>${b}</sub> &times; d/${dc})`;

  const t = d / dc;
  $('formula-numeric').innerHTML =
    `${f4(F)} = ${f4(S)} &times; ` +
    `(1 + ${f4(rq)} &times; ${d}/${dc}) / (1 + ${f4(rb)} &times; ${d}/${dc})` +
    `&nbsp;&nbsp;=&nbsp;&nbsp;` +
    `${f4(S)} &times; ${f6(1 + rq * t)} / ${f6(1 + rb * t)}`;
}

// ── Color NPV ──────────────────────────────────────────────────────────────
function updateNPVColor() {
  const el = $('f-npv');
  if (!el) return;
  el.classList.toggle('price-val--positive', (state.npv ?? 0) > 0.5);
  el.classList.toggle('price-val--negative', (state.npv ?? 0) < -0.5);
}

// ── Sincronización días ↔ fechas ───────────────────────────────────────────
function applyDays(n) {
  state.days = Math.round(n);
  state.valueDate = Engine.addDays(state.tradeDate, state.days);
  setVal('f-value-date', state.valueDate);
  // NDF: fixing date = value date - 2 días por convención
  if (state.productType === 'ndf') {
    state.fixingDate = Engine.addDays(state.valueDate, -2);
    setVal('f-fixing-date', state.fixingDate);
  }
}

function applyDatesCalc() {
  const d = Engine.daysBetween(state.tradeDate, state.valueDate);
  if (d !== null && d > 0) {
    state.days = d;
    setVal('f-days', f0(d));
  } else {
    warn('La fecha valor debe ser posterior a la fecha trade.');
  }
}

// ── Aplicar par de divisas ─────────────────────────────────────────────────
function applyPair(pairId) {
  const pair = Loader.getPair(pairId);
  if (!pair) return;
  state.currencyPair = pairId;
  state.baseCcy      = pair.base;
  state.quoteCcy     = pair.quote;
  state.settleCcy    = pair.settleCcy ?? pair.base;
  state.spot         = pair.spotDefault;
  state.spotMarket   = pair.spotDefault;
  state.spotFixing   = null;
  state.rateBase     = pair.rateBaseDefault;
  state.rateQuote    = pair.rateQuoteDefault;

  setVal('f-spot',        f4(pair.spotDefault));
  setVal('f-spot-market', f4(pair.spotDefault));
  setVal('f-rate-base',   f4(pair.rateBaseDefault));
  setVal('f-rate-quote',  f4(pair.rateQuoteDefault));
  setVal('f-spot-fixing', '');

  document.querySelectorAll('#lbl-base').forEach(el => el.textContent  = pair.base);
  document.querySelectorAll('#lbl-quote').forEach(el => el.textContent = pair.quote);
  $('lbl-rate-base').textContent   = pair.base;
  $('lbl-rate-quote').textContent  = pair.quote;
  $('lbl-npv-ccy').textContent     = pair.quote;
  $('lbl-pair-inline').textContent = `(${pair.base}/${pair.quote})`;
  $('lbl-ndf-pair').textContent    = `${pair.base}/${pair.quote}`;
  $('lbl-settle-ccy').textContent  = state.settleCcy;

  // Reset NDF settlement
  const settlEl = $('ndf-settlement');
  if (settlEl) { settlEl.textContent = '—'; settlEl.className = 'ndf-settlement'; }
  const detailEl = $('ndf-settlement-detail');
  if (detailEl) detailEl.textContent = '';
}

// ── Dirección del ticket ───────────────────────────────────────────────────
function applyDirection(dir) {
  state.direction = dir;
  const ticket = $('ticket');
  ticket.classList.toggle('ticket--buy',  dir === 'buy');
  ticket.classList.toggle('ticket--sell', dir === 'sell');
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.classList.toggle('dir-btn--active', btn.dataset.dir === dir);
  });
}

// ── bindOutput: editar un output lo bloquea; borrarlo lo libera ────────────
function bindOutput(id, lockKey, parseAndStore) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('focus', () => el.select?.());
  el.addEventListener('input', e => {
    const raw = e.target.value.trim();
    if (raw === '') {
      // Campo borrado → liberar lock
      unlock(lockKey);
      return;
    }
    const v = parseNum(raw);
    if (v == null) return;
    parseAndStore(v);
    lock(lockKey);
    recalc();
  });
  el.addEventListener('blur', e => {
    // Si queda vacío al salir → unlock
    if (e.target.value.trim() === '') unlock(lockKey);
  });
}

// ── Inicialización ─────────────────────────────────────────────────────────
async function init() {
  const config = await Loader.load('forward-fx');
  await Dictionary.load();
  Dictionary.init();
  Dictionary.setLiveProvider(getLiveFormula);

  state.valueDate  = Engine.addDays(state.tradeDate, state.days);
  state.fixingDate = Engine.addDays(state.valueDate, -2);

  // Aplicar tipo de producto inicial (construye el select de pares)
  applyProductType(state.productType);

  // Valores iniciales en DOM
  applyDirection(state.direction);
  setVal('f-notional-base', f0(state.notionalBase));
  setVal('f-trade-date',    state.tradeDate);
  setVal('f-value-date',    state.valueDate);
  setVal('f-days',          f0(state.days));
  setVal('f-daycount',      String(state.dayCount));
  setVal('f-spot-market',   f4(state.spotMarket));
  setVal('f-fixing-date',   state.fixingDate ?? '');

  recalc();

  // ── Event listeners ────────────────────────────────────────────────────

  // Selector de tipo de producto
  $('ptype-bar').addEventListener('click', e => {
    const btn = e.target.closest('.ptype-btn');
    if (!btn) return;
    const type = btn.dataset.ptype;
    if (type === state.productType) return;
    unlockAll();
    applyProductType(type);
    recalc();
  });

  // Dirección
  $('dir-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.dir-btn');
    if (!btn) return;
    applyDirection(btn.dataset.dir);
    recalc();
  });

  // Par de divisas
  $('f-pair').addEventListener('change', e => {
    unlockAll();
    applyPair(e.target.value);
    recalc();
  });

  // Nocional base
  $('f-notional-base').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.notionalBase = v; recalc(); }
  });

  // Fecha trade
  $('f-trade-date').addEventListener('change', e => {
    state.tradeDate = e.target.value;
    if (state.productType === 'spot') {
      state.valueDate = Engine.addDays(state.tradeDate, 2);
      setVal('f-value-date', state.valueDate);
    } else {
      applyDatesCalc();
    }
    recalc();
  });

  // Fecha valor
  $('f-value-date').addEventListener('change', e => {
    state.valueDate = e.target.value;
    if (state.productType !== 'spot') {
      applyDatesCalc();
      if (state.productType === 'ndf') {
        state.fixingDate = Engine.addDays(state.valueDate, -2);
        setVal('f-fixing-date', state.fixingDate);
      }
    }
    recalc();
  });

  // Días
  $('f-days').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { applyDays(v); recalc(); }
  });

  // Spot
  $('f-spot').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.spot = v; recalc(); }
  });

  // Tasa base
  $('f-rate-base').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateBase = v; recalc(); }
  });

  // Tasa cotizada
  $('f-rate-quote').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateQuote = v; recalc(); }
  });

  // Convención días
  $('f-daycount').addEventListener('change', e => {
    state.dayCount = parseInt(e.target.value, 10);
    recalc();
  });

  // ── Outputs bloqueables ──────────────────────────────────────────────────
  bindOutput('f-fwd-rate',       'fwdRate',       v => { state.fwdRate        = v; });
  bindOutput('f-fwd-points',     'fwdPoints',     v => { state.fwdPoints      = v; });
  bindOutput('f-notional-quote', 'notionalQuote', v => { state.notionalQuote  = v; });
  bindOutput('f-npv',            'npv',           v => { state.npv            = v; });

  // Spot mercado (libre, no bloquea)
  $('f-spot-market').addEventListener('focus', () => $('f-spot-market').select?.());
  $('f-spot-market').addEventListener('input', e => {
    if (state.locked.has('npv')) return;
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.spotMarket = v; recalc(); }
  });

  // NDF: fecha de fixing
  $('f-fixing-date').addEventListener('change', e => {
    state.fixingDate = e.target.value;
    recalc();
  });

  // NDF: spot de fixing
  $('f-spot-fixing').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    state.spotFixing = (v != null && v > 0) ? v : null;
    recalc();
  });

  // ── Reset ────────────────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    unlockAll();
    clearWarn();
    const config = Loader.get();
    state.direction    = config.defaults.direction;
    state.notionalBase = config.defaults.notionalBase;
    state.days         = config.defaults.days;
    state.dayCount     = config.defaults.dayCount;
    state.tradeDate    = Engine.todayStr();
    state.valueDate    = Engine.addDays(state.tradeDate, state.days);
    state.fixingDate   = Engine.addDays(state.valueDate, -2);
    state.spotFixing   = null;

    const pair = Loader.getPair(state.currencyPair);
    state.spotMarket = pair?.spotDefault ?? state.spot;

    applyDirection(state.direction);
    setVal('f-notional-base', f0(state.notionalBase));
    setVal('f-days',          f0(state.days));
    setVal('f-daycount',      String(state.dayCount));
    setVal('f-trade-date',    state.tradeDate);
    setVal('f-value-date',    state.valueDate);
    setVal('f-spot-market',   f4(state.spotMarket));
    setVal('f-spot-fixing',   '');
    setVal('f-fixing-date',   state.fixingDate ?? '');
    applyPair(state.currencyPair);
    recalc();
  });
}

document.addEventListener('DOMContentLoaded', init);
