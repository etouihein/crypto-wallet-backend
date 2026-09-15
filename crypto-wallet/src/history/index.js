'use strict';

// Sources de l'historique des transactions (écran « Activité » de l'app).
//
// Etherscan V2 a retiré BNB Chain, Optimism et Base de son offre gratuite
// (« Free API access is not supported for this chain », revérifié chaîne par
// chaîne le 16/09/2026) : sur ces trois réseaux /tx/history répondait 500 et
// l'écran Activité restait vide. Chaque réseau a donc sa source :
//
//   - Ethereum, Polygon, Arbitrum : Etherscan V2, inchangé, avec Blockscout en
//     secours si Etherscan refuse (quota, clé, panne) ;
//   - Optimism, Base : Blockscout. Son API « compatible Etherscan » renvoie
//     exactement les mêmes noms de champs (hash, from, to, value, timeStamp,
//     gasUsed, gasPrice, isError, tokenSymbol, tokenDecimal), donc la mise en
//     forme de la route n'a pas bougé d'une ligne ;
//   - BNB Chain : NodeReal, qu'aucune instance Blockscout ne couvre (bsc.,
//     bnb. et binance.blockscout.com répondent 404) et que Routescan ne sert
//     pas non plus. nr_getAssetTransfers accepte une requête sans plage de
//     blocs — la limite de 2 000 000 blocs ne vaut que pour une plage
//     explicite, soit 10 jours seulement à 0,45 s/bloc — et fournit déjà
//     gasUsed, gasPrice et receiptsStatus : les frais de gaz payés et les
//     transactions échouées sont connus sans appel supplémentaire.
//
// Toutes les sources rendent la même chose : deux listes brutes au format
// Etherscan, { native, tokens }. La route reste seule responsable de la mise
// en forme envoyée à l'app.

const ETHERSCAN_CHAIN_IDS = { ethereum: 1, bsc: 56, polygon: 137, arbitrum: 42161, optimism: 10, base: 8453 };

const BLOCKSCOUT_HOSTS = {
  ethereum: 'https://eth.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
  // optimism.blockscout.com répond 301 vers explorer.optimism.io (l'explorateur
  // officiel, lui aussi propulsé par Blockscout) : on vise la destination
  // directement pour éviter un aller-retour à chaque appel.
  optimism: 'https://explorer.optimism.io',
  base: 'https://base.blockscout.com',
};

// Source principale par réseau. Un réseau absent de cette table (sepolia...)
// garde exactement le comportement d'avant : Etherscan, chainid 1 par défaut.
const PRIMARY_SOURCE = {
  ethereum: 'etherscan',
  polygon: 'etherscan',
  arbitrum: 'etherscan',
  optimism: 'blockscout',
  base: 'blockscout',
  bsc: 'nodereal',
};

