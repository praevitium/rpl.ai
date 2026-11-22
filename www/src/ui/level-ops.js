// Level actions that run one command on the selected level, with the command each runs.
export const LEVEL_OPS = Object.freeze({
  eval: 'EVAL',
  strto: 'STR→',
  debug: 'DBUG',
  num: '→NUM',
  toq: '→Q',
  btor: 'B→R',
  dtag: 'DTAG',
  objto: 'OBJ→',
  rcl: 'RCL',
  sto: 'STO',
  purge: 'PURGE',
  uval: 'UVAL',
  expand: 'EXPAND',
  factor: 'FACTOR',
  inv: 'INV',
  det: 'DET',
  egvl: 'EGVL',
  egv: 'EGV',
  trn: 'TRN',
  rref: 'RREF',
  abs: 'ABS',
  sort: 'SORT',
  revlist: 'REVLIST',
  sumlist: 'ΣLIST',
});

// Level actions that run a command on levels 1 to the selected one.
export const LEVEL_RANGE_OPS = Object.freeze({
  tolist: '→LIST',
  dupn: 'DUPN',
  dropn: 'DROPN',
});
