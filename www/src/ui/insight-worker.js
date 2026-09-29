// A Giac call cannot be interrupted, so the insight strip runs its CAS work on
// this second copy, which the writer terminates when a call takes too long.

const ready = Promise.all([
  import('../rpl/cas/giac-engine.mjs').then(({ giac }) => giac.init()),
  import('./equation-editor.js'),
  import('../rpl/state.js'),
  import('../rpl/formatter.js'),
]);

ready.then(() => postMessage({ ready: true }), (e) => postMessage({ failed: String(e?.message ?? e) }));

self.onmessage = async ({ data }) => {
  const [, { writerInsights }, { state }, { formatSource }] = await ready;
  try {
    Object.assign(state, data.modes);
    const insights = writerInsights(data.ast, data.variable, true);
    postMessage({ id: data.id, insights: insights.map((i) => (i.kind === 'solve' ? { ...i, value: formatSource(i.value) } : i)) });
  } catch (e) {
    postMessage({ id: data.id, error: String(e?.message ?? e) });
  }
};