function createHistorySources({ fetchImpl, env = process.env, logger = console, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retries = 3 } = {}) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);

  // Les explorateurs publics limitent le débit : un 429 est arrivé en essai
  // réel sur Optimism. On réessaie, en espaçant, plutôt que de renvoyer une
  // erreur à l'app pour un simple à-coup. Une vraie erreur (404, paramètre
  // refusé) remonte tout de suite, sans réessai inutile.
  async function getJson(url) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) await sleep(300 * attempt);
      const response = await doFetch(url, { headers: { accept: 'application/json' } });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }
    throw lastError;
  }

  // Etherscan et Blockscout partagent ce format. status "0" accompagné de
  // « No transactions found » n'est pas une erreur : c'est une adresse sans
  // aucune transaction, donc une liste vide.
  function readList(data, label) {
    if (Array.isArray(data.result)) return data.result;
    if (String(data.status) === '0' && /no .*(transactions|transfers).* found/i.test(String(data.message))) return [];
    throw new Error(`${label} : ${data.result || data.message || 'reponse inattendue'}`);
  }

  // Paramètres identiques à ceux d'avant, y compris endblock=99999999 :
  // Etherscan ne s'en sert pas comme d'un vrai plafond (Arbitrum, bloc
  // 505 000 000, renvoie bien ses transactions de 2026), et on ne change pas
  // une requête qui marche sur les trois réseaux qu'il couvre encore.
  async function etherscan(network, address, limit) {
    const apiKey = env.ETHERSCAN_API_KEY;
    if (!apiKey) throw new Error('ETHERSCAN_API_KEY manquante dans .env');
    const chainid = ETHERSCAN_CHAIN_IDS[network] || ETHERSCAN_CHAIN_IDS.ethereum;
    const base = { chainid, address, startblock: 0, endblock: 99999999, page: 1, offset: limit, sort: 'desc', apikey: apiKey, module: 'account' };
    const call = async (action) => readList(await getJson(`https://api.etherscan.io/v2/api?${new URLSearchParams({ ...base, action })}`), `Etherscan ${action}`);
    const [native, tokens] = await Promise.all([call('txlist'), call('tokentx')]);
    return { native, tokens, source: 'etherscan' };
  }

  // Aucune borne de blocs ici, volontairement. L'appel Etherscan historique
  // envoie endblock=99999999 et Etherscan s'en accommode, mais Blockscout
  // l'applique à la lettre : sur Optimism, dont la chaîne en est au bloc
  // 156 000 000, cette borne masquait la TOTALITÉ de l'historique (0 résultat),
  // et sur Arbitrum (bloc 505 000 000) elle le figeait à juin 2023. Vérifié le
  // 16/09/2026 : la même requête sans borne renvoie bien les transactions
  // récentes. Sans borne, le défaut des deux API est « toute la chaîne ».
  async function blockscoutLegacy(network, address, limit) {
    const host = BLOCKSCOUT_HOSTS[network];
    if (!host) throw new Error(`Blockscout ne couvre pas le reseau ${network}`);
    const apiKey = env.BLOCKSCOUT_API_KEY;
    const base = { module: 'account', address, page: 1, offset: limit, sort: 'desc', ...(apiKey ? { apikey: apiKey } : {}) };
    const call = async (action) => readList(await getJson(`${host}/api?${new URLSearchParams({ ...base, action })}`), `Blockscout ${action}`);
    const [native, tokens] = await Promise.all([call('txlist'), call('tokentx')]);
    return { native, tokens, source: 'blockscout' };
  }

  const isoToSeconds = (v) => String(Math.floor(Date.parse(v) / 1000) || 0);

  // Secours sur la même instance : l'API REST v2. Constaté le 16/09/2026,
  // l'ancienne API /api est bridée bien plus tôt que /api/v2 — 429 sur l'une
  // et 200 sur l'autre au même instant, depuis la même adresse. Optimism et
  // Base n'ont aucune autre source possible : Etherscan les refuse en offre
  // gratuite et Routescan répond « chain not supported ». Une seule différence
  // assumée : les transferts de jetons de v2 ne portent pas le gaz, donc les
  // frais de ces lignes valent 0 tant que l'API classique ne revient pas.
  async function blockscoutRest(network, address, limit) {
    const host = BLOCKSCOUT_HOSTS[network];
    if (!host) throw new Error(`Blockscout ne couvre pas le reseau ${network}`);
    const items = async (path) => {
      const data = await getJson(`${host}/api/v2/addresses/${address}/${path}`);
      return Array.isArray(data.items) ? data.items.slice(0, limit) : [];
    };
    const [rawNative, rawTokens] = await Promise.all([items('transactions'), items('token-transfers')]);
    const native = rawNative.map((t) => ({
      hash: String(t.hash || ''),
      from: String((t.from && t.from.hash) || ''),
      to: String((t.to && t.to.hash) || ''),
      value: String(t.value != null ? t.value : '0'),
      timeStamp: isoToSeconds(t.timestamp),
      gasUsed: String(t.gas_used != null ? t.gas_used : '0'),
      gasPrice: String(t.gas_price != null ? t.gas_price : '0'),
      isError: t.result === 'success' || t.status === 'ok' ? '0' : '1',
    }));
    const tokens = rawTokens.map((t) => ({
      hash: String(t.transaction_hash || ''),
      from: String((t.from && t.from.hash) || ''),
      to: String((t.to && t.to.hash) || ''),
      value: String((t.total && t.total.value) != null ? t.total.value : '0'),
      timeStamp: isoToSeconds(t.timestamp),
      gasUsed: '0',
      gasPrice: '0',
      tokenSymbol: String((t.token && t.token.symbol) || ''),
      tokenDecimal: String((t.total && t.total.decimals) != null ? t.total.decimals : ((t.token && t.token.decimals) != null ? t.token.decimals : 18)),
    }));
    return { native, tokens, source: 'blockscout-v2' };
  }

  async function blockscout(network, address, limit) {
    try {
      return await blockscoutLegacy(network, address, limit);
    } catch (error) {
      logger.warn(`Historique ${network} : API Blockscout classique indisponible (${error.message}), passage à l'API REST v2.`);
      return blockscoutRest(network, address, limit);
    }
  }

  const toDecimal = (v) => {
    if (v === null || v === undefined) return '0';
    const s = String(v);
    return s.startsWith('0x') ? BigInt(s).toString() : s;
  };

  // blockTimeStamp arrive en secondes, en millisecondes ou en date ISO selon
  // les réponses : on ramène toujours en secondes, comme Etherscan.
  function toSeconds(ts) {
    if (typeof ts === 'string' && !/^\d+$/.test(ts)) {
      const parsed = Math.floor(Date.parse(ts) / 1000);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const n = Number(toDecimal(ts));
    if (!Number.isFinite(n)) return 0;
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }

  function fromNodeReal(t) {
    const common = {
      hash: String(t.hash || ''),
      from: String(t.from || ''),
      to: String(t.to || ''),
      value: toDecimal(t.value),
      timeStamp: String(toSeconds(t.blockTimeStamp)),
      gasUsed: toDecimal(t.gasUsed),
      gasPrice: toDecimal(t.gasPrice),
    };
    if (t.category === '20') {
      return { ...common, tokenSymbol: String(t.asset || ''), tokenDecimal: String(t.decimal != null ? t.decimal : 18) };
    }
    return { ...common, isError: String(t.receiptsStatus) === '0' ? '1' : '0' };
  }

  async function nodereal(address, limit) {
    const apiKey = env.NODEREAL_API_KEY;
    if (!apiKey) throw new Error('NODEREAL_API_KEY manquante dans .env');
    const url = `https://bsc-mainnet.nodereal.io/v1/${apiKey}`;
    let id = 0;
    // Une requête par sens : fromAddress et toAddress se combinent en ET et non
    // en OU, donc un seul des deux ne donnerait que la moitié de l'historique.
    const transfers = async (direction) => {
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++id,
          method: 'nr_getAssetTransfers',
          params: [{ category: ['external', '20'], [`${direction}Address`]: address, order: 'desc', maxCount: `0x${Number(limit).toString(16)}` }],
        }),
      });
      if (!response.ok) throw new Error(`NodeReal HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(`NodeReal : ${data.error.message || JSON.stringify(data.error)}`);
      return (data.result && Array.isArray(data.result.transfers)) ? data.result.transfers : [];
    };

    const [sent, received] = await Promise.all([transfers('from'), transfers('to')]);
    const seen = new Set();
    const native = [];
    const tokens = [];
    for (const t of [...sent, ...received]) {
      // Un envoi à soi-même ressort dans les deux sens : on ne le garde qu'une fois.
      const key = [t.hash, t.category, t.logIndex, t.traceIndex, t.from, t.to, t.value].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      (t.category === '20' ? tokens : native).push(fromNodeReal(t));
    }
    const mostRecent = (list) => list.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp)).slice(0, limit);
    return { native: mostRecent(native), tokens: mostRecent(tokens), source: 'nodereal' };
  }

  async function fetchRawHistory({ network, address, limit = 25 }) {
    const source = PRIMARY_SOURCE[network];
    if (source === 'nodereal') return nodereal(address, limit);
    if (source === 'blockscout') return blockscout(network, address, limit);
    try {
      return await etherscan(network, address, limit);
    } catch (error) {
      if (!BLOCKSCOUT_HOSTS[network]) throw error;
      logger.warn(`Historique ${network} : Etherscan indisponible (${error.message}), repli sur Blockscout.`);
      return blockscout(network, address, limit);
    }
  }

  return { fetchRawHistory, etherscan, blockscout, blockscoutLegacy, blockscoutRest, nodereal };
}

module.exports = { createHistorySources, ETHERSCAN_CHAIN_IDS, BLOCKSCOUT_HOSTS, PRIMARY_SOURCE };
