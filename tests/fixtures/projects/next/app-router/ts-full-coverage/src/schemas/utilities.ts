export type Base = { id: string; name: string; age: number };

export type Picked = Pick<Base, "id" | "name">;
export type Omitted = Omit<Base, "age">;
export type Partialed = Partial<Base>;
export type Requireed = Required<Partial<Base>>;
export type ReadonlyBase = Readonly<Base>;
export type NonNull = NonNullable<string | null | undefined>;
export type ExcludedUnion = Exclude<"a" | "b" | "c", "b">;
export type ExtractedUnion = Extract<"a" | "b" | "c", "a" | "b">;
export type AwaitedPromise = Awaited<Promise<number>>;

export type UpperChannel = Uppercase<"red" | "green" | "blue">;
export type LowerWord = Lowercase<"HELLO" | "WORLD">;
export type CapitalWord = Capitalize<"hello" | "world">;
export type UncapitalWord = Uncapitalize<"Hello" | "World">;

export type Greeting = `hello, ${string}`;
export type Versioned = `v${1 | 2}`;
