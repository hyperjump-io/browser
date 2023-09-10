export const contextUri = () => {
  const stackLine = Error().stack.split("\n")[3];
  const stackLineMatcher = /\((.*):\d+:\d+\)/;
  const matches = stackLineMatcher.exec(stackLine);
  return matches[1];
};
