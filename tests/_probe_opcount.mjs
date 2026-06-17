import { allOps, hasOp } from '/sessions/trusting-vibrant-lamport/mnt/rplai/www/src/rpl/ops.js';
const ops = allOps();
console.log('allOps().length =', ops.length);
console.log('JORDAN registered?', hasOp('JORDAN'));
