/* Tests de l'API TeamOP — ciblent d'abord les correctifs de sécurité de
   l'audit : l'authentification par jeton d'équipe, la restriction des URL
   poussées, la vérification d'origine et les limites anti-abus.

   Le serveur lit sa configuration au chargement du module : on prépare donc
   un config.json et un répertoire de données temporaires AVANT le require. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const webpush = require('web-push');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-test-'));
const vapid = webpush.generateVAPIDKeys();

const TOKEN = 'jeton-de-test-0123456789abcdef';
const ORIGIN = 'https://teamop.fr';

fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
  vapidPublicKey: vapid.publicKey,
  vapidPrivateKey: vapid.privateKey,
  apiKey: 'cle-api-de-test',
  contactEmail: 'contact@teamop.fr',
  origins: [ORIGIN],
  teamTokens: { 'elan-gestion': TOKEN },
  openTeams: ['opmsg-user-*'],
  // Hôte injoignable : l'envoi échouera (500), mais le quota est décompté
  // avant l'envoi — c'est lui qu'on veut éprouver.
  smtp: { host: '127.0.0.1', port: 1, user: 'x@example.test', pass: 'x', from: 'x@example.test' }
}));

process.env.TEAMOP_CONFIG = path.join(TMP, 'config.json');
process.env.TEAMOP_DATA = path.join(TMP, 'data');

const request = require('supertest');
const app = require('../index.js');

// L'écriture des abonnements est différée de 300 ms : on laisse le timer
// retomber avant d'effacer le répertoire, sinon il journalise un ENOENT.
after(async () => {
  await new Promise(r => setTimeout(r, 500));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* nettoyage best-effort */ }
});

const SUB = { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'x', auth: 'y' } };

describe('authentification par jeton d\'équipe', () => {
  test('/api/notify sans jeton est refusé', async () => {
    const r = await request(app).post('/api/notify').send({ teamId: 'elan-gestion', title: 'Coucou' });
    assert.strictEqual(r.status, 401);
  });

  test('/api/notify avec un mauvais jeton est refusé', async () => {
    const r = await request(app).post('/api/notify')
      .set('X-TeamOP-Token', 'mauvais-jeton-de-la-meme-longueur')
      .send({ teamId: 'elan-gestion', title: 'Coucou' });
    assert.strictEqual(r.status, 401);
  });

  test('/api/notify avec le bon jeton est accepté', async () => {
    const r = await request(app).post('/api/notify')
      .set('X-TeamOP-Token', TOKEN)
      .send({ teamId: 'elan-gestion', title: 'Coucou' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
  });

  test('une équipe inconnue est refusée (config fail-closed)', async () => {
    const r = await request(app).post('/api/notify')
      .set('X-TeamOP-Token', TOKEN)
      .send({ teamId: 'equipe-inventee', title: 'Coucou' });
    assert.strictEqual(r.status, 403);
  });

  test('une équipe déclarée ouverte passe sans jeton', async () => {
    const r = await request(app).post('/api/notify').send({ teamId: 'opmsg-user-abc123', title: 'Coucou' });
    assert.strictEqual(r.status, 200);
  });

  test('/api/subscribe exige aussi le jeton', async () => {
    const sans = await request(app).post('/api/subscribe').send({ sub: SUB, teamId: 'elan-gestion' });
    assert.strictEqual(sans.status, 401);

    const avec = await request(app).post('/api/subscribe')
      .set('X-TeamOP-Token', TOKEN)
      .send({ sub: SUB, teamId: 'elan-gestion', userId: 'u1', userName: 'Test' });
    assert.strictEqual(avec.status, 200);
  });
});

describe('vérification d\'origine', () => {
  test('une origine non autorisée est refusée', async () => {
    const r = await request(app).post('/api/notify')
      .set('Origin', 'https://exemple-malveillant.test')
      .set('X-TeamOP-Token', TOKEN)
      .send({ teamId: 'elan-gestion', title: 'Coucou' });
    assert.strictEqual(r.status, 403);
  });

  test('l\'origine du site est acceptée', async () => {
    const r = await request(app).post('/api/notify')
      .set('Origin', ORIGIN)
      .set('X-TeamOP-Token', TOKEN)
      .send({ teamId: 'elan-gestion', title: 'Coucou' });
    assert.strictEqual(r.status, 200);
  });
});

describe('anti-abus', () => {
  test('/api/sendcode refuse une adresse invalide', async () => {
    const r = await request(app).post('/api/sendcode').send({ teamId: 'elan-gestion', email: 'pas-une-adresse' });
    assert.strictEqual(r.status, 400);
  });

  test('/api/sendcode plafonne à 5 codes par heure et par destinataire', async () => {
    const cible = { teamId: 'elan-gestion', email: 'victime@example.test' };
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/sendcode').send(cible);
      // l'envoi échoue (SMTP injoignable), mais la demande a été acceptée
      assert.notStrictEqual(r.status, 429, `la demande ${i + 1} ne doit pas être limitée`);
    }
    const trop = await request(app).post('/api/sendcode').send(cible);
    assert.strictEqual(trop.status, 429);
  });

  test('/api/email refuse une clé invalide', async () => {
    const r = await request(app).post('/api/email').send({ key: 'mauvaise-cle', to: 'a@b.test', subject: 'x' });
    assert.strictEqual(r.status, 403);
  });
});

describe('URL des notifications', () => {
  test('une URL externe est remplacée par la page de l\'app', () => {
    assert.strictEqual(app.safePushUrl('https://site-malveillant.test/piege'), '/app.html');
  });

  test('un protocole javascript: est neutralisé', () => {
    assert.strictEqual(app.safePushUrl('javascript:alert(1)'), '/app.html');
  });

  test('une URL protocole-relative est neutralisée', () => {
    assert.strictEqual(app.safePushUrl('//site-malveillant.test/piege'), '/app.html');
  });

  test('un chemin interne est conservé', () => {
    assert.strictEqual(app.safePushUrl('/app.html#v=boxes'), '/app.html#v=boxes');
  });

  test('l\'origine autorisée est conservée', () => {
    assert.strictEqual(app.safePushUrl(ORIGIN + '/messages.html'), ORIGIN + '/messages.html');
  });
});

describe('santé', () => {
  test('/health répond', async () => {
    const r = await request(app).get('/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
  });
});
