import { ChatBot } from '../www/src/ai/chat-bot.js';
import { SYSTEM_PROMPT_COMBINED } from '../www/src/ai/system-prompt.js';

const reg = ChatBot.prototype._buildRegistry.call({ _tools: {}, _getContext: () => ({}) });
const confirmFlags = Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, v.confirm]));
console.log('registry confirm flags:', confirmFlags);

const head = SYSTEM_PROMPT_COMBINED.indexOf('AVAILABLE TOOLS');
const tail = SYSTEM_PROMPT_COMBINED.indexOf('EXAMPLES', head);
const block = SYSTEM_PROMPT_COMBINED.slice(head, tail);
const docConfirm = {};
for (const m of block.matchAll(/\{"name":"([^"]+)"[^\n]*\}\n\s+([^\n]+)/g)) {
  const name = m[1];
  const desc = m[2];
  if (name.includes('<')) continue;
  const wantsConfirm = /confirmation/i.test(desc);
  const autoExec = /auto-executes|read-only/i.test(desc);
  docConfirm[name] = { wantsConfirm, autoExec };
}
console.log('documented:', docConfirm);
