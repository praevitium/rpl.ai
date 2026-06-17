import { parseSuggestions } from '../www/src/ai/chat-bot.js';
const show = (label, v) => console.log(label, '=>', JSON.stringify(v));
// no opening bracket after marker
show('SUGGEST no-bracket', parseSuggestions('SUGGEST: nothing here'));
// opening bracket but unbalanced (no close)
show('SUGGEST unbalanced', parseSuggestions('SUGGEST: ["a", "b"'));
// non-string elements coerced to '' and filtered
show('mixed types', parseSuggestions('SUGGEST: ["keep", 42, true, null, "also"]'));
// all non-string -> [] -> null from tryParse, then fallback finds none -> null
show('all non-string', parseSuggestions('SUGGEST: [1, 2, 3]'));
// JSON fails (trailing comma) but quoted fallback still gets nothing usable? has quotes
show('json-fail fallback', parseSuggestions('SUGGEST: ["alpha", "beta",]'));
// JSON fails and no quoted tokens -> null
show('json-fail no-quotes', parseSuggestions('SUGGEST: [unquoted, junk,]'));
