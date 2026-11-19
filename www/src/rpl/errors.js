import { RPLError } from './stack.js';

// ERRN numbers from the HP's list of error messages; DOERR in ops/evaluation.js reads it backwards.
export const ERROR_NUMBERS = Object.freeze({
  'Undefined local name':  0x003,
  'Directory not allowed': 0x12A,
  'Directory not empty':   0x12B,
  'Name conflict':         0x13C,
  'Interrupted':           0x13F,
  'Too few arguments':     0x201,
  'Bad argument type':     0x202,
  'Bad argument value':    0x203,
  'Undefined name':        0x204,
  'Division by zero':      0x303,
  'Undefined result':      0x304,
  'Infinite result':       0x305,
  'Invalid dimension':     0x501,
  'Nonexistent ΣDAT':      0x602,
  'Inconsistent units':    0xB02,
  'Nonexistent alarm':     0xD04,
});

function numbered(message) {
  return Object.assign(new RPLError(message), { errorNumber: ERROR_NUMBERS[message] });
}

export const badType = () => numbered('Bad argument type');
export const badValue = () => numbered('Bad argument value');
export const invalidDimension = () => numbered('Invalid dimension');
export const casNotReady = () => new RPLError('CAS not ready');
