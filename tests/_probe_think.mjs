import { stripThinkBlocks, parseAllToolCalls, findMachineSectionStart } from '../www/src/ai/chat-bot.js';

const show = (label, v) => console.log(label, JSON.stringify(v));

// 1. multiple complete pairs
show('multi-pair:', stripThinkBlocks('<think>a</think>keep1<think>b</think>keep2'));

// 2. complete pair then trailing open block
show('pair+open:', stripThinkBlocks('<think>done reasoning</think>Answer is 4.<think>more'));

// 3. interleaved think and prose
show('interleaved:', stripThinkBlocks('Intro <think>x</think>middle <think>y</think>end'));

// 4. fake tool call inside think, real one after -> strip then parse
const raw = '<think>Maybe I should {"name":"DROP","arguments":{}}</think>Pushing 3.\n{"name":"push_to_stack","arguments":{"value":"3"}}';
const stripped = stripThinkBlocks(raw);
show('stripped-fake:', stripped);
console.log('parse-raw  :', JSON.stringify(parseAllToolCalls(raw).map(c=>c.name)));
console.log('parse-strip:', JSON.stringify(parseAllToolCalls(stripped).map(c=>c.name)));

// 5. open think containing a tool-call shape (mid-stream) -> dropped
const mid = 'Working.<think>plan: {"name":"CLEAR"}';
show('mid-open:', stripThinkBlocks(mid));
console.log('parse-mid-strip:', JSON.stringify(parseAllToolCalls(stripThinkBlocks(mid)).map(c=>c.name)));

// 6. mismatched tags think...</thinking>
show('mismatched:', stripThinkBlocks('<think>a</thinking>tail'));

// 7. findMachineSectionStart after stripping a fake-call think block
const raw7 = '<think>{"name":"X"}</think>prose only here';
console.log('fms-after-strip:', findMachineSectionStart(stripThinkBlocks(raw7)));
