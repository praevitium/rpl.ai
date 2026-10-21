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

// The 118 elements, from Bowserinator's Periodic-Table-JSON (CC BY-SA, drawn from Wikipedia), as rows of
// [Z, symbol, name, weight g/mol, density g/cm^3, melt K, boil K, Pauling electronegativity, electron affinity kJ/mol,
//  first and second ionization energies kJ/mol, molar heat J/(mol·K), electron configuration, group, period, block, phase,
//  category, electrons per shell, atomic radius pm, covalent radius pm, appearance, discovered by, table column, table row].
// A null is a value the source doesn't have.
export const ELEMENTS = Object.freeze([
  [1, 'H', 'Hydrogen', 1.008, 8.988e-05, 13.99, 20.271, 2.2, 72.769, 1312, null, 28.836, '1s1', 1, 1, 's', 'Gas', 'diatomic nonmetal', [1], 25, 32, 'colorless gas', 'Henry Cavendish', 1, 1],
  [2, 'He', 'Helium', 4.0026022, 0.0001786, 0.95, 4.222, null, -48, 2372.3, 5250.5, null, '1s2', 18, 1, 's', 'Gas', 'noble gas', [2], 120, 46, 'colorless gas, exhibiting a red-orange glow when placed in a high-voltage electric field', 'Pierre Janssen', 18, 1],
  [3, 'Li', 'Lithium', 6.94, 0.534, 453.65, 1603, 0.98, 59.6326, 520.2, 7298.1, 24.86, '[He]2s1', 1, 2, 's', 'Solid', 'alkali metal', [2, 1], 145, 133, 'silvery-white', 'Johan August Arfwedson', 1, 2],
  [4, 'Be', 'Beryllium', 9.01218315, 1.85, 1560, 2742, 1.57, -48, 899.5, 1757.1, 16.443, '[He]2s2', 2, 2, 's', 'Solid', 'alkaline earth metal', [2, 2], 105, 102, 'white-gray metallic', 'Louis Nicolas Vauquelin', 2, 2],
  [5, 'B', 'Boron', 10.81, 2.08, 2349, 4200, 2.04, 26.989, 800.6, 2427.1, 11.087, '[He]2s2·2p1', 13, 2, 'p', 'Solid', 'metalloid', [2, 3], 85, 85, 'black-brown', 'Joseph Louis Gay-Lussac', 13, 2],
  [6, 'C', 'Carbon', 12.011, 1.821, 4600, null, 2.55, 121.7763, 1086.5, 2352.6, 8.517, '[He]2s2·2p2', 14, 2, 'p', 'Solid', 'polyatomic nonmetal', [2, 4], 70, 75, null, 'Ancient Egypt', 14, 2],
  [7, 'N', 'Nitrogen', 14.007, 0.001251, 63.15, 77.355, 3.04, -6.8, 1402.3, 2856, null, '[He]2s2·2p3', 15, 2, 'p', 'Gas', 'diatomic nonmetal', [2, 5], 65, 71, 'colorless gas, liquid or solid', 'Daniel Rutherford', 15, 2],
  [8, 'O', 'Oxygen', 15.999, 0.001429, 54.36, 90.188, 3.44, 140.976, 1313.9, 3388.3, null, '[He]2s2·2p4', 16, 2, 'p', 'Gas', 'diatomic nonmetal', [2, 6], 60, 63, null, 'Carl Wilhelm Scheele', 16, 2],
  [9, 'F', 'Fluorine', 18.9984031636, 0.001696, 53.48, 85.03, 3.98, 328.1649, 1681, 3374.2, null, '[He]2s2·2p5', 17, 2, 'p', 'Gas', 'diatomic nonmetal', [2, 7], 50, 64, null, 'André-Marie Ampère', 17, 2],
  [10, 'Ne', 'Neon', 20.17976, 0.0009002, 24.56, 27.104, null, -116, 2080.7, 3952.3, null, '[He]2s2·2p6', 18, 2, 'p', 'Gas', 'noble gas', [2, 8], 160, 67, 'colorless gas exhibiting an orange-red glow when placed in a high voltage electric field', 'Morris Travers', 18, 2],
  [11, 'Na', 'Sodium', 22.989769282, 0.968, 370.944, 1156.09, 0.93, 52.867, 495.8, 4562, 28.23, '[Ne]3s1', 1, 3, 's', 'Solid', 'alkali metal', [2, 8, 1], 180, 155, 'silvery white metallic', 'Humphry Davy', 1, 3],
  [12, 'Mg', 'Magnesium', 24.305, 1.738, 923, 1363, 1.31, -40, 737.7, 1450.7, 24.869, '[Ne]3s2', 2, 3, 's', 'Solid', 'alkaline earth metal', [2, 8, 2], 150, 139, 'shiny grey solid', 'Joseph Black', 2, 3],
  [13, 'Al', 'Aluminium', 26.98153857, 2.7, 933.47, 2743, 1.61, 41.762, 577.5, 1816.7, 24.2, '[Ne]3s2·3p1', 13, 3, 'p', 'Solid', 'post-transition metal', [2, 8, 3], 125, 126, 'silvery gray metallic', null, 13, 3],
  [14, 'Si', 'Silicon', 28.085, 2.329, 1687, 3538, 1.9, 134.0684, 786.5, 1577.1, 19.789, '[Ne]3s2·3p2', 14, 3, 'p', 'Solid', 'metalloid', [2, 8, 4], 110, 116, 'crystalline, reflective with bluish-tinged faces', 'Jöns Jacob Berzelius', 14, 3],
  [15, 'P', 'Phosphorus', 30.9737619985, 1.823, 317.3, null, 2.19, 72.037, 1011.8, 1907, 23.824, '[Ne]3s2·3p3', 15, 3, 'p', 'Solid', 'polyatomic nonmetal', [2, 8, 5], 100, 111, 'colourless, waxy white, yellow, scarlet, red, violet, black', 'Hennig Brand', 15, 3],
  [16, 'S', 'Sulfur', 32.06, 2.07, 388.36, 717.8, 2.58, 200.4101, 999.6, 2252, 22.75, '[Ne]3s2·3p4', 16, 3, 'p', 'Solid', 'polyatomic nonmetal', [2, 8, 6], 100, 103, 'lemon yellow sintered microcrystals', 'Ancient china', 16, 3],
  [17, 'Cl', 'Chlorine', 35.45, 0.0032, 171.6, 239.11, 3.16, 348.575, 1251.2, 2298, null, '[Ne]3s2·3p5', 17, 3, 'p', 'Gas', 'diatomic nonmetal', [2, 8, 7], 100, 99, 'pale yellow-green gas', 'Carl Wilhelm Scheele', 17, 3],
  [18, 'Ar', 'Argon', 39.9481, 0.001784, 83.81, 87.302, null, -96, 1520.6, 2665.8, null, '[Ne]3s2·3p6', 18, 3, 'p', 'Gas', 'noble gas', [2, 8, 8], 71, 96, 'colorless gas exhibiting a lilac/violet glow when placed in a high voltage electric field', 'Lord Rayleigh', 18, 3],
  [19, 'K', 'Potassium', 39.09831, 0.862, 336.7, 1032, 0.82, 48.383, 418.8, 3052, 29.6, '[Ar]4s1', 1, 4, 's', 'Solid', 'alkali metal', [2, 8, 8, 1], 220, 196, 'silvery gray', 'Humphry Davy', 1, 4],
  [20, 'Ca', 'Calcium', 40.0784, 1.55, 1115, 1757, 1, 2.37, 589.8, 1145.4, 25.929, '[Ar]4s2', 2, 4, 's', 'Solid', 'alkaline earth metal', [2, 8, 8, 2], 180, 171, null, 'Humphry Davy', 2, 4],
  [21, 'Sc', 'Scandium', 44.9559085, 2.985, 1814, 3109, 1.36, 18, 633.1, 1235, 25.52, '[Ar]3d1·4s2', 3, 4, 'd', 'Solid', 'transition metal', [2, 8, 9, 2], 160, 148, 'silvery white', 'Lars Fredrik Nilson', 3, 4],
  [22, 'Ti', 'Titanium', 47.8671, 4.506, 1941, 3560, 1.54, 7.289, 658.8, 1309.8, 25.06, '[Ar]3d2·4s2', 4, 4, 'd', 'Solid', 'transition metal', [2, 8, 10, 2], 140, 136, 'silvery grey-white metallic', 'William Gregor', 4, 4],
  [23, 'V', 'Vanadium', 50.94151, 6, 2183, 3680, 1.63, 50.911, 650.9, 1414, 24.89, '[Ar]3d3·4s2', 5, 4, 'd', 'Solid', 'transition metal', [2, 8, 11, 2], 135, 134, 'blue-silver-grey metal', 'Andrés Manuel del Río', 5, 4],
  [24, 'Cr', 'Chromium', 51.99616, 7.19, 2180, 2944, 1.66, 65.21, 652.9, 1590.6, 23.35, '[Ar]3d5·4s1', 6, 4, 'd', 'Solid', 'transition metal', [2, 8, 13, 1], 140, 122, 'silvery metallic', 'Louis Nicolas Vauquelin', 6, 4],
  [25, 'Mn', 'Manganese', 54.9380443, 7.21, 1519, 2334, 1.55, -50, 717.3, 1509, 26.32, '[Ar]3d5·4s2', 7, 4, 'd', 'Solid', 'transition metal', [2, 8, 13, 2], 140, 119, 'silvery metallic', 'Torbern Olof Bergman', 7, 4],
  [26, 'Fe', 'Iron', 55.8452, 7.874, 1811, 3134, 1.83, 14.785, 762.5, 1561.9, 25.1, '[Ar]3d6·4s2', 8, 4, 'd', 'Solid', 'transition metal', [2, 8, 14, 2], 140, 116, 'lustrous metallic with a grayish tinge', '5000 BC', 8, 4],
  [27, 'Co', 'Cobalt', 58.9331944, 8.9, 1768, 3200, 1.88, 63.898, 760.4, 1648, 24.81, '[Ar]3d7·4s2', 9, 4, 'd', 'Solid', 'transition metal', [2, 8, 15, 2], 135, 111, 'hard lustrous gray metal', 'Georg Brandt', 9, 4],
  [28, 'Ni', 'Nickel', 58.69344, 8.908, 1728, 3003, 1.91, 111.65, 737.1, 1753, 26.07, '[Ar]3d8·4s2', 10, 4, 'd', 'Solid', 'transition metal', [2, 8, 16, 2], 135, 110, 'lustrous, metallic, and silver with a gold tinge', 'Axel Fredrik Cronstedt', 10, 4],
  [29, 'Cu', 'Copper', 63.5463, 8.96, 1357.77, 2835, 1.9, 119.235, 745.5, 1957.9, 24.44, '[Ar]3d10·4s1', 11, 4, 'd', 'Solid', 'transition metal', [2, 8, 18, 1], 135, 112, 'red-orange metallic luster', 'Middle East', 11, 4],
  [30, 'Zn', 'Zinc', 65.382, 7.14, 692.68, 1180, 1.65, -58, 906.4, 1733.3, 25.47, '[Ar]3d10·4s2', 12, 4, 'd', 'Solid', 'transition metal', [2, 8, 18, 2], 135, 118, 'silver-gray', 'India', 12, 4],
  [31, 'Ga', 'Gallium', 69.7231, 5.91, 302.9146, 2673, 1.81, 41, 578.8, 1979.3, 25.86, '[Ar]3d10·4s2·4p1', 13, 4, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 3], 130, 124, 'silver-white', 'Lecoq de Boisbaudran', 13, 4],
  [32, 'Ge', 'Germanium', 72.6308, 5.323, 1211.4, 3106, 2.01, 118.9352, 762, 1537.5, 23.222, '[Ar]3d10·4s2·4p2', 14, 4, 'p', 'Solid', 'metalloid', [2, 8, 18, 4], 125, 121, 'grayish-white', 'Clemens Winkler', 14, 4],
  [33, 'As', 'Arsenic', 74.9215956, 5.727, 1090, null, 2.18, 77.65, 947, 1798, 24.64, '[Ar]3d10·4s2·4p3', 15, 4, 'p', 'Solid', 'metalloid', [2, 8, 18, 5], 115, 121, 'metallic grey', 'Bronze Age', 15, 4],
  [34, 'Se', 'Selenium', 78.9718, 4.81, 494, 958, 2.55, 194.9587, 941, 2045, 25.363, '[Ar]3d10·4s2·4p4', 16, 4, 'p', 'Solid', 'polyatomic nonmetal', [2, 8, 18, 6], 115, 116, 'black, red, and gray (not pictured) allotropes', 'Jöns Jakob Berzelius', 16, 4],
  [35, 'Br', 'Bromine', 79.904, 3.1028, 265.8, 332, 2.96, 324.537, 1139.9, 2103, null, '[Ar]3d10·4s2·4p5', 17, 4, 'p', 'Liquid', 'diatomic nonmetal', [2, 8, 18, 7], 115, 114, null, 'Antoine Jérôme Balard', 17, 4],
  [36, 'Kr', 'Krypton', 83.7982, 0.003749, 115.78, 119.93, 3, -96, 1350.8, 2350.4, null, '[Ar]3d10·4s2·4p6', 18, 4, 'p', 'Gas', 'noble gas', [2, 8, 18, 8], null, 117, 'colorless gas, exhibiting a whitish glow in a high electric field', 'William Ramsay', 18, 4],
  [37, 'Rb', 'Rubidium', 85.46783, 1.532, 312.45, 961, 0.82, 46.884, 403, 2633, 31.06, '[Kr]5s1', 1, 5, 's', 'Solid', 'alkali metal', [2, 8, 18, 8, 1], 235, 210, 'grey white', 'Robert Bunsen', 1, 5],
  [38, 'Sr', 'Strontium', 87.621, 2.64, 1050, 1650, 0.95, 5.023, 549.5, 1064.2, 26.4, '[Kr]5s2', 2, 5, 's', 'Solid', 'alkaline earth metal', [2, 8, 18, 8, 2], 200, 185, null, 'William Cruickshank (chemist)', 2, 5],
  [39, 'Y', 'Yttrium', 88.905842, 4.472, 1799, 3203, 1.22, 29.6, 600, 1180, 26.53, '[Kr]4d1·5s2', 3, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 9, 2], 180, 163, 'silvery white', 'Johan Gadolin', 3, 5],
  [40, 'Zr', 'Zirconium', 91.2242, 6.52, 2128, 4650, 1.33, 41.806, 640.1, 1270, 25.36, '[Kr]4d2·5s2', 4, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 10, 2], 155, 154, 'silvery white', 'Martin Heinrich Klaproth', 4, 5],
  [41, 'Nb', 'Niobium', 92.906372, 8.57, 2750, 5017, 1.6, 88.516, 652.1, 1380, 24.6, '[Kr]4d4·5s1', 5, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 12, 1], 145, 147, 'gray metallic, bluish when oxidized', 'Charles Hatchett', 5, 5],
  [42, 'Mo', 'Molybdenum', 95.951, 10.28, 2896, 4912, 2.16, 72.1, 684.3, 1560, 24.06, '[Kr]4d5·5s1', 6, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 13, 1], 145, 138, 'gray metallic', 'Carl Wilhelm Scheele', 6, 5],
  [43, 'Tc', 'Technetium', 98, 11, 2430, 4538, 1.9, 53, 702, 1470, 24.27, '[Kr]4d5·5s2', 7, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 13, 2], 135, 128, 'shiny gray metal', 'Emilio Segrè', 7, 5],
  [44, 'Ru', 'Ruthenium', 101.072, 12.45, 2607, 4423, 2.2, 100.96, 710.2, 1620, 24.06, '[Kr]4d7·5s1', 8, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 15, 1], 130, 125, 'silvery white metallic', 'Karl Ernst Claus', 8, 5],
  [45, 'Rh', 'Rhodium', 102.905502, 12.41, 2237, 3968, 2.28, 110.27, 719.7, 1740, 24.98, '[Kr]4d8·5s1', 9, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 16, 1], 135, 125, 'silvery white metallic', 'William Hyde Wollaston', 9, 5],
  [46, 'Pd', 'Palladium', 106.421, 12.023, 1828.05, 3236, 2.2, 54.24, 804.4, 1870, 25.98, '[Kr]4d10', 10, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 18], 140, 120, 'silvery white', 'William Hyde Wollaston', 10, 5],
  [47, 'Ag', 'Silver', 107.86822, 10.49, 1234.93, 2435, 1.93, 125.862, 731, 2070, 25.35, '[Kr]4d10·5s1', 11, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 18, 1], 160, 128, 'lustrous white metal', 'unknown, before 5000 BC', 11, 5],
  [48, 'Cd', 'Cadmium', 112.4144, 8.65, 594.22, 1040, 1.69, -68, 867.8, 1631.4, 26.02, '[Kr]4d10·5s2', 12, 5, 'd', 'Solid', 'transition metal', [2, 8, 18, 18, 2], 155, 136, 'silvery bluish-gray metallic', 'Karl Samuel Leberecht Hermann', 12, 5],
  [49, 'In', 'Indium', 114.8181, 7.31, 429.7485, 2345, 1.78, 37.043, 558.3, 1820.7, 26.74, '[Kr]4d10·5s2·5p1', 13, 5, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 18, 3], 155, 142, 'silvery lustrous gray', 'Ferdinand Reich', 13, 5],
  [50, 'Sn', 'Tin', 118.7107, 7.365, 505.08, 2875, 1.96, 107.2984, 708.6, 1411.8, 27.112, '[Kr]4d10·5s2·5p2', 14, 5, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 18, 4], 145, 140, 'silvery-white (beta, β) or gray (alpha, α)', 'unknown, before 3500 BC', 14, 5],
  [51, 'Sb', 'Antimony', 121.7601, 6.697, 903.78, 1908, 2.05, 101.059, 834, 1594.9, 25.23, '[Kr]4d10·5s2·5p3', 15, 5, 'p', 'Solid', 'metalloid', [2, 8, 18, 18, 5], 145, 140, 'silvery lustrous gray', 'unknown, before 3000 BC', 15, 5],
  [52, 'Te', 'Tellurium', 127.603, 6.24, 722.66, 1261, 2.1, 190.161, 869.3, 1790, 25.73, '[Kr]4d10·5s2·5p4', 16, 5, 'p', 'Solid', 'metalloid', [2, 8, 18, 18, 6], 140, 136, null, 'Franz-Joseph Müller von Reichenstein', 16, 5],
  [53, 'I', 'Iodine', 126.904473, 4.933, 386.85, 457.4, 2.66, 295.1531, 1008.4, 1845.9, null, '[Kr]4d10·5s2·5p5', 17, 5, 'p', 'Solid', 'diatomic nonmetal', [2, 8, 18, 18, 7], 140, 133, 'lustrous metallic gray, violet as a gas', 'Bernard Courtois', 17, 5],
  [54, 'Xe', 'Xenon', 131.2936, 0.005894, 161.4, 165.051, 2.6, -77, 1170.4, 2046.4, null, '[Kr]4d10·5s2·5p6', 18, 5, 'p', 'Gas', 'noble gas', [2, 8, 18, 18, 8], null, 131, 'colorless gas, exhibiting a blue glow when placed in a high voltage electric field', 'William Ramsay', 18, 5],
  [55, 'Cs', 'Cesium', 132.905451966, 1.93, 301.7, 944, 0.79, 45.505, 375.7, 2234.3, 32.21, '[Xe]6s1', 1, 6, 's', 'Solid', 'alkali metal', [2, 8, 18, 18, 8, 1], 260, 232, 'silvery gold', 'Robert Bunsen', 1, 6],
  [56, 'Ba', 'Barium', 137.3277, 3.51, 1000, 2118, 0.89, 13.954, 502.9, 965.2, 28.07, '[Xe]6s2', 2, 6, 's', 'Solid', 'alkaline earth metal', [2, 8, 18, 18, 8, 2], 215, 196, null, 'Carl Wilhelm Scheele', 2, 6],
  [57, 'La', 'Lanthanum', 138.905477, 6.162, 1193, 3737, 1.1, 53, 538.1, 1067, 27.11, '[Xe]5d16s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 18, 9, 2], 195, 180, 'silvery white', 'Carl Gustaf Mosander', 3, 9],
  [58, 'Ce', 'Cerium', 140.1161, 6.77, 1068, 3716, 1.12, 55, 534.4, 1050, 26.94, '[Xe]4f1·5d1·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 19, 9, 2], 185, 163, 'silvery white', 'Martin Heinrich Klaproth', 4, 9],
  [59, 'Pr', 'Praseodymium', 140.907662, 6.77, 1208, 3403, 1.13, 93, 527, 1020, 27.2, '[Xe]4f3·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 21, 8, 2], 185, 176, 'grayish white', 'Carl Auer von Welsbach', 5, 9],
  [60, 'Nd', 'Neodymium', 144.2423, 7.01, 1297, 3347, 1.14, 184.87, 533.1, 1040, 27.45, '[Xe]4f4·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 22, 8, 2], 185, 174, 'silvery white', 'Carl Auer von Welsbach', 6, 9],
  [61, 'Pm', 'Promethium', 145, 7.26, 1315, 3273, 1.13, 12.45, 540, 1050, null, '[Xe]4f5·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 23, 8, 2], 185, 173, 'metallic', 'Chien Shiung Wu', 7, 9],
  [62, 'Sm', 'Samarium', 150.362, 7.52, 1345, 2173, 1.17, 15.63, 544.5, 1070, 29.54, '[Xe]4f6·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 24, 8, 2], 185, 172, 'silvery white', 'Lecoq de Boisbaudran', 8, 9],
  [63, 'Eu', 'Europium', 151.9641, 5.264, 1099, 1802, 1.2, 11.2, 547.1, 1085, 27.66, '[Xe]4f7·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 25, 8, 2], 185, 168, null, 'Eugène-Anatole Demarçay', 9, 9],
  [64, 'Gd', 'Gadolinium', 157.253, 7.9, 1585, 3273, 1.2, 13.22, 593.4, 1170, 37.03, '[Xe]4f7·5d1·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 25, 9, 2], 180, 169, 'silvery white', 'Jean Charles Galissard de Marignac', 10, 9],
  [65, 'Tb', 'Terbium', 158.925352, 8.23, 1629, 3396, 1.1, 112.4, 565.8, 1110, 28.91, '[Xe]4f9·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 27, 8, 2], 175, 168, 'silvery white', 'Carl Gustaf Mosander', 11, 9],
  [66, 'Dy', 'Dysprosium', 162.5001, 8.54, 1680, 2840, 1.22, 33.96, 573, 1130, 27.7, '[Xe]4f10·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 28, 8, 2], 175, 167, 'silvery white', 'Lecoq de Boisbaudran', 12, 9],
  [67, 'Ho', 'Holmium', 164.930332, 8.79, 1734, 2873, 1.23, 32.61, 581, 1140, 27.15, '[Xe]4f11·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 29, 8, 2], 175, 166, 'silvery white', 'Marc Delafontaine', 13, 9],
  [68, 'Er', 'Erbium', 167.2593, 9.066, 1802, 3141, 1.24, 30.1, 589.3, 1150, 28.12, '[Xe]4f12·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 30, 8, 2], 175, 165, 'silvery white', 'Carl Gustaf Mosander', 14, 9],
  [69, 'Tm', 'Thulium', 168.934222, 9.32, 1818, 2223, 1.25, 99, 596.7, 1160, 27.03, '[Xe]4f13·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 31, 8, 2], 175, 164, 'silvery gray', 'Per Teodor Cleve', 15, 9],
  [70, 'Yb', 'Ytterbium', 173.0451, 6.9, 1097, 1469, 1.1, -1.93, 603.4, 1174.8, 26.74, '[Xe]4f14·6s2', 3, 6, 'f', 'Solid', 'lanthanide', [2, 8, 18, 32, 8, 2], 175, 170, null, 'Jean Charles Galissard de Marignac', 16, 9],
  [71, 'Lu', 'Lutetium', 174.96681, 9.841, 1925, 3675, 1.27, 33.4, 523.5, 1340, 26.86, '[Xe]4f14·5d1·6s2', 3, 6, 'd', 'Solid', 'lanthanide', [2, 8, 18, 32, 9, 2], 175, 162, 'silvery white', 'Georges Urbain', 17, 9],
  [72, 'Hf', 'Hafnium', 178.492, 13.31, 2506, 4876, 1.3, 17.18, 658.5, 1440, 25.73, '[Xe]4f14·5d2·6s2', 4, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 10, 2], 155, 152, 'steel gray', 'Dirk Coster', 4, 6],
  [73, 'Ta', 'Tantalum', 180.947882, 16.69, 3290, 5731, 1.5, 31, 761, 1500, 25.36, '[Xe]4f14·5d3·6s2', 5, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 11, 2], 145, 146, 'gray blue', 'Anders Gustaf Ekeberg', 5, 6],
  [74, 'W', 'Tungsten', 183.841, 19.25, 3695, 6203, 2.36, 78.76, 770, 1700, 24.27, '[Xe]4f14·5d4·6s2', 6, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 12, 2], 135, 137, 'grayish white, lustrous', 'Carl Wilhelm Scheele', 6, 6],
  [75, 'Re', 'Rhenium', 186.2071, 21.02, 3459, 5869, 1.9, 5.8273, 760, 1260, 25.48, '[Xe]4f14·5d5·6s2', 7, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 13, 2], 135, 131, 'silvery-grayish', 'Masataka Ogawa', 7, 6],
  [76, 'Os', 'Osmium', 190.233, 22.59, 3306, 5285, 2.2, 103.99, 840, 1600, 24.7, '[Xe]4f14·5d6·6s2', 8, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 14, 2], 130, 129, 'silvery, blue cast', 'Smithson Tennant', 8, 6],
  [77, 'Ir', 'Iridium', 192.2173, 22.56, 2719, 4403, 2.2, 150.94, 880, 1600, 25.1, '[Xe]4f14·5d7·6s2', 9, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 15, 2], 135, 122, 'silvery white', 'Smithson Tennant', 9, 6],
  [78, 'Pt', 'Platinum', 195.0849, 21.45, 2041.4, 4098, 2.28, 205.041, 870, 1791, 25.86, '[Xe]4f14·5d9·6s1', 10, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 17, 1], 135, 123, 'silvery white', 'Antonio de Ulloa', 10, 6],
  [79, 'Au', 'Gold', 196.9665695, 19.3, 1337.33, 3243, 2.54, 222.747, 890.1, 1980, 25.418, '[Xe]4f14·5d10·6s1', 11, 6, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 18, 1], 135, 124, 'metallic yellow', 'Middle East', 11, 6],
  [80, 'Hg', 'Mercury', 200.5923, 13.534, 234.321, 629.88, 2, -48, 1007.1, 1810, 27.983, '[Xe]4f14·5d10·6s2', 12, 6, 'd', 'Liquid', 'transition metal', [2, 8, 18, 32, 18, 2], 150, 133, 'silvery', 'unknown, before 2000 BCE', 12, 6],
  [81, 'Tl', 'Thallium', 204.38, 11.85, 577, 1746, 1.62, 36.4, 589.4, 1971, 26.32, '[Xe]4f14·5d10·6s2·6p1', 13, 6, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 32, 18, 3], 190, 144, 'silvery white', 'William Crookes', 13, 6],
  [82, 'Pb', 'Lead', 207.21, 11.34, 600.61, 2022, 1.87, 34.4204, 715.6, 1450.5, 26.65, '[Xe]4f14·5d10·6s2·6p2', 14, 6, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 32, 18, 4], 180, 144, 'metallic gray', 'Middle East', 14, 6],
  [83, 'Bi', 'Bismuth', 208.980401, 9.78, 544.7, 1837, 2.02, 90.924, 703, 1610, 25.52, '[Xe]4f14·5d10·6s2·6p3', 15, 6, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 32, 18, 5], 160, 151, 'lustrous silver', 'Claude François Geoffroy', 15, 6],
  [84, 'Po', 'Polonium', 209, 9.196, 527, 1235, 2, 136, 812.1, null, 26.4, '[Xe]4f14·5d10·6s2·6p4', 16, 6, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 32, 18, 6], 190, 145, 'silvery', 'Pierre Curie', 16, 6],
  [85, 'At', 'Astatine', 210, 6.35, 575, 610, 2.2, 233, 899.003, null, null, '[Xe]4f14·5d10·6s2·6p5', 17, 6, 'p', 'Solid', 'metalloid', [2, 8, 18, 32, 18, 7], null, 147, 'unknown, probably metallic', 'Dale R. Corson', 17, 6],
  [86, 'Rn', 'Radon', 222, 0.00973, 202, 211.5, 2.2, -68, 1037, null, null, '[Xe]4f14·5d10·6s2·6p6', 18, 6, 'p', 'Gas', 'noble gas', [2, 8, 18, 32, 18, 8], null, 142, 'colorless gas, occasionally glows green or red in discharge tubes', 'Friedrich Ernst Dorn', 18, 6],
  [87, 'Fr', 'Francium', 223, 1.87, 300, 950, 0.79, 46.89, 380, null, null, '[Rn]7s1', 1, 7, 's', 'Solid', 'alkali metal', [2, 8, 18, 32, 18, 8, 1], null, null, null, 'Marguerite Perey', 1, 7],
  [88, 'Ra', 'Radium', 226, 5.5, 1233, 2010, 0.9, 9.6485, 509.3, 979, null, '[Rn]7s2', 2, 7, 's', 'Solid', 'alkaline earth metal', [2, 8, 18, 32, 18, 8, 2], 215, 201, 'silvery white metallic', 'Pierre Curie', 2, 7],
  [89, 'Ac', 'Actinium', 227, 10, 1500, 3500, 1.1, 33.77, 499, 1170, 27.2, '[Rn]6d1·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 18, 9, 2], 195, 186, null, 'Friedrich Oskar Giesel', 3, 10],
  [90, 'Th', 'Thorium', 232.03774, 11.724, 2023, 5061, 1.3, 112.72, 587, 1110, 26.23, '[Rn]6d2·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 18, 10, 2], 180, 175, 'silvery, often with black tarnish', 'Jöns Jakob Berzelius', 4, 10],
  [91, 'Pa', 'Protactinium', 231.035882, 15.37, 1841, 4300, 1.5, 53.03, 568, null, null, '[Rn]5f2·6d1·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 20, 9, 2], 180, 169, 'bright, silvery metallic luster', 'William Crookes', 5, 10],
  [92, 'U', 'Uranium', 238.028913, 19.1, 1405.3, 4404, 1.38, 50.94, 597.6, 1420, 27.665, '[Rn]5f3·6d1·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 21, 9, 2], 175, 170, null, 'Martin Heinrich Klaproth', 6, 10],
  [93, 'Np', 'Neptunium', 237, 20.45, 912, 4447, 1.36, 45.85, 604.5, null, 29.46, '[Rn]5f4·6d1·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 22, 9, 2], 175, 171, 'silvery metallic', 'Edwin McMillan', 7, 10],
  [94, 'Pu', 'Plutonium', 244, 19.816, 912.5, 3505, 1.28, -48.33, 584.7, null, 35.5, '[Rn]5f6·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 24, 8, 2], 175, 172, 'silvery white, tarnishing to dark gray in air', 'Glenn T. Seaborg', 8, 10],
  [95, 'Am', 'Americium', 243, 12, 1449, 2880, 1.13, 9.93, 578, null, 62.7, '[Rn]5f7·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 25, 8, 2], 175, 166, 'silvery white', 'Glenn T. Seaborg', 9, 10],
  [96, 'Cm', 'Curium', 247, 13.51, 1613, 3383, 1.28, 27.17, 581, null, null, '[Rn]5f7·6d1·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 25, 9, 2], 176, 166, 'silvery metallic, glows purple in the dark', 'Glenn T. Seaborg', 10, 10],
  [97, 'Bk', 'Berkelium', 247, 14.78, 1259, 2900, 1.3, -165.24, 601, null, null, '[Rn]5f9·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 27, 8, 2], null, null, 'silvery', 'Lawrence Berkeley National Laboratory', 11, 10],
  [98, 'Cf', 'Californium', 251, 15.1, 1173, 1743, 1.3, -97.31, 608, null, null, '[Rn]5f10·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 28, 8, 2], null, null, 'silvery', 'Lawrence Berkeley National Laboratory', 12, 10],
  [99, 'Es', 'Einsteinium', 252, 8.84, 1133, 1269, 1.3, -28.6, 619, null, null, '[Rn]5f11·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 29, 8, 2], null, null, 'silver-colored', 'Lawrence Berkeley National Laboratory', 13, 10],
  [100, 'Fm', 'Fermium', 257, null, 1800, null, 1.3, 33.96, 627, null, null, '[Rn]5f12·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 30, 8, 2], null, null, null, 'Lawrence Berkeley National Laboratory', 14, 10],
  [101, 'Md', 'Mendelevium', 258, null, 1100, null, 1.3, 93.91, 635, null, null, '[Rn]5f13·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 31, 8, 2], null, null, null, 'Lawrence Berkeley National Laboratory', 15, 10],
  [102, 'No', 'Nobelium', 259, null, 1100, null, 1.3, -223.22, 642, null, null, '[Rn]5f14·7s2', 3, 7, 'f', 'Solid', 'actinide', [2, 8, 18, 32, 32, 8, 2], null, null, null, 'Joint Institute for Nuclear Research', 16, 10],
  [103, 'Lr', 'Lawrencium', 266, null, 1900, null, 1.3, -30.04, 470, null, null, '[Rn]5f14·7s2·7p1', 3, 7, 'd', 'Solid', 'actinide', [2, 8, 18, 32, 32, 8, 3], null, null, null, 'Lawrence Berkeley National Laboratory', 17, 10],
  [104, 'Rf', 'Rutherfordium', 267, 23.2, 2400, 5800, null, null, 580, null, null, '[Rn]5f14·6d2·7s2', 4, 7, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 32, 10, 2], null, null, null, 'Joint Institute for Nuclear Research', 4, 7],
  [105, 'Db', 'Dubnium', 268, 29.3, null, null, null, null, null, null, null, '*[Rn]·5f14·6d3·7s2', 5, 7, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 32, 11, 2], null, null, null, 'Joint Institute for Nuclear Research', 5, 7],
  [106, 'Sg', 'Seaborgium', 269, 35, null, null, null, null, null, null, null, '*[Rn]·5f14·6d4·7s2', 6, 7, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 32, 12, 2], null, null, null, 'Lawrence Berkeley National Laboratory', 6, 7],
  [107, 'Bh', 'Bohrium', 270, 37.1, null, null, null, null, null, null, null, '*[Rn]·5f14·6d5·7s2', 7, 7, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 32, 13, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 7, 7],
  [108, 'Hs', 'Hassium', 269, 40.7, null, null, null, null, null, null, null, '*[Rn]·5f14·6d6·7s2', 8, 7, 'd', 'Solid', 'transition metal', [2, 8, 18, 32, 32, 14, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 8, 7],
  [109, 'Mt', 'Meitnerium', 278, 37.4, null, null, null, null, null, null, null, '*[Rn]·5f14·6d7·7s2', 9, 7, 'd', 'Solid', 'unknown, probably transition metal', [2, 8, 18, 32, 32, 15, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 9, 7],
  [110, 'Ds', 'Darmstadtium', 281, 34.8, null, null, null, null, null, null, null, '*[Rn]·5f14·6d9·7s1', 10, 7, 'd', 'Solid', 'unknown, probably transition metal', [2, 8, 18, 32, 32, 16, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 10, 7],
  [111, 'Rg', 'Roentgenium', 282, 28.7, null, null, null, 151, null, null, null, '*[Rn]·5f14·6d10·7s1', 11, 7, 'd', 'Solid', 'unknown, probably transition metal', [2, 8, 18, 32, 32, 17, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 11, 7],
  [112, 'Cn', 'Copernicium', 285, 14.0, 283, 340, null, null, null, null, null, '*[Rn]·5f14·6d10·7s2', 12, 7, 'd', 'Liquid', 'transition metal', [2, 8, 18, 32, 32, 18, 2], null, null, null, 'Gesellschaft für Schwerionenforschung', 12, 7],
  [113, 'Nh', 'Nihonium', 286, 16, 700, 1430, null, 66.6, null, null, null, '*[Rn]·5f14·6d10·7s2·7p1', 13, 7, 'p', 'Solid', 'unknown, probably transition metal', [2, 8, 18, 32, 32, 18, 3], null, null, null, 'RIKEN', 13, 7],
  [114, 'Fl', 'Flerovium', 289, 14, 340, 420, null, null, null, null, null, '*[Rn]·5f14·6d10·7s2·7p2', 14, 7, 'p', 'Solid', 'post-transition metal', [2, 8, 18, 32, 32, 18, 4], null, null, null, 'Joint Institute for Nuclear Research', 14, 7],
  [115, 'Mc', 'Moscovium', 289, 13.5, 670, 1400, null, 35.3, null, null, null, '*[Rn]·5f14·6d10·7s2·7p3', 15, 7, 'p', 'Solid', 'unknown, probably post-transition metal', [2, 8, 18, 32, 32, 18, 5], null, null, null, 'Joint Institute for Nuclear Research', 15, 7],
  [116, 'Lv', 'Livermorium', 293, 12.9, 709, 1085, null, 74.9, null, null, null, '*[Rn]·5f14·6d10·7s2·7p4', 16, 7, 'p', 'Solid', 'unknown, probably post-transition metal', [2, 8, 18, 32, 32, 18, 6], null, null, null, 'Joint Institute for Nuclear Research', 16, 7],
  [117, 'Ts', 'Tennessine', 294, 7.17, 723, 883, null, 165.9, null, null, null, '*[Rn]·5f14·6d10·7s2·7p5', 17, 7, 'p', 'Solid', 'unknown, probably metalloid', [2, 8, 18, 32, 32, 18, 7], null, null, null, 'Joint Institute for Nuclear Research', 17, 7],
  [118, 'Og', 'Oganesson', 294, 4.95, null, 350, null, 5.40318, null, null, null, '*[Rn]·5f14·6d10·7s2·7p6', 18, 7, 'p', 'Solid', 'unknown, predicted to be noble gas', [2, 8, 18, 32, 32, 18, 8], null, null, null, 'Joint Institute for Nuclear Research', 18, 7],
]);
