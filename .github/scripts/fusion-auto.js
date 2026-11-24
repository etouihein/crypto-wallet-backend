'use strict';
// =====================================================================
//  FUSION AUTOMATIQUE des Pull Requests des agents Claude (Pablo,
//  24/11/2026 : « automatise ça, que tout soit autonome »).
//
//  Fusionne UNE PR a la fois, seulement si TOUT est vrai :
//   - branche claude/* du depot lui-meme (jamais une PR venue d'ailleurs) ;
//   - tests GitHub du serveur ET de l'app au vert sur le dernier commit,
//     et aucune autre verification en echec (sauf l'audit informatif) ;
//   - les derniers tests de main sont au vert (main cassee = on s'arrete) ;
//   - aucun conflit ;
//   - risque faible : PAS marquee "ELEVE - securite", ne touche AUCUN
//     fichier sensible (cles, signature, verifications de securite,
//     dependances, automatisations GitHub) et aucune ligne modifiee ne
//     parle de frais/commission/cle/phrase de recuperation ;
//   - moins de 800 lignes modifiees ;
//   - pas d'etiquette "attente-pablo" posee par Pablo.
//  Tout le reste attend le clic de Pablo (Merge pull request).
//  Interrupteur : variable du depot FUSION_AUTO = "non" -> plus rien.
//
//  Ce script tourne depuis main (workflow_run / schedule) : il n'execute
//  jamais le code d'une PR.
// =====================================================================

const FICHIERS_SENSIBLES = [
  /^wallet-final\/lib\/(wallet|swapSecurity|addressSafety|txSimulation|walletconnect|dappBrowserProvider|approvals|bridge|sauvegarde)\.js$/,
  /^crypto-wallet\/src\/revenue\//,
  /(^|\/)package(-lock)?\.json$/,
  /^\.github\//,
  /(^|\/)\.env/,
  /^wallet-final\/public\/_headers$/,
];

// Une ligne ajoutee ou retiree qui parle de ca -> decision de Pablo.
const MOTS_SENSIBLES = /\b(fee|fees|commission|integrator|feeRecipient|FEE_[A-Z_]+|mnemonic|privateKey|private_key|seed|keystore|signTransaction|signMessage)\b|0\.0075|0\.0025/i;

const CHECKS_OBLIGATOIRES = ['Serveur (crypto-wallet)', 'App et site (wallet-final)'];
const CHECKS_IGNORES = ['Audit des bibliotheques (information)', 'Fusion automatique'];
const LIGNES_MAX = 800;

// Decision pure (testee) : { fusionner: bool, raison: string }
function decider({ pr, depot, fichiers, checks, mainVert }) {
  if (!pr || pr.state !== 'open') return { fusionner: false, raison: 'PR fermee' };
  if (pr.draft) return { fusionner: false, raison: 'brouillon' };
  if (!pr.head || pr.head.repo?.full_name !== depot || !String(pr.head.ref || '').startsWith('claude/')) {
    return { fusionner: false, raison: 'pas une branche claude/* du depot' };
  }
  if ((pr.labels || []).some((l) => /attente-pablo/i.test(l.name || ''))) return { fusionner: false, raison: 'etiquette attente-pablo' };
  const texte = `${pr.title || ''}\n${pr.body || ''}`;
  if (/[EÉ]LEV[EÉ]\s*-\s*s[eé]curit[eé]/i.test(texte)) return { fusionner: false, raison: 'risque ELEVE - securite : decision de Pablo' };
  if (!mainVert) return { fusionner: false, raison: 'les tests de main ne sont pas au vert' };
  if (pr.mergeable !== true) return { fusionner: false, raison: pr.mergeable === false ? 'conflit avec main' : 'fusionnabilite pas encore calculee' };

  let lignes = 0;
  for (const f of fichiers || []) {
    const nom = String(f.filename || '');
    if (FICHIERS_SENSIBLES.some((re) => re.test(nom))) return { fusionner: false, raison: `fichier sensible : ${nom}` };
    if (f.previous_filename && FICHIERS_SENSIBLES.some((re) => re.test(f.previous_filename))) return { fusionner: false, raison: `fichier sensible : ${f.previous_filename}` };
    lignes += (f.additions || 0) + (f.deletions || 0);
    if (typeof f.patch !== 'string') return { fusionner: false, raison: `modification illisible : ${nom}` };
    const modifiees = f.patch.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
    if (!/(^|\/)test\//.test(nom) && modifiees.some((l) => MOTS_SENSIBLES.test(l))) {
      return { fusionner: false, raison: `ligne sensible (frais, cle, signature) dans ${nom}` };
    }
  }
  if (!fichiers || fichiers.length === 0) return { fusionner: false, raison: 'aucun fichier' };
  if (lignes > LIGNES_MAX) return { fusionner: false, raison: `trop gros (${lignes} lignes)` };

  const utiles = (checks || []).filter((c) => !CHECKS_IGNORES.includes(c.name));
  for (const nom of CHECKS_OBLIGATOIRES) {
    const c = utiles.find((x) => x.name === nom);
    if (!c) return { fusionner: false, raison: `test manquant : ${nom}` };
  }
  for (const c of utiles) {
    if (c.status !== 'completed') return { fusionner: false, raison: `test en cours : ${c.name}` };
    if (!['success', 'neutral', 'skipped'].includes(c.conclusion)) return { fusionner: false, raison: `test en echec : ${c.name}` };
  }
  return { fusionner: true, raison: 'risque faible, tests au vert' };
}

