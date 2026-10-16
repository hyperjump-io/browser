/**
 * Run `fn` without capturing stack traces for any errors it creates.
 *
 * A VFileMessage is an Error, so creating one captures a stack trace. For a
 * syntax error, that trace only describes the parser's internals and it's the
 * most expensive part of creating the message. `Error.stackTraceLimit` is
 * only supported by V8. Elsewhere, setting it has no effect.
 *
 * @type <T>(fn: () => T) => T
 */
export const withoutStackTraces = (fn) => {
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return fn();
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
};
