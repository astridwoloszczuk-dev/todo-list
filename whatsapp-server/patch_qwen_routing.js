'use strict';
// Run once on James: node patch_qwen_routing.js
// Switches classification to Qwen 72b, responses to Qwen 7b, removes Claude from hot path

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');
let changes = 0;

// 1. Add QWEN_CLASSIFY_MODEL + QWEN_CHAT_MODEL constants after QWEN_MODEL
if (!s.includes('QWEN_CLASSIFY_MODEL')) {
  s = s.replace(
    /const QWEN_MODEL = .*\n/,
    m => m
      + "const QWEN_CLASSIFY_MODEL = process.env.QWEN_CLASSIFY_MODEL || 'qwen2.5:72b';\n"
      + "const QWEN_CHAT_MODEL     = process.env.QWEN_CHAT_MODEL     || 'qwen2.5:7b';\n"
  );
  changes++;
  console.log('+ Added QWEN_CLASSIFY_MODEL, QWEN_CHAT_MODEL');
}

// 2. Update callQwen(messages) → callQwen(messages, model = QWEN_MODEL)
if (s.includes('async function callQwen(messages)')) {
  s = s.replace(
    'async function callQwen(messages)',
    'async function callQwen(messages, model = QWEN_MODEL)'
  );
  s = s.replace(
    /body: JSON\.stringify\(\{ model: QWEN_MODEL, messages,/,
    'body: JSON.stringify({ model: model, messages,'
  );
  // Ensure num_predict cap exists
  s = s.replace(
    /options: \{ temperature: 0\.7(?:, num_predict: \d+)? \}/,
    'options: { temperature: 0.7, num_predict: 500 }'
  );
  changes++;
  console.log('+ Updated callQwen to accept model param');
}

// 3. Replace the Claude block inside classifyMessage with Qwen 72b
//    Anchor on the unique 'claude-haiku' string
if (s.includes("model: 'claude-haiku-4-5-20251001'")) {
  // Replace from the "// Use Claude if available" comment to end of catch block
  s = s.replace(
    /  \/\/ Use Claude if available[\s\S]*?console\.error\(`Claude classification failed[\s\S]*?return \{ intent: 'general_ai' \};\n  \}/,
    [
      "  try {",
      "    const raw = await callQwen([",
      "      { role: 'system', content: BRAIN_SYSTEM },",
      "      { role: 'user', content: `Sender: ${person.name} (${person.role})\\nMessage: ${text}` },",
      "    ], QWEN_CLASSIFY_MODEL);",
      "    const cleaned = raw.replace(/```json\\n?/g, '').replace(/```/g, '').trim();",
      "    return JSON.parse(cleaned);",
      "  } catch (e) {",
      "    console.error(`Qwen classification failed: ${e.message} — defaulting to general_ai`);",
      "    return { intent: 'general_ai' };",
      "  }",
    ].join('\n')
  );
  changes++;
  console.log('+ Replaced Claude classification with Qwen 72b');
} else {
  console.warn('! classifyMessage Claude block not found — already patched?');
}

// 4. Rewrite handleGeneralAI: always Qwen 7b, no Claude routing
//    Replace from function declaration to the comment that follows it
const genAIStart = s.indexOf('async function handleGeneralAI(');
const genAIEnd   = s.indexOf('\n// ── Claude brain:', genAIStart);

if (genAIStart !== -1 && genAIEnd !== -1) {
  const newFn = [
    "async function handleGeneralAI(client, person, rawText) {",
    "  const { text } = detectModelOverride(rawText);",
    "",
    "  const history = await getConversationHistory(person.id);",
    "  await saveConversation(person.id, 'user', rawText);",
    "",
    "  const messages = [",
    "    ...history.map(h => ({ role: h.role, content: h.content })),",
    "    { role: 'user', content: text },",
    "  ];",
    "",
    "  let reply;",
    "  try {",
    "    reply = await callQwen([{ role: 'system', content: JAMES_SYSTEM }, ...messages], QWEN_CHAT_MODEL);",
    "  } catch (e) {",
    "    console.error(`[${person.name}] AI error: ${e.message}`);",
    "    reply = \"Sorry, I couldn't process that right now. Try again?\";",
    "  }",
    "",
    "  await saveConversation(person.id, 'assistant', reply);",
    "  await send(client, person.whatsapp_number, reply);",
    "  console.log(`[${person.name}] general_ai → ${reply.slice(0, 60)}`);",
    "}",
  ].join('\n');

  s = s.slice(0, genAIStart) + newFn + s.slice(genAIEnd);
  changes++;
  console.log('+ Rewrote handleGeneralAI to use Qwen 7b only');
} else {
  console.warn('! Could not locate handleGeneralAI boundaries — skipping');
}

fs.writeFileSync(p, s);
console.log('\nDone! ' + changes + ' change(s) applied.');
console.log('Next: node index.js');
