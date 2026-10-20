/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// The marked blocks below are verbatim ESR 140 source excerpts:
// https://hg.mozilla.org/releases/comm-esr140/file/tip/mailnews/db/gloda/modules/MimeMessage.sys.mjs#l232
// https://hg.mozilla.org/releases/comm-esr140/file/tip/mailnews/db/gloda/components/MimeMessageEmitter.sys.mjs#l81
// https://hg.mozilla.org/releases/comm-esr140/file/tip/mailnews/db/gloda/components/MimeMessageEmitter.sys.mjs#l477
// The fixture wiring provides one clear text/plain part and a controlled stream.
// Source verification also reproduced this case with the complete upstream
// modules: one stream delivered 20,480 bytes to both callbacks for 20,511 bytes.

const MAX_SANE_BODY_PART_SIZE = 20 * 1024;

// Searched for Gloda request-sharing fixtures -> found lifecycle coalescing
// tests, but no MIME listener/emitter fixture. Use the upstream branches below.
function makeCoalescingGloda(contentType = "text/plain; charset=UTF-8") {
  const activeStreamListeners = Object.create(null);
  const calls = { requests: [], streams: 0, delivered: [] };
  let emitter;
  let current;

  function MsgHdrToMimeMessage(aMsgHdr, callbackThis, callback, allowDownload, aOptions) {
    const msgURI = aMsgHdr.folder.getUriForMsg(aMsgHdr);
    calls.requests.push({ allowDownload, ...aOptions });
    MsgHdrToMimeMessage.OPTION_TUNNEL = aOptions;
    // Clear fixtures have no encrypted parts for wrapCallback to remove.
    const wrapCallback = value => value;

    // BEGIN VERBATIM GLODA COALESCING
    const listenerForURI = activeStreamListeners[msgURI];
    if (listenerForURI != undefined) {
      listenerForURI._callbacks.push(wrapCallback(callback, callbackThis));
      listenerForURI._callbacksThis.push(callbackThis);
      return;
    }
    // END VERBATIM GLODA COALESCING

    calls.streams++;
    const part = {
      partName: "1", contentType: "text/plain",
      headers: { "content-type": [contentType] }, parts: [], body: "",
      get size() { return this.body.length; },
      appendBody(aBuf) { this.body += aBuf; },
    };
    current = {
      msgURI, msgHdr: aMsgHdr,
      _callbacks: [callback], _callbacksThis: [callbackThis],
      mime: {
        partName: "", contentType: "message/rfc822",
        headers: { "content-type": [contentType] },
        parts: [part], allUserAttachments: [],
      },
    };
    activeStreamListeners[msgURI] = current;
    emitter = {
      _mimeMsg: { MsgHdrToMimeMessage }, _writeBody: true, _curPart: part,
      initialize() {
        // BEGIN VERBATIM EMITTER OPTION SNAPSHOT
        const options = this._mimeMsg.MsgHdrToMimeMessage.OPTION_TUNNEL;
        this._saneBodySize =
          options && "saneBodySize" in options ? options.saneBodySize : false;
        // END VERBATIM EMITTER OPTION SNAPSHOT
      },
      // BEGIN VERBATIM EMITTER BODY CAP
      writeBody(aBuf) {
        if (
          this._writeBody &&
          (!this._saneBodySize || this._curPart.size < MAX_SANE_BODY_PART_SIZE)
        ) {
          this._curPart.appendBody(aBuf);
        }
      },
      // END VERBATIM EMITTER BODY CAP
    };
    emitter.initialize();
    MsgHdrToMimeMessage.OPTION_TUNNEL = null;
  }

  return {
    calls,
    MsgHdrToMimeMessage,
    writeBody(chunk) { emitter.writeBody(chunk); },
    finish() {
      const listener = current;
      delete activeStreamListeners[listener.msgURI];
      for (let index = 0; index < listener._callbacks.length; index++) {
        calls.delivered.push(listener.mime);
        listener._callbacks[index].call(listener._callbacksThis[index], listener.msgHdr, listener.mime);
      }
      return listener.mime;
    },
  };
}

module.exports = { makeCoalescingGloda };
