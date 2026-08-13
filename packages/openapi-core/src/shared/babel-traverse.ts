import traverseModule from "@babel/traverse";
import type { Node, TraverseOptions } from "@babel/traverse";

type BabelTraverse = (parent: Node, opts?: TraverseOptions) => void;

const resolvedTraverse: BabelTraverse =
  (traverseModule as unknown as { default?: BabelTraverse }).default ??
  (traverseModule as unknown as BabelTraverse);

export const traverse: BabelTraverse = resolvedTraverse;
