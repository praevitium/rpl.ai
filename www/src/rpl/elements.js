// Standard atomic weights in g/mol, as periodic tables print them; an element with no stable
// isotope has the mass number of its longest-lived one.
export const ATOMIC_WEIGHTS = Object.freeze({
  H: 1.00794, He: 4.002602, Li: 6.941, Be: 9.012182, B: 10.811, C: 12.0107, N: 14.0067, O: 15.9994, F: 18.9984032, Ne: 20.1797,
  Na: 22.98976928, Mg: 24.305, Al: 26.9815386, Si: 28.0855, P: 30.973762, S: 32.065, Cl: 35.453, Ar: 39.948,
  K: 39.0983, Ca: 40.078, Sc: 44.955912, Ti: 47.867, V: 50.9415, Cr: 51.9961, Mn: 54.938045, Fe: 55.845, Co: 58.933195,
  Ni: 58.6934, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.9216, Se: 78.96, Br: 79.904, Kr: 83.798,
  Rb: 85.4678, Sr: 87.62, Y: 88.90585, Zr: 91.224, Nb: 92.90638, Mo: 95.96, Tc: 98, Ru: 101.07, Rh: 102.9055,
  Pd: 106.42, Ag: 107.8682, Cd: 112.411, In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.90447, Xe: 131.293,
  Cs: 132.9054519, Ba: 137.327, La: 138.90547, Ce: 140.116, Pr: 140.90765, Nd: 144.242, Pm: 145, Sm: 150.36,
  Eu: 151.964, Gd: 157.25, Tb: 158.92535, Dy: 162.5, Ho: 164.93032, Er: 167.259, Tm: 168.93421, Yb: 173.054,
  Lu: 174.9668, Hf: 178.49, Ta: 180.94788, W: 183.84, Re: 186.207, Os: 190.23, Ir: 192.217, Pt: 195.084,
  Au: 196.966569, Hg: 200.59, Tl: 204.3833, Pb: 207.2, Bi: 208.9804, Po: 209, At: 210, Rn: 222,
  Fr: 223, Ra: 226, Ac: 227, Th: 232.03806, Pa: 231.03588, U: 238.02891, Np: 237, Pu: 244, Am: 243, Cm: 247,
  Bk: 247, Cf: 251, Es: 252, Fm: 257, Md: 258, No: 259, Lr: 262, Rf: 267, Db: 268, Sg: 271, Bh: 272, Hs: 270,
  Mt: 276, Ds: 281, Rg: 280, Cn: 285, Nh: 284, Fl: 289, Mc: 288, Lv: 293, Ts: 294, Og: 294,
});

const CLOSERS = { '(': ')', '[': ']' };

/** The molar mass of a molecular formula such as H2O, Ca(OH)2 or [Co(NH3)6]Cl3, or null
 *  when the text isn't one: element symbols with counts, in groups that take a count too. */
export function molarMass(formula) {
  const text = String(formula);
  let i = 0;
  const count = () => {
    const digits = /^\d+/.exec(text.slice(i))?.[0];
    if (!digits) return 1;
    i += digits.length;
    return Number(digits);
  };
  const group = (close) => {
    let sum = 0;
    while (i < text.length && text[i] !== close) {
      let mass;
      if (CLOSERS[text[i]]) {
        const end = CLOSERS[text[i++]];
        mass = group(end);
        if (mass === null || text[i] !== end) return null;
        i++;
      } else {
        const symbol = /^[A-Z][a-z]?/.exec(text.slice(i))?.[0];
        if (!symbol || !Object.hasOwn(ATOMIC_WEIGHTS, symbol)) return null;
        i += symbol.length;
        mass = ATOMIC_WEIGHTS[symbol];
      }
      sum += mass * count();
    }
    return sum;
  };
  const total = group(null);
  return text && i === text.length && total ? total : null;
}
