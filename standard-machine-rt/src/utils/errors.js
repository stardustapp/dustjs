class ExtendableError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

class HttpBodyThrowable extends Error {
  constructor(statusCode, message, headers) {
    super(message);
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

function PrintCallSite({
  indent = '',
  trimFrames = 1,
  trimBuiltins = false,
}={}) {
  const stackLines = new Error().stack.split('\n').slice(trimFrames + 2);
  if (trimBuiltins) {
    const firstRealLine = stackLines.findIndex(line => line.includes(' (/'));
    if (firstRealLine >= 0) stackLines.splice(0, firstRealLine);
  }
  console.warn(stackLines.map(x => `${indent}${x}`).join('\n'));
}

module.exports = {
  ExtendableError,
  HttpBodyThrowable,
  PrintCallSite,
};
