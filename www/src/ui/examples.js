// Short RPL programs to learn from. Command search offers them and one tap puts the source on the command line;
// tests/test-ui.mjs runs each against its tries, as arguments typed before the name and the stack that follows.
export const EXAMPLE_PROGRAMS = Object.freeze([
  {
    name: 'FAC', title: 'Factorial', idiom: 'FOR … NEXT with a local variable', keywords: 'factorial n! loop for next local variable',
    source: '« → n « 1 1 n FOR k k * NEXT » »', tries: [['5', '120'], ['10', '3628800']],
  },
  {
    name: 'FIB', title: 'Fibonacci number', idiom: 'START … NEXT on the stack', keywords: 'fibonacci sequence loop start next rot stack',
    source: '« IF DUP 1 < THEN DROP 0 ELSE 0 1 ROT 1 SWAP START DUP ROT + NEXT DROP END »', tries: [['10', '55'], ['0', '0']],
  },
  {
    name: 'QRT', title: 'Quadratic roots', idiom: '→ local variables', keywords: 'quadratic equation roots parabola solve local variables',
    source: '« → a b c « b SQ 4 a * c * - √ → d « b NEG d + 2 a * / b NEG d - 2 a * / » » »', tries: [['1 -3 2', '2 1'], ['1 0 1', '(0, 1) (0, -1)']],
  },
  {
    name: 'EUC', title: 'Greatest common divisor', idiom: 'WHILE … REPEAT … END', keywords: 'gcd euclid divisor while repeat loop',
    source: '« WHILE DUP REPEAT SWAP OVER MOD END DROP »', tries: [['48 18', '6']],
  },
  {
    name: 'COLL', title: 'Collatz steps', idiom: 'IF … THEN … ELSE inside a loop', keywords: 'collatz 3n+1 conjecture hailstone if then else while',
    source: '« 0 SWAP WHILE DUP 1 ≠ REPEAT IF DUP 2 MOD THEN 3 * 1 + ELSE 2 / END SWAP 1 + SWAP END DROP »', tries: [['6', '8'], ['27', '111']],
  },
  {
    name: 'AVG', title: 'Average of a list', idiom: 'list commands', keywords: 'average mean list sum size statistics',
    source: '« DUP ΣLIST SWAP SIZE / »', tries: [['{ 1 2 3 4 }', '5/2']],
  },
  {
    name: 'GROW', title: 'Compound growth', idiom: '→NUM makes a decimal', keywords: 'compound interest growth percent savings finance',
    source: '« → p r n « p 1 r 100 / + n ^ * →NUM » »', tries: [['1000 5 10', '1628.89462678']],
  },
  {
    name: 'HYP', title: 'Hypotenuse', idiom: 'postfix arithmetic', keywords: 'hypotenuse pythagoras triangle right angle',
    source: '« SQ SWAP SQ + √ »', tries: [['3 4', '5']],
  },
]);

export const exampleUse = ({ name, tries: [[args, result]] }) => `${args} ${name} → ${result}`;
