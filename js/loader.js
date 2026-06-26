/**
 * Carga la configuración del producto activo y expone los datos
 * para que ui.js los consuma al inicializar.
 */
const Loader = (() => {
  let config = null;

  async function load(productId) {
    const res = await fetch(`config/products/${productId}.json`);
    config = await res.json();
    return config;
  }

  function get() { return config; }

  function getPair(pairId) {
    return config.currencyPairs.find(p => p.id === pairId) || config.currencyPairs[0];
  }

  return { load, get, getPair };
})();
