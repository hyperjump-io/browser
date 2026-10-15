const alpha = `A-Za-z`;
const token = `[!#$%&'*\\-_.^\`|~\\d${alpha}]+`;
const mediaRange = `(?<type>${token})/(?<subType>${token}(?:\\+(?<suffix>${token}))?)`;
const mediaRangePattern = new RegExp(mediaRange);

/** @type (expected: string, actual: string) => boolean */
export const mimeMatch = (expected, actual) => mimeMatchSpecificity(expected, actual) > 0;

/**
 * How specifically a media-range matches a media-type. Returns 0 if it doesn't
 * match. Higher numbers are more specific. Subtype specificity (exact,
 * structured suffix, wildcard) takes precedence over type specificity (exact,
 * wildcard).
 *
 * @type (expected: string, actual: string) => number
 */
export const mimeMatchSpecificity = (expected, actual) => {
  if (expected === actual) {
    return 7;
  }

  const expectedMatches = mediaRangePattern.exec(expected)?.groups;
  if (!expectedMatches) {
    throw Error(`Unable to parse media-range: ${expected}`);
  }

  const actualMatches = mediaRangePattern.exec(actual)?.groups;
  if (!actualMatches) {
    throw Error(`Unable to parse media-type: ${actual}`);
  }

  let typeSpecificity;
  if (expectedMatches.type === actualMatches.type) {
    typeSpecificity = 1;
  } else if (expectedMatches.type === "*") {
    typeSpecificity = 0;
  } else {
    return 0;
  }

  let subTypeSpecificity;
  if (expectedMatches.subType === actualMatches.subType) {
    subTypeSpecificity = 3;
  } else if (expectedMatches.subType === actualMatches.suffix) {
    subTypeSpecificity = 2;
  } else if (expectedMatches.subType === "*") {
    subTypeSpecificity = 1;
  } else {
    return 0;
  }

  return subTypeSpecificity * 2 + typeSpecificity;
};
