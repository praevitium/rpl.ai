// SPDX-License-Identifier: GPL-3.0-or-later
//
// Giac CAS engine adapter — synchronous main-thread variant.
//
// Giac (Bernard Parisse, Institut Fourier) is the CAS we delegate to for
// FACTOR, EXPAND, DERIV, INTEG, SOLVE, TEXPAND, TLIN, series, limits,
// and everything else symbolic. This module is the single place the rest
// of the codebase talks to Giac through.
//
// Why main-thread + sync (not a worker):
//   A Web Worker forces every caseval() call to be a Promise, which means
//   every op that touches the CAS becomes async, which means the whole
//   eval loop has to be async-capable. Blanket-asyncifying every op causes
//   the eval loop to yield microtasks between steps, and tests that assert
//   stack state immediately after `lookup('X').fn(s)` trip on un-settled
//   state. Premature async is the enemy.
//
//   Emscripten's generated caseval is a synchronous C function. Running
//   Giac on the main thread lets us call it synchronously via ccall, and
//   the entire FACTOR/EXPAND/etc. pipeline stays a normal sync op.
//
//   Cost: heavy CAS calls (e.g. a nasty symbolic integral) block the UI
//   while running. For a classroom calculator with reasonable inputs
//   this is fine. If we ever need backgrounding for specific ops, we can
//   add an opt-in "offload this one call" path via a worker later.
//
// Environment handling:
//   Browser (Tauri webview):
//     - Calls init() to load www/src/vendor/giac/giacwasm.js as a
//       <script>, wait for emscripten's onRuntimeInitialized, then grab
//       a synchronous cwrap of caseval.
//     - After init() resolves, caseval(cmd) returns a string synchronously.
//   Node (tests):
//     - Mock engine backed by a fixture map. Real Giac is intentionally
//       not run in Node — the 12 MB emscripten build is browser-targeted,
//       and the surface we care about testing in Node is the *adapter*
//       (AST <-> Giac string conversion), not Giac's math itself.
//     - caseval is likewise synchronous.
//
// Public API:
//     await giac.init()      // idempotent; resolves once ready
//     giac.isReady()         // boolean — true once init() has resolved
//     giac.caseval(cmd)      // synchronous; throws if not ready
//     giac.toLatex(expr)     // shortcut: caseval(`latex(${expr})`)

import { stripGiacQuotes } from "./giac-convert.mjs";
import { state as calcState } from "../state.js";

const isBrowser =
  typeof globalThis !== "undefined" &&
  typeof globalThis.document !== "undefined" &&
  typeof globalThis.window !== "undefined";

/* ------------------------------------------------------------------
   Browser: main-thread synchronous engine.

   Load sequence:
     1. Install window.Module with locateFile + onRuntimeInitialized.
     2. <script src="giacwasm.js"> — emscripten sees window.Module and
        attaches its generated code to it.
     3. Emscripten loads the .wasm (async network fetch + instantiate).
     4. onRuntimeInitialized fires; we cwrap caseval; init() resolves.
     5. Callers now have synchronous giac.caseval(cmd).

   locateFile must return the path to giacwasm.wasm relative to the
   document. The vendored blob lives at /src/vendor/giac/giacwasm.wasm
   relative to the served www/ root, so that's the literal URL.
   ------------------------------------------------------------------ */

class BrowserGiacEngine {
  constructor() {
    this._ready = null;
    this._resolved = false;
    this._caseval = null;    // sync string -> string, once ready
    // null means "never set, re-sync on the next caseval".  Tracked so
    // we only pay a round-trip when the calculator's mode changed.
    this._angleSent = null;
  }

  // Giac has no native gradian mode — GRD numerics flow through
  // rpl5050's own toRadians / fromRadians helpers, so for symbolic Giac
  // calls we collapse GRD onto DEG (closest match).
  _angleFlagForMode(mode) {
    return mode === "RAD" ? 1 : 0;
  }

  _syncAngleMode() {
    const want = this._angleFlagForMode(calcState.angle);
    if (this._angleSent === want) return;
    // Bypass the public caseval so we don't recurse.
    this._caseval(`angle_radian:=${want}`);
    this._angleSent = want;
  }

