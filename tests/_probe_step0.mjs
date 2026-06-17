import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Real, Integer, Name, Program } from '../www/src/rpl/types.js';
import { resetHome } from '../www/src/rpl/state.js';

function run(label, seed, prog) {
  resetHome();
  const s = new Stack();
  if (seed !== null) s.push(seed);
  s.push(Program(prog));
  try { lookup('EVAL').fn(s); console.log(label, '=> NO THROW, depth', s.depth); }
  catch (e) { console.log(label, '=> throw:', JSON.stringify(e.message)); }
}

run('START int 0', Integer(0), [Integer(1), Integer(5), Name('START'), Integer(1), Name('+'), Integer(0), Name('STEP')]);
run('START real 0', Integer(0), [Real(1), Real(5), Name('START'), Integer(1), Name('+'), Real(0), Name('STEP')]);
run('START int demote Real0', Integer(0), [Integer(1), Integer(5), Name('START'), Integer(1), Name('+'), Real(0), Name('STEP')]);
