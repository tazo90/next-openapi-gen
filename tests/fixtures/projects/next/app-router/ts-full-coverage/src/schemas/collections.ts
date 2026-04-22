export type ArrayOfStrings = string[];
export type GenericArray = Array<number>;
export type ReadonlyNumbers = readonly number[];
export type FixedTuple = [string, number, boolean];
export type TupleWithRest = [string, ...number[]];
export type NamedTuple = [id: string, count: number];

export type StringMap = Record<string, string>;
export type NumberMap = { [key: string]: number };
export type Mixed = {
  id: string;
  [key: string]: string;
};

export type Nested = {
  outer: {
    inner: {
      leaf: string;
      optional?: number;
      readonly ro: boolean;
    };
  };
};
