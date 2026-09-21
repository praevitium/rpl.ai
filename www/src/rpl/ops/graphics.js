import { RPLError } from '../stack.js';
import { register } from './registry.js';
import { _graphicsHook } from './internal.js';



function _requestPlot(kind, s) {
  if (typeof _graphicsHook !== 'function') {
    throw new RPLError('No graphics view');
  }
  _graphicsHook(kind, s);
}


register('SCATRPLOT', (s) => _requestPlot('scatter', s), { category: 'Graphics', categoryOrder: 2, label: "SCATRPLOT" });

register('BARPLOT',   (s) => _requestPlot('bar', s), { category: 'Graphics', categoryOrder: 0, label: "BARPLOT" });

register('HISTPLOT',  (s) => _requestPlot('hist', s), { category: 'Graphics', categoryOrder: 1, label: "HISTPLOT" });

register('FUNCTION',  (s) => _requestPlot('function', s), { category: 'Graphics', categoryOrder: 3, label: "FUNCTION" });

register('POLAR',     (s) => _requestPlot('polar', s), { category: 'Graphics', categoryOrder: 4, label: "POLAR" });

register('PARAMETRIC',(s) => _requestPlot('parametric', s), { category: 'Graphics', categoryOrder: 5, label: "PARAMETRIC" });

register('DIFFEQ',    (s) => _requestPlot('diffeq', s), { category: 'Graphics', categoryOrder: 7, label: "DIFFEQ" });

register('DRAW',      (s) => _requestPlot('draw', s), { category: 'Graphics', categoryOrder: 6, label: "DRAW" });