async function api(chemin, options = {}) {
  const rep = await fetch(`https://api.github.com${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const texte = await rep.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = texte; }
  if (!rep.ok) { const e = new Error(`${rep.status} ${chemin} ${texte.slice(0, 200)}`); e.status = rep.status; throw e; }
  return donnees;
}

async function principal() {
  const depot = process.env.REPO;
  if (String(process.env.FUSION_AUTO || '').toLowerCase() === 'non') { console.log('Fusion automatique coupee (FUSION_AUTO = non).'); return; }
  // main doit avoir ete testee A SON DERNIER COMMIT. Une fusion faite par ce
  // script ne relance pas les tests tout seule (regle GitHub) : on les
  // relance a la main (workflow_dispatch) et on attend leur resultat.
  const shaMain = (await api(`/repos/${depot}/branches/main`)).commit.sha;
  const runs = (await api(`/repos/${depot}/actions/workflows/tests.yml/runs?branch=main&per_page=10`)).workflow_runs || [];
  const dernier = runs.find((r) => r.head_sha === shaMain && r.event !== 'pull_request');
  if (!dernier) {
    console.log(`main ${shaMain.slice(0, 7)} pas encore testee : tests relances, fusion au prochain passage.`);
    await api(`/repos/${depot}/actions/workflows/tests.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    return;
  }
  const mainVert = dernier.status === 'completed' && dernier.conclusion === 'success';
  console.log(`Tests de main ${shaMain.slice(0, 7)} : ${dernier.status}/${dernier.conclusion}`);
  if (!mainVert) return;

  const prs = await api(`/repos/${depot}/pulls?state=open&per_page=50&sort=created&direction=asc`);
  for (const resume of prs) {
    const pr = await api(`/repos/${depot}/pulls/${resume.number}`); // champ mergeable
    const fichiers = await api(`/repos/${depot}/pulls/${pr.number}/files?per_page=100`);
    const checks = (await api(`/repos/${depot}/commits/${pr.head.sha}/check-runs?per_page=100`)).check_runs || [];
    const d = decider({ pr, depot, fichiers, checks, mainVert });
    console.log(`#${pr.number} ${pr.title} -> ${d.fusionner ? 'FUSION' : 'attend'} (${d.raison})`);
    if (!d.fusionner) continue;
    try {
      await api(`/repos/${depot}/pulls/${pr.number}/merge`, {
        method: 'PUT',
        body: JSON.stringify({ sha: pr.head.sha, merge_method: 'merge' }),
      });
      await api(`/repos/${depot}/issues/${pr.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: 'Fusion automatique : risque faible, tous les tests au vert, aucun fichier sensible. Mise en ligne automatique (Railway / Cloudflare).' }),
      });
      console.log(`#${pr.number} fusionnee.`);
      // Tests de la nouvelle main ; leur fin relance ce script (PR suivante).
      await api(`/repos/${depot}/actions/workflows/tests.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    } catch (e) {
      console.log(`#${pr.number} fusion refusee par GitHub : ${e.message}`);
    }
    // UNE seule fusion par passage : les tests de main repartent, et le
    // passage suivant (a la fin de ces tests) fusionne la PR suivante.
    return;
  }
}

if (require.main === module) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { decider, FICHIERS_SENSIBLES, MOTS_SENSIBLES };