  init() {
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      try {
        // The vendored giacwasm.js was compiled out of the Xcas/Pyiodide
        // build that assumes a host-provided `window.UI` object — at
        // runtime Giac touches `UI.Datestart` (for `_emscripten_get_now`-
        // style timing) and `UI.warnpy` (Python-warning gate).  When
        // `UI` is missing every code path that hits either property
        // throws a JS `ReferenceError`, which Giac surfaces back through
        // `caseval` as `<func>: UI is not defined` — observed on
        // `factor(x^3+3*x^2+3*x+1)` and `solve(...,x)`.  Install a minimal
        // shim before the wasm script attaches so those lookups resolve.
        // Idempotent: don't clobber if a richer UI object is already
        // present (e.g. embedded inside a larger Xcas page).
        if (!window.UI) {
          window.UI = {
            warnpy: false,            // suppress Python-warning channel
            Datestart: Date.now(),    // baseline for emscripten timing
          };
        }

        // Emscripten reads window.Module before giacwasm.js attaches.
        window.Module = {
          noExitRuntime: true,
          print: function (_t) { /* silent; uncomment for debug */ },
          printErr: function (_t) { /* silent; uncomment for debug */ },
          locateFile: function (name) {
            if (name.endsWith(".wasm")) return "/src/vendor/giac/giacwasm.wasm";
            return name;
          },
          onRuntimeInitialized: () => {
            try {
              this._caseval = window.Module.cwrap("caseval", "string", ["string"]);
              this._resolved = true;
              resolve();
            } catch (e) {
              reject(new Error(`Giac cwrap failed: ${(e && e.message) || e}`));
            }
          },
          onAbort: (reason) => {
            reject(new Error(`Giac aborted: ${(reason && reason.message) || reason}`));
          },
        };
        const script = document.createElement("script");
        script.src = "/src/vendor/giac/giacwasm.js";
        script.async = true;
        script.onerror = () => reject(new Error("Failed to load giacwasm.js"));
        document.head.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });
    return this._ready;
  }

  isReady() {
    return this._resolved;
  }

  caseval(cmd) {
    if (!this._resolved) {
      throw new Error("Giac not initialized — call await giac.init() first");
    }
    if (typeof cmd !== "string") {
      throw new TypeError(`giac.caseval: expected string, got ${typeof cmd}`);
    }
    // Sync the active angle mode to Giac before every caseval so trig
    // / inverse-trig in Symbolic ops (SUBST, EVAL, DERIV evaluating to
    // a numeric leaf, etc.) honour the rpl5050 RAD/DEG/GRD setting.
    // Cheap: the helper short-circuits when the mode hasn't changed.
    this._syncAngleMode();
    // Giac wraps many results in literal double-quotes; normalise at the
    // engine boundary so downstream consumers see raw expression text.
    return stripGiacQuotes(this._caseval(cmd));
  }

  toLatex(expr) {
    return this.caseval(`latex(${expr})`);
  }
}

/* ------------------------------------------------------------------
   Node: mock engine for the test suite. Synchronous by design.
   ------------------------------------------------------------------ */

class MockGiacEngine {
  constructor() {
    this._fixtures = new Map();
    this._callLog = [];
    this._defaultThrow = true;
  }

  // --- test helpers (underscore-prefixed; not part of real API) ---
  _setFixture(cmd, result) {
    this._fixtures.set(cmd, result);
  }
  _setFixtures(obj) {
    for (const [k, v] of Object.entries(obj)) this._fixtures.set(k, v);
  }
  _clear() {
    this._fixtures.clear();
    this._callLog.length = 0;
  }
  _callLogCopy() {
    return [...this._callLog];
  }
  // If true, unknown commands throw. If false, they return "" so ops
  // can degrade gracefully in tests that don't care about the result.
  _setStrict(strict) {
    this._defaultThrow = !!strict;
  }

  // --- public API ---
  init() {
    return Promise.resolve();
  }

  isReady() {
    return true;
  }

  caseval(cmd) {
    if (typeof cmd !== "string") {
      throw new TypeError(`giac.caseval: expected string, got ${typeof cmd}`);
    }
    this._callLog.push(cmd);
    if (this._fixtures.has(cmd)) {
      const v = this._fixtures.get(cmd);
      if (v instanceof Error) throw v;
      // Apply the same quote-stripping as the browser engine so
      // fixtures that intentionally model Giac's quoted output (e.g.
      // `"(X+1)^2"`) are normalised identically — tests can pin either
      // shape.
      return stripGiacQuotes(v);
    }
    if (this._defaultThrow) {
      throw new Error(
        `MockGiacEngine: no fixture registered for caseval(${JSON.stringify(cmd)})`,
      );
    }
    return "";
  }

  toLatex(expr) {
    return this.caseval(`latex(${expr})`);
  }
}

/* ------------------------------------------------------------------
   Singleton export.
   ------------------------------------------------------------------ */

export const giac = isBrowser ? new BrowserGiacEngine() : new MockGiacEngine();

// Named exports for environment-specific access in tests. Production
// code should only import { giac }.
export { BrowserGiacEngine, MockGiacEngine };
