'use strict';

// Lance l'indexeur des revenus à intervalle régulier, dans le processus du
// serveur (une seule instance Railway). Activé par INDEXER_ENABLED=1.
// Ne peut jamais faire planter le serveur : toute erreur, y compris un module
// natif absent, désactive simplement l'indexeur avec un message.

function startRevenueIndexer({ logger = console } = {}) {
  if (process.env.INDEXER_ENABLED !== '1') return null;
  let services;
  try {
    services = require('./services').getRevenueServices();
  } catch (error) {
    logger.warn(`Indexeur des revenus non démarré : ${error.message}`);
    return null;
  }
  const minutes = Math.min(Math.max(parseInt(process.env.INDEXER_INTERVAL_MIN, 10) || 15, 5), 1440);
  const tick = async () => {
    try {
      const result = await services.indexer.runOnce();
      if (result.status !== 'skipped') logger.log(`Indexeur des revenus : ${result.status}${result.errors && result.errors.length ? ` (${result.errors.join(' | ')})` : ''}`);
    } catch (error) {
      logger.warn(`Indexeur des revenus en erreur : ${error.message}`);
    }
  };
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, minutes * 60 * 1000).unref();
  logger.log(`Indexeur des revenus actif (toutes les ${minutes} min).`);
  return services.indexer;
}

module.exports = { startRevenueIndexer };
