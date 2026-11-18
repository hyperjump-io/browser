/**
 * A limit from options, like `maxDepth`. One that isn't a whole number from
 * 0, or `Infinity`, is a mistake in the call.
 *
 * @type (name: string, value: number) => number
 * @throws {RangeError} If it isn't one.
 */
export const limit = (name, value) => {
  if (value !== Infinity && (!Number.isInteger(value) || value < 0)) {
    throw RangeError(`'${name}' has to be a whole number that isn't negative, or Infinity, not ${value}`);
  }

  return value;
};
