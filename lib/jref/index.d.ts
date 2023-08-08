export type JRef = null | boolean | string | number | Reference | JRefObject | JRef[];
export type JRefObject = {
  [property: string]: JRef;
};

export const parse: (jref: string, reviver?: Reviver) => JRef;
export type Reviver = (key: string, value: unknown) => unknown;

export const stringify: (value: JRef, replacer?: (string | number)[] | null | Replacer, space?: string | number) => string;
export type Replacer = (key: string, value: unknown) => unknown;

export class Reference {
  constructor(href: string, value?: unknown);

  get href(): string;
  toJSON(): unknown;
}
