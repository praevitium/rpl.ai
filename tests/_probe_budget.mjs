import { activeContextTokens, effectiveBudget } from '../www/src/ai/chat-bot.js';
// in-catalog worker model (no endpoint) -> resolves catalog contextTokens
const worker = { loadedModelId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC' };
console.log('worker act', activeContextTokens(worker));
console.log('worker budget', effectiveBudget(worker));
// tiny remote -> zero floor
const tiny = { loadedModelId: 'srv', endpoint: 'http://x', contextTokens: 500 };
console.log('tiny act', activeContextTokens(tiny));
console.log('tiny budget', effectiveBudget(tiny));
// worker with endpoint absent but contextTokens present is ignored (duck-typing)
const ducked = { loadedModelId: 'Qwen3-0.6B-q4f16_1-MLC', contextTokens: 999 };
console.log('ducked act', activeContextTokens(ducked));
