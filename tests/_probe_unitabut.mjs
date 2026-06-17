import { parseEntry } from '../www/src/rpl/parser.js';
for (const s of ['1_kg/(m*s)', '1_W/(K*m^2)']) {
  const u = parseEntry(s)[0];
  console.log(s, 'value=', u.value, 'uexpr=', JSON.stringify(u.uexpr));
}
// closer abutment shapes
for (const s of ['« 1_kg/(m*s)»', '<< 1_kg/(m*s)>>', '« 1_W/(K*m^2)»']) {
  const out = parseEntry(s);
  const u = out[0] && out[0].tokens && out[0].tokens[0];
  console.log(s, '| n=', out.length, 'progToks=', out[0].tokens.length, 'uexprLen=', u.uexpr.length, JSON.stringify(u.uexpr));
}
const tail = parseEntry('1_kg/(m*s){9}');
console.log('1_kg/(m*s){9} n=', tail.length, tail.map(x=>x.type));
