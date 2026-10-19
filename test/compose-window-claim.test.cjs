"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../extension/mcp_server/api.js"), "utf8");
// Reuse the production marker extraction pattern in reply-save-draft.test.cjs.
function snippet(name) {
  const start = source.indexOf(`// BEGIN ${name}`);
  const end = source.indexOf(`// END ${name}`, start);
  assert.ok(start >= 0 && end > start, `Missing production marker: ${name}`);
  return source.slice(start, end);
}

const REPLY = 1;
const FORWARD = 4;
const ORIGINAL_URI = "mailbox:///same-original-message";
const tick = () => new Promise(resolve => setImmediate(resolve));

// Adapt race236.cjs's fake windows and observers, with real listener removal
// and exact compose-fields identity as exposed by Thunderbird's reply opener.
function makeHarness(options = {}) {
  const observers = new Set();
  const timers = [];
  const openings = [];
  const windows = [];
  let registrationFailures = options.registrationFailures || 0;

  function makeWindow(label, type, fields = {}) {
    const initListeners = new Set();
    const stateListeners = new Set();
    const win = {
      label,
      initListeners,
      stateListeners,
      initHistory: [],
      stateHistory: [],
      bodies: [],
      recipients: [],
      attachments: [],
      document: { documentElement: { getAttribute: () => "msgcompose" } },
      gComposeType: type,
      gMsgCompose: {
        originalMsgURI: ORIGINAL_URI,
        compFields: fields,
        RegisterStateListener(listener) {
          stateListeners.add(listener);
          win.stateHistory.push(listener);
        },
        UnregisterStateListener(listener) { stateListeners.delete(listener); },
      },
      addEventListener(event, listener, listenerOptions) {
        assert.equal(event, "compose-window-init");
        assert.equal(listenerOptions.capture, true);
        assert.equal(listenerOptions.once, true);
        initListeners.add(listener);
        win.initHistory.push(listener);
      },
      removeEventListener(event, listener, capture) {
        assert.equal(event, "compose-window-init");
        assert.equal(capture, true);
        initListeners.delete(listener);
      },
      fireInit() {
        for (const listener of [...initListeners]) {
          // A previous listener can remove another listener during dispatch.
          if (!initListeners.delete(listener)) continue;
          listener();
        }
      },
      bodyReady() {
        for (const listener of [...stateListeners]) listener.NotifyComposeBodyReady();
      },
    };
    windows.push(win);
    return win;
  }

  function announce(win) {
    for (const observer of [...observers]) observer.observe(win, "domwindowopened");
  }

  function createOpenedWindow(opening) {
    assert.equal(opening.win, undefined, "each native opening creates only one window");
    opening.win = makeWindow(opening.label, opening.type, opening.fields);
    announce(opening.win);
    return opening.win;
  }

  const sandbox = {
    Services: { ww: {
      registerNotification(observer) {
        if (registrationFailures > 0) {
          registrationFailures--;
          throw new Error("window notification registration failed");
        }
        observers.add(observer);
      },
      unregisterNotification(observer) { observers.delete(observer); },
    } },
    Cc: { "@mozilla.org/timer;1": { createInstance() {
      const timer = {
        cancelled: false,
        initWithCallback(callback) { this.callback = callback; },
        cancel() { this.cancelled = true; },
      };
      timers.push(timer);
      return timer;
    } } },
    Ci: {
      nsITimer: { TYPE_ONE_SHOT: 0 },
      nsIMsgCompType: { Reply: REPLY, ForwardInline: FORWARD },
    },
    ChromeUtils: { generateQI: () => () => {} },
    MailServices: { compose: {
      OpenComposeWindowWithParams(_parent, params) {
        const opening = { label: params.label, type: params.type, fields: params.composeFields };
        openings.push(opening);
        createOpenedWindow(opening);
      },
      OpenComposeWindow(_parent, header, _uri, type) {
        // Native forwarding creates its own compose fields, so it cannot use
        // the exact object passed to openComposeWindowWithCustomizations.
        const opening = { label: header.label, type, fields: {} };
        openings.push(opening);
        if (!options.deferNativeWindow) createOpenedWindow(opening);
        if (options.nativeThrows) throw new Error("native forward opening failed");
      },
    } },
    applyComposeRecipientOverrides(win, identity, to, cc, bcc) {
      win.recipients.push({ identity, to, cc, bcc });
    },
    insertReplyBodyIntoComposeWindow(win, body, isHtml) { win.bodies.push({ body, isHtml }); },
    addAttachmentsToComposeWindow(win, attachments) { win.attachments.push(attachments); },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    snippet("COMPOSE WINDOW CLAIM STATE"),
    snippet("COMPOSE OPEN DISPATCH"),
    snippet("COMPOSE WINDOW OPEN HELPER"),
  ].join("\n"), sandbox);

  function start(label, type = REPLY) {
    const identity = { email: `${label}@example.test` };
    const params = { label, type, composeFields: {}, origMsgHdr: { label } };
    const call = {
      params,
      identity,
      body: `BODY-${label}`,
      isHtml: label === "B",
      to: `to-${label}@example.test`,
      cc: `cc-${label}@example.test`,
      bcc: `bcc-${label}@example.test`,
      attachments: [{ name: `${label}.txt` }],
    };
    call.promise = sandbox.openComposeWindowWithCustomizations(
      params, ORIGINAL_URI, type, identity, call.body, call.isHtml,
      call.to, call.cc, call.bcc, call.attachments
    );
    return call;
  }

  return { start, observers, timers, openings, windows, makeWindow, announce, createOpenedWindow };
}

