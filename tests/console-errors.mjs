// Expected security diagnostics are scoped to an explicit negative test. All
// other console errors, including additional/similar CSP errors, remain fatal.
export function consoleErrors() {
  const logs = [], expected = [];
  let scope = null;
  return {
    logs, expected,
    beginInlineHandlerCsp(test) {
      if (scope) throw new Error('Console expectation already active');
      scope = { test, remaining: 1 };
    },
    endInlineHandlerCsp(test) {
      if (!scope || scope.test !== test) throw new Error('Console expectation scope mismatch');
      scope = null;
    },
    record(message) {
      const inlineHandlerCsp = message.startsWith('Executing inline event handler violates the following Content Security Policy directive ') &&
        message.includes("'script-src ") && message.endsWith('The action has been blocked.');
      if (scope?.remaining && inlineHandlerCsp) {
        scope.remaining--; expected.push({ test: scope.test, message });
      } else logs.push('console.error: ' + message);
    },
  };
}
