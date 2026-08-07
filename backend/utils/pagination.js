function clampLimit(rawLimit, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(Math.floor(n), maxLimit);
}

module.exports = { clampLimit };
