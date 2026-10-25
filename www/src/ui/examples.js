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
  {
    name: 'GRADE', title: 'Letter grade', idiom: 'CASE … THEN … END', keywords: 'grade letter score marks exam case if',
    source: '« → s « CASE s 90 ≥ THEN "A" END s 80 ≥ THEN "B" END s 70 ≥ THEN "C" END "F" END » »', tries: [['95', '"A"'], ['72', '"C"'], ['10', '"F"']],
  },
  {
    name: 'SAFE', title: 'Divide without stopping', idiom: 'IFERR … THEN … END traps an error', keywords: 'safe divide error trap iferr zero undefined',
    source: '« IFERR / THEN DROP2 "undefined" END »', tries: [['6 3', '2'], ['6 0', '"undefined"']],
  },
  {
    name: 'REV', title: 'Reverse a string', idiom: 'string commands SIZE and SUB', keywords: 'reverse string text characters sub size backwards',
    source: '« → s « "" 1 s SIZE FOR i s i DUP SUB SWAP + NEXT » »', tries: [['"stressed"', '"desserts"']],
  },
  {
    name: 'DBL', title: 'Double every item', idiom: 'MAP applies a program to a list', keywords: 'map list double each every item apply program',
    source: '« « 2 * » MAP »', tries: [['{ 1 2 3 }', '{ 2 4 6 }']],
  },
  {
    name: 'DSUM', title: 'Sum of digits', idiom: '→STR and OBJ→ turn a number into text and back', keywords: 'digits sum number string characters obj',
    source: '« →STR 0 SWAP 1 OVER SIZE FOR i DUP i DUP SUB OBJ→ ROT + SWAP NEXT DROP »', tries: [['1234', '10'], ['999', '27']],
  },
  {
    name: 'PASC', title: "Row of Pascal's triangle", idiom: 'COMB and →LIST', keywords: 'pascal triangle binomial coefficients comb row combinations',
    source: '« → n « 0 n FOR k n k COMB NEXT n 1 + →LIST » »', tries: [['4', '{ 1 4 6 4 1 }']],
  },
  {
    name: 'LEAP', title: 'Leap year', idiom: 'tests joined by AND and OR, then IFTE', keywords: 'leap year calendar and or ifte logic test',
    source: '« → y « y 4 MOD 0 == y 100 MOD 0 ≠ AND y 400 MOD 0 == OR "leap" "common" IFTE » »', tries: [['2024', '"leap"'], ['1900', '"common"'], ['2000', '"leap"']],
  },
  {
    name: 'NEWT', title: "Newton's square root", idiom: 'DO … UNTIL … END', keywords: 'newton square root iteration approximation do until',
    source: '« → x « x DO DUP x SWAP / + 2 / UNTIL DUP SQ x - ABS 1E-10 < END » »', tries: [['144.', '12.'], ['2.', '1.41421356238']],
  },
]);

export const exampleUse = ({ name, tries: [[args, result]] }) => `${args} ${name} → ${result}`;
