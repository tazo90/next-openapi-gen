export type StringEnum = "red" | "green" | "blue";
export type MixedUnion = string | number;
export type LiteralsEnum = "a" | "b" | "c";

export type Cat = { kind: "cat"; meow: boolean };
export type Dog = { kind: "dog"; bark: boolean };
export type Pet = Cat | Dog;

export type Combined = { id: string } & { name: string };
