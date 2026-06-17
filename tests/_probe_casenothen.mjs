import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Integer, Name, Program } from '../www/src/rpl/types.js';
import { resetHome } from '../www/src/rpl/state.js';

function run(toks) {
  resetHome();
  const s = new Stack();
  s.push(Program(toks));
  try { lookup('EVAL').fn(s); }
  catch (e) { return 'THROW: ' + e.message; }
  return 'depth=' + s.depth + ' top=' + (s.depth ? s.peek().value : '-');
}

// CASE with no THEN, explicit END
console.log('noTHEN+END  :', run([Name('CASE'), Integer(1n), Integer(2n), Name('+'), Name('END')]));
// CASE with no THEN, no END (auto-close)
console.log('noTHEN noEND:', run([Name('CASE'), Integer(1n), Integer(2n), Name('+')]));
// CASE empty body, explicit END
console.log('empty+END   :', run([Name('CASE'), Name('END')]));
// CASE empty body, no END
console.log('empty noEND :', run([Name('CASE')]));
