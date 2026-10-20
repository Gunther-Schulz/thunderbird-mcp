"use strict";

const prefTypes = { PREF_INVALID: 0, PREF_STRING: 32, PREF_INT: 64, PREF_BOOL: 128 };

// Searched for shared typed preference fixtures -> found local mocks in
// privacy-access and calendar-runtime, but neither can be imported on its own.
// Reuse privacy-access's type checks with explicit ordinary-identity defaults.
function makeDirectSendPrefs(overrides = {}) {
  const values = {
    "mail.identity.default.encryptionpolicy": 0,
    "mail.identity.default.openpgp_key_id": "",
    "mail.identity.default.encryption_cert_name": "",
    "mail.e2ee.auto_enable": false,
    ...overrides,
  };
  return {
    getPrefType(name) {
      const value = values[name];
      if (value === undefined) return prefTypes.PREF_INVALID;
      if (typeof value === "string") return prefTypes.PREF_STRING;
      if (typeof value === "boolean") return prefTypes.PREF_BOOL;
      if (typeof value === "number") return prefTypes.PREF_INT;
      throw new Error("Unsupported preference value");
    },
    getIntPref(name) {
      if (typeof values[name] !== "number") throw new Error("Preference is not an integer");
      return values[name];
    },
    getStringPref(name) {
      if (typeof values[name] !== "string") throw new Error("Preference is not a string");
      return values[name];
    },
    getBoolPref(name) {
      if (typeof values[name] !== "boolean") throw new Error("Preference is not a boolean");
      return values[name];
    },
  };
}

// Searched for shared raw-message fixtures -> found only per-suite privacy
// classifiers. Other direct-send harnesses stub MIME quoting, so reuse one
// explicit clear-raw control while privacy-messages runs the real classifiers.
const clearOriginalRawFixture = {
  readBoundedRawMessage: () => "Content-Type: text/plain\r\n\r\nOriginal text",
  classifyRawMessageEncryption: () => "clear",
  isRawTopLevelMultipartSigned: () => false,
};

module.exports = { makeDirectSendPrefs, prefTypes, clearOriginalRawFixture };
