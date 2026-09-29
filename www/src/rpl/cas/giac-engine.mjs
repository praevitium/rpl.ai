// SPDX-License-Identifier: GPL-3.0-or-later
//
// The one place the app talks to Giac.  caseval is synchronous so CAS ops
// stay ordinary sync ops; the price is that a slow call blocks its thread.
// Node (the tests) gets a fixture-backed mock: the wasm build is browser-only.

import { stripGiacQuotes, stripGiacApproxSuffix } from "./giac-convert.mjs";
import { state as calcState } from "../state.js";
import { RPLError, RPLInterrupt } from "../stack.js";

const isBrowser =
  typeof globalThis.document !== "undefined" &&
  typeof globalThis.window !== "undefined";

// A worker (the equation writer's insights) loads its own copy with
// importScripts, so a slow call there can be cut off by terminating it.
const isWorker = typeof globalThis.importScripts === "function";

// Resolved from this module, not the page or the site root, so the page and
// the worker both find Giac and the app can be served under /rpl.ai/.
const GIAC_JS = new URL("../../../vendor/giac/giacwasm.js", import.meta.url).href;
const GIAC_WASM = new URL("../../../vendor/giac/giacwasm.wasm", import.meta.url).href;

// Previews run a command speculatively on every hover.  A Giac call cannot
// be interrupted, so while one is held the CAS refuses instead of starting.
let casHeld = 0;

export function withoutCas(fn) {
  casHeld++;
  try { return fn(); } finally { casHeld--; }
}

function assertCommand(cmd) {
  if (typeof cmd !== "string") {
    throw new TypeError(`giac.caseval: expected string, got ${typeof cmd}`);
  }
}

const normalize = (out) => stripGiacApproxSuffix(stripGiacQuotes(out));

class BrowserGiacEngine {
  constructor() {
    this._ready = null;
    this._caseval = null;
    this._angleSent = null;
  }

  // Giac has no gradians, so GRD symbolic work runs in degrees.
  _syncAngleMode() {
    const want = calcState.angle === "RAD" ? 1 : 0;
    if (this._angleSent === want) return;
    this._caseval(`angle_radian:=${want}`);
    this._angleSent = want;
  }

  init() {
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      // The vendored Xcas build expects its host page's UI object; without
      // it calls like factor() fail with "UI is not defined".
      if (!globalThis.UI) globalThis.UI = { warnpy: false, Datestart: Date.now() };
      globalThis.Module = {
        noExitRuntime: true,
        print: () => {},
        printErr: () => {},
        locateFile: (name) => (name.endsWith(".wasm") ? GIAC_WASM : name),
        onRuntimeInitialized: () => {
          try {
            this._caseval = globalThis.Module.cwrap("caseval", "string", ["string"]);
            resolve();
          } catch (e) {
            reject(new Error(`Giac cwrap failed: ${(e && e.message) || e}`));
          }
        },
        onAbort: (reason) => {
          reject(new Error(`Giac aborted: ${(reason && reason.message) || reason}`));
        },
      };
      if (isWorker) {
        importScripts(GIAC_JS);
        return;
      }
      const script = document.createElement("script");
      script.src = GIAC_JS;
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load giacwasm.js"));
      document.head.appendChild(script);
    });
    return this._ready;
  }

  isReady() {
    return this._caseval !== null;
  }

  // The build has C++ exception catching compiled out, so a Giac error
  // unwinds out of ccall and leaves the wasm stack pointer behind; without
  // the restore, repeated failures overflow the stack and kill the CAS.
  caseval(cmd) {
    if (casHeld) throw new RPLInterrupt();
    if (!this._caseval) {
      throw new Error("Giac not initialized — call await giac.init() first");
    }
    assertCommand(cmd);
    const sp = globalThis.Module.stackSave();
    try {
      this._syncAngleMode();
      return normalize(this._caseval(cmd));
    } catch {
      globalThis.Module.stackRestore(sp);
      this._angleSent = null;
      throw new RPLError("Bad argument value");
    }
  }
}

class MockGiacEngine {
  constructor() {
    this._fixtures = new Map();
    this._callLog = [];
  }

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

  init() {
    return Promise.resolve();
  }

  isReady() {
    return true;
  }

  caseval(cmd) {
    if (casHeld) throw new RPLInterrupt();
    assertCommand(cmd);
    this._callLog.push(cmd);
    if (!this._fixtures.has(cmd)) {
      throw new Error(
        `MockGiacEngine: no fixture registered for caseval(${JSON.stringify(cmd)})`,
      );
    }
    const v = this._fixtures.get(cmd);
    if (v instanceof Error) throw v;
    return normalize(v);
  }
}

export const giac = isBrowser || isWorker ? new BrowserGiacEngine() : new MockGiacEngine();
