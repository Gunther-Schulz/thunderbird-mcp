"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadPreflight, assertPreflightRefused } = require("./direct-send-preflight.test.cjs");
const { assertNoAttachmentEffects } = require("./helpers/direct-send-attachments.cjs");
const { makeCoalescingGloda } = require("./helpers/gloda-coalescing.cjs");

const PREFIX = "x".repeat(20480);
const SUFFIX = "y".repeat(31);
const COMPLETE_BODY = PREFIX + SUFFIX;
const MIME_MODULE = "resource:///modules/gloda/MimeMessage.sys.mjs";
const PARSER_MODULE = "resource:///modules/mimeParser.sys.mjs";
const tools = ["replyToMessage", "forwardMessage"];

// Searched for a shared Gloda/independent-parser harness -> found loadPreflight
// and its real attachment converter. Reuse both, replacing only module loading.
// No existing MimeParser fixture decodes a raw text/plain part independently.
function loadCoalescedOriginal({ body = COMPLETE_BODY, contentType = "text/plain; charset=UTF-8", parserIncomplete = false } = {}) {
  const raw = `Content-Type: ${contentType}\r\n\r\n${body}`;
  const h = loadPreflight({ raw });
  const gloda = makeCoalescingGloda(contentType);
  const calls = { parserInputs: [], parsedBodies: [], sentBodies: [], background: [] };
  const msgHdr = h.api.findMessage().msgHdr;
  h.api.ChromeUtils.importESModule = name => {
    if (name === MIME_MODULE) {
      h.calls.imports++;
      return { MsgHdrToMimeMessage: gloda.MsgHdrToMimeMessage };
    }
    assert.equal(name, PARSER_MODULE);
    return { MimeParser: {
      parseSync(input, emitter, options) {
        assert.ok(input === raw, "Independent parsing must use the complete raw snapshot");
        assert.equal(options.bodyformat, "decode");
        assert.equal(options.strformat, "unicode");
        assert.equal(options.charset, "UTF-8");
        calls.parserInputs.push(input);
        // These fixtures are UTF-8 ASCII text/plain without transfer encoding.
        // Emit the full raw part, independently of the shared Gloda body's cap.
        const decoded = input.slice(input.indexOf("\r\n\r\n") + 4);
        calls.parsedBodies.push(decoded);
        const type = {
          type: "text/plain", mediatype: "text", subtype: "plain",
          params: new Map([["charset", "UTF-8"]]),
        };
        const headers = new Map([["content-type", type]]);
        headers.contentType = type;
        emitter.startMessage?.();
        emitter.startPart("", headers);
        emitter.deliverPartData("", decoded);
        emitter.endPart?.("");
        if (!parserIncomplete) emitter.endMessage();
      },
    } };
  };
  // Existing preflight counters record sends but not their body. Capture the
  // real sender's input so success must contain the recovered original suffix.
  const send = h.api.sendThroughCompose;
  h.api.sendThroughCompose = (params, ...args) => {
    calls.sentBodies.push(params.composeFields.body);
    return send(params, ...args);
  };
  return {
    h, gloda, calls,
    startBackground(saneBodySize) {
      gloda.MsgHdrToMimeMessage(msgHdr, null, (_hdr, mime) => calls.background.push(mime),
        true, { saneBodySize, examineEncryptedParts: false });
    },
  };
}

