'use strict';
const crypto = require('crypto');

// SHA-256 hash of salt+pin — matches the GAS Utilities.computeDigest implementation
const hashPin = (salt, pin) =>
  crypto.createHash('sha256').update(String(salt) + String(pin), 'utf8').digest('hex');

const randomUUID = () => crypto.randomUUID();

module.exports = { hashPin, randomUUID };
