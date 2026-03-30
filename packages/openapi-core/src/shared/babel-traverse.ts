import traverseModule from "@babel/traverse";

type TraverseModule = typeof traverseModule & {
  default?: typeof traverseModule;
};

const resolvedTraverse = (traverseModule as TraverseModule).default ?? traverseModule;

export { resolvedTraverse as traverse };
