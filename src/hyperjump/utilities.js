const alpha = `A-Za-z`;
const token = `[!#$%&'*\\-_.^\`|~\\d${alpha}]+`;
const mediaRange = `(?<type>${token})/(?<subType>${token}(?:\\+(?<suffix>${token}))?)`;
const mediaRangePattern = new RegExp(mediaRange);

/** @type (expected: string, actual: string) => boolean */
export const mimeMatch = (expected, actual) => {
  if (expected === actual) {
    return true;
  }

  const expectedMatches = mediaRangePattern.exec(expected)?.groups;
  if (!expectedMatches) {
    throw Error(`Unable to parse media-range: ${expected}`);
  }

  const actualMatches = mediaRangePattern.exec(actual)?.groups;
  if (!actualMatches) {
    throw Error(`Unable to parse media-type: ${actual}`);
  }

  if (expectedMatches.type === actualMatches.type || expectedMatches.type === "*") {
    if (expectedMatches.subType === actualMatches.subType || expectedMatches.subType === "*") {
      return true;
    }

    if (expectedMatches.subType === actualMatches.suffix) {
      return true;
    }
  }

  return false;
};
