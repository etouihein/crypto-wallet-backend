-- 001 — Suivi des revenus NexiaWallet : intentions (devis), encaissements
-- on-chain, prix historiques, curseurs de l'indexeur, sessions admin.
--
-- Conventions :
--   * montants on-chain en unités brutes (TEXT, entiers décimaux) : jamais de
--     flottant pour de l'argent ;
--   * prix et valeurs fiat en TEXT décimal (calculs en BigInt, voir money.js) ;
--   * adresses et hash en minuscules ; horodatages en millisecondes (_at) ou
--     secondes Unix de bloc (block_time).

-- Intention : un devis de swap (0x) ou de pont (LI.FI) demandé par l'app.
-- Aucune donnée personnelle : l'adresse de l'utilisateur n'est stockée que
-- sous forme d'empreinte HMAC-SHA256 (user_hash), jamais en clair ; les données
-- de la transaction proposée ne sont gardées que sous forme d'empreinte
-- (calldata_hash), pour reconnaître la transaction signée au moment de sa
-- diffusion sans conserver le calldata (qui contient l'adresse).
CREATE TABLE quote_events (
  id                  TEXT PRIMARY KEY,
  created_at          INTEGER NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('swap', 'bridge')),
  chain_id            INTEGER NOT NULL,
  dest_chain_id       INTEGER,
  token_in            TEXT NOT NULL,
  token_out           TEXT NOT NULL,
  amount_in           TEXT NOT NULL,
  amount_out          TEXT,
  expected_fee_amount TEXT,
  expected_fee_token  TEXT,
  fee_bps             INTEGER,
  user_hash           TEXT NOT NULL,
  calldata_hash       TEXT,
  -- Contrat visé par la transaction proposée (transaction.to du devis). 0x
  -- déconseille de coder ses adresses en dur (le contrat Settler change) :
  -- la classification reconnaît donc aussi tout contrat vu dans nos devis.
  tx_to               TEXT,
  tx_hash             TEXT,
  tx_attached_at      INTEGER
);
CREATE INDEX idx_quote_events_created ON quote_events (created_at);
CREATE INDEX idx_quote_events_calldata ON quote_events (calldata_hash);
CREATE INDEX idx_quote_events_tx ON quote_events (chain_id, tx_hash);

-- Encaissement : un transfert ENTRANT vers l'adresse de collecte, vu on-chain.
-- Clé d'idempotence : (chain_id, tx_hash, kind, sub_index). sub_index vaut le
-- logIndex pour un ERC-20, l'identifiant de trace pour un transfert interne,
-- '0' pour une transaction normale (un transfert natif n'a pas de logIndex).
CREATE TABLE inbound_transfers (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id                INTEGER NOT NULL,
  tx_hash                 TEXT NOT NULL,
  kind                    TEXT NOT NULL CHECK (kind IN ('native', 'internal', 'erc20')),
  sub_index               TEXT NOT NULL,
  block_number            INTEGER NOT NULL,
  block_time              INTEGER NOT NULL,
  from_address            TEXT NOT NULL,
  token_address           TEXT NOT NULL,
  token_symbol            TEXT,
  token_decimals          INTEGER NOT NULL,
  amount_raw              TEXT NOT NULL,
  parent_to               TEXT,
  classification          TEXT NOT NULL DEFAULT 'pending'
                            CHECK (classification IN ('pending', 'swap_fee', 'bridge_fee', 'unclassified')),
  classification_reason   TEXT,
  quote_id                TEXT REFERENCES quote_events (id),
  match_method            TEXT CHECK (match_method IN ('tx_hash', 'heuristic')),
  coingecko_id            TEXT,
  price_usd_at_receipt    TEXT,
  price_eur_at_receipt    TEXT,
  value_usd_at_receipt    TEXT,
  value_eur_at_receipt    TEXT,
  priced_at               INTEGER,
  indexed_at              INTEGER NOT NULL,
  UNIQUE (chain_id, tx_hash, kind, sub_index)
);
CREATE INDEX idx_inbound_time ON inbound_transfers (block_time);
CREATE INDEX idx_inbound_class ON inbound_transfers (classification);

-- Reprise de l'indexeur : dernier bloc entièrement traité, par chaîne et type.
CREATE TABLE indexer_cursors (
  chain_id    INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  last_block  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (chain_id, kind)
);

-- Journal des passages de l'indexeur (affiché dans l'admin : dernier succès, erreurs).
CREATE TABLE indexer_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  status       TEXT NOT NULL CHECK (status IN ('running', 'ok', 'partial', 'error')),
  detail       TEXT
);

-- Cache des prix historiques CoinGecko, par pièce, devise et heure (UTC).
CREATE TABLE price_points (
  coingecko_id  TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('usd', 'eur')),
  hour_ts       INTEGER NOT NULL,
  price         TEXT NOT NULL,
  PRIMARY KEY (coingecko_id, currency, hour_ts)
);

-- Correspondance token on-chain -> identifiant CoinGecko (NULL = inconnu, revérifié plus tard).
CREATE TABLE token_ids (
  chain_id       INTEGER NOT NULL,
  token_address  TEXT NOT NULL,
  coingecko_id   TEXT,
  checked_at     INTEGER NOT NULL,
  PRIMARY KEY (chain_id, token_address)
);

-- Sessions admin côté serveur (révocables). Seule l'empreinte de l'identifiant
-- de session est stockée : une fuite de la base ne permet pas de se connecter.
CREATE TABLE admin_sessions (
  id_hash       TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
