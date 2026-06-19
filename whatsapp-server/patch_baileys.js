'use strict';
// Run once on James: node patch_baileys.js
// Rewrites index.js to use Baileys instead of whatsapp-web.js (no Chrome needed)

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Imports
s = s.replace(
  "const { Client, LocalAuth } = require('whatsapp-web.js');\nconst qrcode = require('qrcode-terminal');",
  "const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');\nconst { Boom } = require('@hapi/boom');\nconst P = require('pino');"
);

// 2. e164ToWaId: use @s.whatsapp.net (Baileys format)
s = s.replace("+ '@c.us'", "+ '@s.whatsapp.net'");

// 3. resolveNumber: Baileys messages have key.remoteJid instead of from
s = s.replace(
  /async function resolveNumber[\s\S]*?^}/m,
  "function resolveNumber(message) {\n  return '+' + message.key.remoteJid.split('@')[0];\n}"
);

// 4. send(): Baileys uses sendMessage(jid, { text }) — no getNumberId needed
s = s.replace(
  /async function send\(client, number, message\) \{[\s\S]*?^}/m,
  "async function send(client, number, message) {\n  await client.sendMessage(e164ToWaId(number), { text: message });\n}"
);

// 5. sendPending: wrap plain string in { text: }
s = s.replace(
  "await client.sendMessage(e164ToWaId(msg.to_number), msg.message);",
  "await client.sendMessage(e164ToWaId(msg.to_number), { text: msg.message });"
);

// 6. handleInbound: Baileys message text lives in message.message.conversation
s = s.replace(
  "  const text = message.body.trim();\n  if (!text) return;\n\n  const number = await resolveNumber(message);\n  if (!number) return;",
  "  const text = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();\n  if (!text) return;\n\n  const number = resolveNumber(message);"
);

// 7. Replace main() and final call entirely — no more Chrome/Puppeteer
const idx = s.indexOf('// ── Bootstrap');
s = s.slice(0, idx) + `// ── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;
      if (shouldReconnect) {
        console.log('Reconnecting...');
        main();
      } else {
        console.log('Logged out — delete auth_baileys/ and restart.');
        process.exit(1);
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connected and ready.');
      if (ai) console.log('Claude brain: active');
      else console.log('Claude brain: disabled');
      sendPending(sock);
      setInterval(() => sendPending(sock), POLL_INTERVAL_MS);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
      await handleInbound(sock, msg);
    }
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
`;

fs.writeFileSync(p, s);
console.log('index.js patched for Baileys.');
console.log('Now run:');
console.log('  npm uninstall whatsapp-web.js qrcode-terminal');
console.log('  npm install @whiskeysockets/baileys @hapi/boom pino');
console.log('  node index.js');
