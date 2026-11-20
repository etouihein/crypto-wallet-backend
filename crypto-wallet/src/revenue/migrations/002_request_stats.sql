-- Compteurs de requetes du serveur, par tranche de 10 minutes (agent Jarvis
-- "Statistiques"). Gardes pour toujours : environ 144 lignes par jour.
-- Aucune donnee personnelle : seulement des nombres par categorie.
CREATE TABLE request_stats (
  bucket      INTEGER PRIMARY KEY,   -- numero de tranche = floor(ms / 600000)
  total       INTEGER NOT NULL,
  erreurs4xx  INTEGER NOT NULL,
  erreurs5xx  INTEGER NOT NULL,
  refus429    INTEGER NOT NULL,
  categories  TEXT NOT NULL          -- JSON {"devis_swap": 3, ...}
);
