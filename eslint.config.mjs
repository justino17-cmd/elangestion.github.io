// Configuration ESLint — cible les trois catégories relevées par l'audit :
//   no-empty      → les 148 blocs catch vides qui font disparaître les erreurs
//   no-eval       → l'eval() de la recherche globale
//   no-unused-vars→ les 24 fonctions jamais appelées
//
// Volontairement minimal : l'objectif est que `npm run lint` reste exécutable
// et lisible sur du code existant, pas de reformater 773 Ko d'un coup.
// Les blocs catch vides sont signalés en avertissement plutôt qu'en erreur —
// il y en a trop pour bloquer aujourd'hui, mais ils doivent être visibles et
// leur nombre ne doit plus augmenter.

const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  localStorage: 'readonly', sessionStorage: 'readonly', console: 'readonly',
  fetch: 'readonly', Request: 'readonly', Response: 'readonly', Headers: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  crypto: 'readonly', atob: 'readonly', btoa: 'readonly', Blob: 'readonly', FileReader: 'readonly',
  Image: 'readonly', FormData: 'readonly', Notification: 'readonly', caches: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', Intl: 'readonly',
  requestAnimationFrame: 'readonly', matchMedia: 'readonly', getComputedStyle: 'readonly',
  firebase: 'readonly'
};

const serviceWorker = {
  self: 'readonly', clients: 'readonly', caches: 'readonly', fetch: 'readonly',
  Request: 'readonly', Response: 'readonly', URL: 'readonly', console: 'readonly'
};

const node = {
  require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
  console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly'
};

const rules = {
  'no-empty': ['warn', { allowEmptyCatch: false }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }]
};

export default [
  { files: ['js/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browser }, rules },
  { files: ['sw.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: serviceWorker }, rules },
  { files: ['server/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: node }, rules }
];