// No shared test assertion covers ownership of every customization. Keep this
// assertion local to the fake-window harness rather than copying production.
function assertCustomized(win, call) {
  assert.deepEqual(win.bodies, [{ body: call.body, isHtml: call.isHtml }]);
  assert.deepEqual(win.recipients, [{ identity: call.identity, to: call.to, cc: call.cc, bcc: call.bcc }]);
  assert.deepEqual(win.attachments, [call.attachments]);
}

function assertClean(harness) {
  assert.equal(harness.observers.size, 0, "window observers are removed");
  assert.ok(harness.timers.every(timer => timer.cancelled), "open timers are cancelled");
  for (const win of harness.windows) {
    assert.equal(win.initListeners.size, 0, `${win.label}: initialization listeners are removed`);
    assert.equal(win.stateListeners.size, 0, `${win.label}: body listeners are removed`);
  }
}

describe("compose window ownership", () => {
  for (const initOrder of ["AB", "BA"]) {
    for (const bodyOrder of ["AB", "BA"]) {
      it(`keeps concurrent replies with their callers: init ${initOrder}, body ${bodyOrder}`, async () => {
        const h = makeHarness();
        const calls = { A: h.start("A"), B: h.start("B") };
        const wins = Object.fromEntries(h.openings.map(opening => [opening.label, opening.win]));
        for (const label of initOrder) wins[label].fireInit();
        for (const label of bodyOrder) wins[label].bodyReady();
        const results = await Promise.all([calls.A.promise, calls.B.promise]);
        assert.ok(results.every(result => result.success === true));
        assertCustomized(wins.A, calls.A);
        assertCustomized(wins.B, calls.B);
        assertClean(h);
      });
    }
  }

  for (const invocationOrder of ["AB", "BA"]) {
    for (const bodyOrder of ["AB", "BA"]) {
      it(`serializes native forward claims: invocation ${invocationOrder}, body ${bodyOrder}`, async () => {
        const h = makeHarness();
        const calls = {};
        for (const label of invocationOrder) calls[label] = h.start(label, FORWARD);
        await tick();
        assert.equal(h.openings.length, 1, "the second forward must wait before invoking Thunderbird");
        assert.equal(h.openings[0].label, invocationOrder[0]);
        h.openings[0].win.fireInit();
        await tick();
        assert.equal(h.openings.length, 2, "claiming releases the next open before body readiness");
        assert.equal(h.openings[1].label, invocationOrder[1]);
        h.openings[1].win.fireInit();
        const wins = Object.fromEntries(h.openings.map(opening => [opening.label, opening.win]));
        for (const label of bodyOrder) wins[label].bodyReady();
        const results = await Promise.all([calls.A.promise, calls.B.promise]);
        assert.ok(results.every(result => result.success === true));
        assertCustomized(wins.A, calls.A);
        assertCustomized(wins.B, calls.B);
        assertClean(h);
      });
    }
  }

  it("ignores unrelated reply fields and cannot claim twice through stale callbacks", async () => {
    const h = makeHarness();
    const call = h.start("A");
    const own = h.openings[0].win;
    const unrelated = h.makeWindow("unrelated", REPLY);
    h.announce(unrelated);
    unrelated.fireInit();
    assert.equal(unrelated.stateListeners.size, 0, "matching URI/type is insufficient without exact fields");

    const duplicate = h.makeWindow("duplicate", REPLY, call.params.composeFields);
    h.announce(duplicate);
    const staleInit = duplicate.initHistory[0];
    own.fireInit();
    assert.equal(duplicate.initListeners.size, 0, "claim removes listeners already attached to other windows");
    staleInit();
    assert.equal(duplicate.stateListeners.size, 0, "a stale initialization cannot claim a second window");
    const staleBody = own.stateHistory[0];
    own.bodyReady();
    assert.equal((await call.promise).success, true);
    staleBody.NotifyComposeBodyReady();
    assertCustomized(own, call);
    assert.deepEqual(unrelated.bodies, []);
    assert.deepEqual(duplicate.bodies, []);
    assertClean(h);
  });

  it("fences queued and later native forwards after an unclaimed timeout, including a late window", async () => {
    const h = makeHarness({ deferNativeWindow: true });
    const first = h.start("A", FORWARD);
    const second = h.start("B", FORWARD);
    const third = h.start("C", FORWARD);
    assert.equal(h.openings.length, 1);
    h.timers[0].callback.notify();
    assert.match((await first.promise).error, /Timed out waiting/);
    for (const call of [second, third]) {
      assert.match((await call.promise).error, /Cannot safely open another forward/);
    }
    for (const label of ["D", "E"]) {
      assert.match((await h.start(label, FORWARD).promise).error, /Cannot safely open another forward/);
    }
    assert.equal(h.openings.length, 1, "a timeout must not permit any later native opening");
    const late = h.createOpenedWindow(h.openings[0]);
    late.fireInit();
    late.bodyReady();
    assert.deepEqual(late.bodies, []);
    assert.deepEqual(late.recipients, []);
    assert.deepEqual(late.attachments, []);
    assertClean(h);
  });

  it("permits retry after a failure before invoking the native opener", async () => {
    const h = makeHarness({ registrationFailures: 1 });
    const first = h.start("A", FORWARD);
    assert.match((await first.promise).error, /notification registration failed/);
    assert.equal(h.openings.length, 0);
    const retry = h.start("B", FORWARD);
    await tick();
    assert.equal(h.openings.length, 1);
    const win = h.openings[0].win;
    win.fireInit();
    win.bodyReady();
    assert.equal((await retry.promise).success, true);
    assertCustomized(win, retry);
    assertClean(h);
  });

  it("fences later native forwards when the native opener throws", async () => {
    const h = makeHarness({ nativeThrows: true });
    const first = h.start("A", FORWARD);
    const late = h.openings[0].win;
    const staleInit = late.initHistory[0];
    assert.match((await first.promise).error, /native forward opening failed/);
    for (const label of ["B", "C", "D"]) {
      assert.match((await h.start(label, FORWARD).promise).error, /Cannot safely open another forward/);
    }
    assert.equal(h.openings.length, 1);
    staleInit();
    late.bodyReady();
    assert.deepEqual(late.bodies, []);
    assertClean(h);
  });

  it("allows the next native forward after claim and ignores body readiness after timeout", async () => {
    const h = makeHarness();
    const first = h.start("A", FORWARD);
    const second = h.start("B", FORWARD);
    const firstWin = h.openings[0].win;
    firstWin.fireInit();
    const staleBody = firstWin.stateHistory[0];
    await tick();
    assert.equal(h.openings.length, 2);
    h.timers[0].callback.notify();
    assert.match((await first.promise).error, /Timed out waiting/);
    assert.equal(firstWin.stateListeners.size, 0);
    staleBody.NotifyComposeBodyReady();
    assert.deepEqual(firstWin.bodies, []);
    assert.deepEqual(firstWin.recipients, []);
    assert.deepEqual(firstWin.attachments, []);
    const secondWin = h.openings[1].win;
    secondWin.fireInit();
    secondWin.bodyReady();
    assert.equal((await second.promise).success, true);
    assertCustomized(secondWin, second);
    assertClean(h);
  });
});
