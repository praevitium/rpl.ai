import { parseEntry } from '../www/src/rpl/parser.js';
import { format } from '../www/src/rpl/formatter.js';
for (const src of ['« 1 2 +', '<< 1 2 +', '« 1 2', '«', '« IF 1 THEN 2', '« 1 «2 +']) {
  try {
    const v = parseEntry(src);
    const p = v[0];
    console.log(JSON.stringify(src), '=> len', v.length, 'type', p && p.type, 'toks', p && p.tokens && p.tokens.length, '| fmt:', p ? format(p) : '');
  } catch (e) { console.log(JSON.stringify(src), 'THREW', e.message); }
}
