function timestamp() {
  return new Date().toISOString();
}

function info(message, ...rest) {
  console.log(`[${timestamp()}] [INFO] ${message}`, ...rest);
}

function warn(message, ...rest) {
  console.warn(`[${timestamp()}] [WARN] ${message}`, ...rest);
}

function error(message, ...rest) {
  console.error(`[${timestamp()}] [ERROR] ${message}`, ...rest);
}

module.exports = { info, warn, error };
