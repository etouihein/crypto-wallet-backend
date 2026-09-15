'use strict';

// Génère les secrets de la page d'administration des revenus, à copier dans
// les variables Railway (jamais dans le code, jamais dans le chat) :
//
//   node scripts/admin-password-hash.js
//
// Demande le mot de passe sans l'afficher, puis imprime :
//   ADMIN_PASSWORD_HASH   empreinte scrypt du mot de passe
//   ADMIN_PATH            chemin secret et aléatoire de la page
//   ANALYTICS_HASH_SECRET secret HMAC des empreintes d'adresses
// Le mot de passe lui-même n'est stocké nulle part.

const crypto = require('crypto');
const readline = require('readline');
const { hashPassword } = require('../src/admin/auth');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl.output;
    rl._writeToOutput = (s) => { if (s.includes(question)) output.write(s); };
    rl.question(question, (answer) => { rl.close(); output.write('\n'); resolve(answer); });
  });
}

(async () => {
  const password = await askHidden('Mot de passe admin (12 caractères minimum) : ');
  const confirm = await askHidden('Confirme le mot de passe : ');
  if (password !== confirm) {
    console.error('Les deux mots de passe ne correspondent pas.');
    process.exit(1);
  }
  const hash = hashPassword(password);
  console.log('\nÀ ajouter dans les variables Railway du service backend :\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`ADMIN_PATH=/${crypto.randomBytes(18).toString('base64url')}`);
  console.log(`ANALYTICS_HASH_SECRET=${crypto.randomBytes(32).toString('hex')}`);
  console.log('\nNote l\'adresse complète de la page : https://<ton-backend>.up.railway.app + ADMIN_PATH');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