describe("direct sends joining an existing Gloda stream", () => {
  for (const tool of tools) {
    it(`${tool}: recovers all 20,511 bytes after joining a capped 20,480-byte request`, async () => {
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal();
      startBackground(true);
      gloda.writeBody(PREFIX);
      const pending = h.run(tool);
      assert.equal(gloda.calls.streams, 1);
      assert.equal(gloda.calls.requests.length, 2);
      assert.equal(gloda.calls.requests[0].saneBodySize, true);
      assert.equal(gloda.calls.requests[1].saneBodySize, false);
      assert.equal(h.calls.sends, 0);
      assertNoAttachmentEffects(h.attachments.calls);

      gloda.writeBody(SUFFIX);
      const shared = gloda.finish();
      assert.equal(shared.parts[0].body.length, 20480);
      assert.equal(shared.parts[0].truncated, undefined, "Gloda does not flag the cap");
      assert.equal(gloda.calls.delivered.length, 2);
      const result = await pending;
      assert.equal(result.success, true, result.error);
      assert.equal(h.calls.sends, 1);
      assert.equal(h.calls.settlements, 1);
      assert.equal(calls.background.length, 1);
      assert.equal(calls.background[0].parts[0].body.length, 20480, "Recovery must not mutate the shared Gloda object");
      assert.equal(calls.parsedBodies.length, 1);
      assert.ok(calls.parsedBodies[0] === COMPLETE_BODY);
      assert.equal(calls.parsedBodies[0].length, 20511);
      assert.ok(calls.sentBodies[0].includes(COMPLETE_BODY));
      assert.equal(h.attachments.calls.tempCreates.length, 1);
      assert.equal(h.attachments.calls.writes.length, 1);
    });

    it(`${tool}: allows a complete shared body above 20 KiB`, async () => {
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal();
      startBackground(false);
      gloda.writeBody(PREFIX);
      const pending = h.run(tool);
      gloda.writeBody(SUFFIX);
      assert.equal(gloda.finish().parts[0].body.length, 20511);
      const result = await pending;
      assert.equal(result.success, true, result.error);
      assert.equal(gloda.calls.streams, 1);
      assert.equal(h.calls.sends, 1);
      assert.ok(calls.sentBodies[0].includes(COMPLETE_BODY));
      assert.equal(calls.parsedBodies.length, 1);
      assert.ok(calls.parsedBodies[0] === COMPLETE_BODY);
    });

    it(`${tool}: repairs a cap-created standalone armor line before classification`, async () => {
      const armor = "-----BEGIN PGP MESSAGE-----";
      const prefix = "x".repeat(20480 - armor.length - 1) + "\n" + armor;
      const body = prefix + SUFFIX;
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal({ body });
      startBackground(true);
      gloda.writeBody(prefix);
      const pending = h.run(tool);
      gloda.writeBody(SUFFIX);
      const shared = gloda.finish();
      assert.equal(shared.parts[0].body.length, 20480);
      assert.equal(h.api.classifyMimeMessageEncryption(shared), "encrypted",
        "The shortened Gloda body alone appears to contain standalone armor");
      const result = await pending;
      assert.equal(result.success, true, result.error);
      assert.equal(h.calls.sends, 1);
      assert.ok(calls.sentBodies[0].includes(armor + SUFFIX),
        "The full raw line is ordinary text, with no standalone armor delimiter");
      assert.equal(calls.parsedBodies[0].length, 20511);
    });

    it(`${tool}: keeps ordinary flowed plaintext with normalized line endings`, async () => {
      const body = "A flowed line \r\ncontinues here.\r\nA fixed line.\r\n";
      const { h, gloda, calls } = loadCoalescedOriginal({
        body, contentType: "text/plain; charset=UTF-8; format=flowed",
      });
      const pending = h.run(tool);
      gloda.writeBody(body.replace(/\r\n/g, "\n"));
      gloda.finish();
      const result = await pending;
      assert.equal(result.success, true, result.error);
      assert.equal(h.calls.sends, 1);
      assert.match(calls.sentBodies[0], /A flowed line/);
      assert.match(calls.sentBodies[0], /continues here/);
      assert.match(calls.sentBodies[0], /A fixed line/);
    });

    it(`${tool}: refuses a capped shared result when independent parsing does not finish`, async () => {
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal({ parserIncomplete: true });
      startBackground(true);
      gloda.writeBody(PREFIX);
      const pending = h.run(tool);
      gloda.writeBody(SUFFIX);
      assert.equal(gloda.finish().parts[0].body.length, 20480);
      assertPreflightRefused(h, await pending);
      assert.equal(calls.parsedBodies.length, 1);
      assert.ok(calls.parsedBodies[0] === COMPLETE_BODY);
      assert.deepEqual(calls.sentBodies, []);
    });

    it(`${tool}: raw armor beyond the shared prefix refuses before joining Gloda`, async () => {
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal({
        body: PREFIX + "\n-----BEGIN PGP MESSAGE-----\nciphertext",
      });
      startBackground(true);
      gloda.writeBody(PREFIX);
      assertPreflightRefused(h, await h.run(tool));
      assert.equal(gloda.calls.streams, 1);
      assert.equal(gloda.calls.requests.length, 1, "The protected original never reaches Gloda from this send");
      assert.deepEqual(calls.parserInputs, []);
      assert.deepEqual(calls.sentBodies, []);
    });

    it(`${tool}: late coalesced callbacks cannot revive a timed-out send`, async () => {
      const { h, gloda, calls, startBackground } = loadCoalescedOriginal();
      startBackground(true);
      gloda.writeBody(PREFIX);
      const pending = h.run(tool);
      assert.equal(gloda.calls.requests.length, 2);
      h.clock.now += h.limits.time;
      h.calls.timers[0].callback.notify();
      assertPreflightRefused(h, await pending);

      gloda.writeBody(SUFFIX);
      gloda.finish();
      await Promise.resolve();
      assert.equal(calls.background.length, 1);
      assert.equal(gloda.calls.delivered.length, 2);
      assert.equal(h.calls.settlements, 1);
      assert.equal(h.calls.sends, 0);
      assert.deepEqual(calls.parserInputs, [], "A late callback does not restart independent parsing");
      assert.deepEqual(calls.sentBodies, []);
      assertNoAttachmentEffects(h.attachments.calls);
      assert.deepEqual(h.calls.created, { params: 0, fields: 0, compose: 0, sender: 0 });
    });
  }
});
