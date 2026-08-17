import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNativeTypeScriptAdapter } from "@workspace/openapi-core/shared/native-typescript-adapter.js";
import type { NativeTypeScriptRuntime } from "@workspace/openapi-core/shared/typescript-runtime.js";

const SyntaxKind = {
  FunctionDeclaration: 1,
  VariableStatement: 2,
  VariableDeclaration: 3,
  Identifier: 4,
  NumericLiteral: 5,
  StringLiteral: 6,
  NoSubstitutionTemplateLiteral: 7,
  TemplateHead: 8,
  TemplateMiddle: 9,
  TemplateTail: 10,
  PropertyAssignment: 11,
  ShorthandPropertyAssignment: 12,
  SpreadAssignment: 13,
  ObjectLiteralExpression: 14,
  ArrayLiteralExpression: 15,
  SpreadElement: 16,
  CallExpression: 17,
  PropertyAccessExpression: 18,
  ReturnStatement: 19,
  Block: 20,
  ArrowFunction: 21,
  FunctionExpression: 22,
  MethodDeclaration: 23,
  NewExpression: 24,
  PrefixUnaryExpression: 25,
  ParenthesizedExpression: 26,
  AsExpression: 27,
  TypeAssertionExpression: 28,
  SatisfiesExpression: 29,
  NonNullExpression: 30,
  BindingElement: 31,
  EnumMember: 32,
  PrivateIdentifier: 33,
  TrueKeyword: 100,
  FalseKeyword: 101,
  NullKeyword: 102,
  PlusToken: 103,
  MinusToken: 104,
} as const;

const ModifierFlags = { Export: 1 } as const;

const SymbolFlags = {
  Alias: 1,
  Type: 2,
  TypeAlias: 4,
  Interface: 8,
  Value: 16,
  Variable: 32,
  Function: 64,
  Optional: 128,
} as const;

const TypeFlags = {
  StringLike: 1,
  NumberLike: 2,
  BooleanLike: 4,
  BooleanLiteral: 8,
  TemplateLiteral: 16,
  Null: 32,
  Undefined: 64,
  Any: 128,
  Never: 256,
  Unknown: 512,
  Void: 1024,
  StringLiteral: 2048,
  NumberLiteral: 4096,
  Union: 8192,
} as const;

const ObjectFlags = { Tuple: 1 } as const;

const SignatureKind = { Call: 0 } as const;

type FakeNode = {
  kind: number;
  pos: number;
  text?: string;
  name?: FakeNode;
  expression?: FakeNode;
  operand?: FakeNode;
  operator?: number;
  initializer?: FakeNode;
  arguments?: FakeNode[];
  properties?: FakeNode[];
  elements?: FakeNode[];
  statements?: FakeNode[];
  declarationList?: { declarations: FakeNode[] };
  declarations?: FakeNode[];
  body?: FakeNode;
  modifierFlags?: number;
  parent?: FakeNode;
  forEachChild?: (visitor: (node: FakeNode) => unknown) => unknown;
  getSourceFile?: () => { fileName: string };
  getText?: () => string;
};

type FakeType = {
  flags: number;
  objectFlags?: number;
  label?: string;
  value?: string | number | boolean;
  symbolName?: string;
  aliasName?: string;
  isStringLiteral?: boolean;
  isNumberLiteral?: boolean;
  isUnion?: boolean;
  isTuple?: boolean;
  isArray?: boolean;
  isPromise?: boolean;
  unionTypes?: FakeType[];
  typeArguments?: FakeType[];
  properties?: {
    name: string;
    flags: number;
    type: FakeType;
    declaration?: FakeNode;
  }[];
  indexInfos?: { keyType: FakeType; valueType: FakeType }[];
  getSymbol?: () => { name: string } | undefined;
  getAliasSymbol?: () => { name: string } | undefined;
  getTypes?: () => FakeType[] | undefined;
  isStringLiteralType?: () => boolean;
  isNumberLiteralType?: () => boolean;
};

type FakeSymbol = {
  name: string;
  flags: number;
  valueDeclaration?: FakeNode;
  declarations?: FakeNode[];
  getExportSymbol?: () => FakeSymbol | undefined;
};

type FakeProject = {
  checker: Record<string, unknown>;
  compilerOptions: Record<string, unknown>;
  configFileName: string;
  program: { getSourceFile(file: string): FakeNode | undefined };
};

type FakeSnapshot = {
  dispose(): void;
  getProject(configFileName: string): FakeProject | undefined;
  getDefaultProjectForFile(file: string): FakeProject | undefined;
  getProjects(): FakeProject[];
};

type FakeRuntime = {
  runtime: NativeTypeScriptRuntime;
  setSourceFile(absolutePath: string, sourceFile: FakeNode): void;
  setChecker(checker: Partial<FakeProject["checker"]>): void;
  setProject(compilerOptions: Record<string, unknown>): void;
  project: FakeProject;
};

function createFakeRuntime(
  flagOverrides: {
    ObjectFlags?: Record<string, number>;
    SymbolFlags?: Record<string, number>;
    TypeFlags?: Record<string, number>;
  } = {},
): FakeRuntime {
  const sourceFiles = new Map<string, FakeNode>();
  let checkerOverride: Record<string, unknown> = {};
  let compilerOptions: Record<string, unknown> = {};

  const project: FakeProject = {
    checker: new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop in checkerOverride) {
            return checkerOverride[prop as string];
          }
          if (prop === "isArrayType") return () => false;
          if (prop === "isTupleType") return () => false;
          if (prop === "getSignaturesOfType") return () => [];
          if (prop === "getApparentType") return undefined;
          if (prop === "getAliasedSymbol") return undefined;
          if (prop === "getExportSymbol") return undefined;
          if (prop === "getSignatureFromDeclaration") return undefined;
          return undefined;
        },
      },
    ),
    compilerOptions,
    configFileName: "",
    program: {
      getSourceFile(file: string) {
        return sourceFiles.get(path.resolve(file));
      },
    },
  };

  const snapshot: FakeSnapshot = {
    dispose() {},
    getProject() {
      return project;
    },
    getDefaultProjectForFile() {
      return project;
    },
    getProjects() {
      return [project];
    },
  };

  class FakeAPI {
    constructor(public options?: { cwd?: string }) {}
    close(): void {}
    updateSnapshot(_params?: { openProject?: string }): FakeSnapshot {
      return snapshot;
    }
  }

  const astModule = { SyntaxKind } as unknown as Record<string, unknown>;
  const syncModule = {
    API: FakeAPI as unknown as new (options?: { cwd?: string }) => {
      close(): void;
      parseConfigFile(file: string): { fileNames: string[]; options: Record<string, unknown> };
      updateSnapshot(params?: {
        openProject?: string;
        fileChanges?: { changed?: string[]; created?: string[]; deleted?: string[] };
      }): FakeSnapshot;
    },
    ModifierFlags,
    ObjectFlags: flagOverrides.ObjectFlags ?? ObjectFlags,
    SignatureKind,
    SymbolFlags: flagOverrides.SymbolFlags ?? SymbolFlags,
    TypeFlags: flagOverrides.TypeFlags ?? TypeFlags,
  } as unknown as Record<string, unknown>;

  const runtime: NativeTypeScriptRuntime = { ast: astModule, sync: syncModule };

  return {
    runtime,
    project,
    setSourceFile(absolutePath: string, sourceFile: FakeNode) {
      sourceFiles.set(path.resolve(absolutePath), sourceFile);
    },
    setChecker(checker: Partial<FakeProject["checker"]>) {
      checkerOverride = checker;
    },
    setProject(options: Record<string, unknown>) {
      compilerOptions = options;
      project.compilerOptions = options;
    },
  };
}

type TempProject = {
  root: string;
  routeFile: string;
  fake: FakeRuntime;
};

describe("NativeTypeScriptAdapter", () => {
  const roots: string[] = [];

  function setupTempProject(extra: { withTsconfig?: boolean } = {}): TempProject {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-native-adapter-"));
    roots.push(root);
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const routeFile = path.join(srcDir, "route.ts");
    fs.writeFileSync(routeFile, "export const value = 1;\n");
    if (extra.withTsconfig ?? true) {
      fs.writeFileSync(
        path.join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { module: "esnext", moduleResolution: "bundler", target: "es2022" },
          include: ["src"],
        }),
      );
    }
    const fake = createFakeRuntime();
    return { root, routeFile, fake };
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  function node(kind: keyof typeof SyntaxKind | number, extra: Partial<FakeNode> = {}): FakeNode {
    const kindNumber = typeof kind === "string" ? SyntaxKind[kind] : kind;
    return { kind: kindNumber, pos: 0, ...extra };
  }

  function withForEachChild(target: FakeNode, children: FakeNode[]): FakeNode {
    target.forEachChild = (visitor: (n: FakeNode) => unknown) => {
      for (const child of children) {
        visitor(child);
      }
      return undefined;
    };
    return target;
  }

  function withSourceFile(target: FakeNode, fileName: string): FakeNode {
    target.getSourceFile = () => ({ fileName });
    return target;
  }

  function asResolvable(target: FakeNode, fileName: string): FakeNode {
    withSourceFile(target, fileName);
    withForEachChild(target, []);
    Object.assign(target, { resolve: () => target });
    return target;
  }

  function id(text: string): FakeNode {
    return node("Identifier", { text });
  }

  function numLit(text: string): FakeNode {
    return node("NumericLiteral", { text });
  }

  function strLit(text: string): FakeNode {
    return node("StringLiteral", { text });
  }

  function keyword(kind: "TrueKeyword" | "FalseKeyword" | "NullKeyword"): FakeNode {
    return node(kind);
  }

  function propAssign(name: FakeNode, initializer: FakeNode): FakeNode {
    return node("PropertyAssignment", { name, initializer });
  }

  function objLit(properties: FakeNode[]): FakeNode {
    return node("ObjectLiteralExpression", { properties });
  }

  function callExpr(callee: FakeNode, arguments_: FakeNode[]): FakeNode {
    return node("CallExpression", { expression: callee, arguments: arguments_ });
  }

  function newExpr(callee: FakeNode, arguments_: FakeNode[]): FakeNode {
    return node("NewExpression", { expression: callee, arguments: arguments_ });
  }

  function propAccess(expression: FakeNode, name: FakeNode): FakeNode {
    return node("PropertyAccessExpression", { expression, name });
  }

  function retStmt(expression: FakeNode): FakeNode {
    return node("ReturnStatement", { expression });
  }

  function fnDecl(name: string, body: FakeNode): FakeNode {
    return node("FunctionDeclaration", {
      name: id(name),
      modifierFlags: ModifierFlags.Export,
      body,
    });
  }

  function stubDeclaration(fileName: string): FakeNode {
    const stub = node("VariableDeclaration", { name: id("stub"), initializer: numLit("0") });
    withSourceFile(stub, fileName);
    withForEachChild(stub, []);
    return stub;
  }

  function makeType(opts: {
    flags?: number;
    label?: string;
    value?: string | number | boolean;
    symbolName?: string;
    aliasName?: string;
    isStringLiteral?: boolean;
    isNumberLiteral?: boolean;
    isUnion?: boolean;
    unionTypes?: FakeType[];
    isTuple?: boolean;
    isArray?: boolean;
    isPromise?: boolean;
    typeArguments?: FakeType[];
    properties?: {
      name: string;
      flags: number;
      type: FakeType;
      declaration?: FakeNode;
    }[];
    indexInfos?: { keyType: FakeType; valueType: FakeType }[];
  }): FakeType {
    const flags = opts.flags ?? 0;
    const type: FakeType = {
      flags,
      objectFlags: opts.isTuple ? ObjectFlags.Tuple : undefined,
      label: opts.label,
      value: opts.value,
      symbolName: opts.symbolName,
      aliasName: opts.aliasName,
      isStringLiteral: opts.isStringLiteral,
      isNumberLiteral: opts.isNumberLiteral,
      isUnion: opts.isUnion,
      isTuple: opts.isTuple,
      isArray: opts.isArray,
      isPromise: opts.isPromise,
      unionTypes: opts.unionTypes,
      typeArguments: opts.typeArguments,
      properties: opts.properties,
      indexInfos: opts.indexInfos,
    };
    if (opts.symbolName !== undefined) {
      type.getSymbol = () => ({ name: opts.symbolName as string });
    }
    if (opts.aliasName !== undefined) {
      type.getAliasSymbol = () => ({ name: opts.aliasName as string });
    }
    if (opts.isUnion && opts.unionTypes) {
      type.getTypes = () => opts.unionTypes;
    }
    if (opts.isStringLiteral) {
      type.isStringLiteralType = () => true;
    }
    if (opts.isNumberLiteral) {
      type.isNumberLiteralType = () => true;
    }
    return type;
  }

  function adapterForType(
    temp: TempProject,
    currentType: () => FakeType,
  ): ReturnType<typeof createNativeTypeScriptAdapter> {
    const symbol: FakeSymbol = {
      name: "Target",
      flags: SymbolFlags.TypeAlias,
      declarations: [stubDeclaration(temp.routeFile)],
    };
    temp.fake.setChecker({
      resolveName(): unknown {
        return symbol;
      },
      getDeclaredTypeOfSymbol(): FakeType {
        return currentType();
      },
      getTypeAtLocation(): FakeType {
        return currentType();
      },
      isArrayType(type: FakeType): boolean {
        return Boolean(type.isArray);
      },
      isTupleType(type: FakeType): boolean {
        return Boolean(type.isTuple);
      },
      getPropertiesOfType(type: FakeType): {
        name: string;
        flags: number;
        type: FakeType;
        valueDeclaration?: FakeNode;
        declarations?: FakeNode[];
      }[] {
        return (type.properties ?? []).map((property) => ({
          name: property.name,
          flags: property.flags,
          type: property.type,
          valueDeclaration: stubDeclaration(temp.routeFile),
          declarations: [stubDeclaration(temp.routeFile)],
        }));
      },
      getTypeOfSymbol(symbol: { type?: FakeType }): FakeType {
        return (
          (symbol.type as FakeType) ?? makeType({ flags: TypeFlags.StringLike, label: "string" })
        );
      },
      getTypeOfSymbolAtLocation(): FakeType {
        return makeType({ flags: TypeFlags.StringLike, label: "string" });
      },
      getIndexInfosOfType(type: FakeType): { keyType: FakeType; valueType: FakeType }[] {
        return type.indexInfos ?? [];
      },
      getTypeArguments(type: FakeType): FakeType[] {
        return type.typeArguments ?? [];
      },
      typeToString(type: FakeType): string {
        return type.label ?? "object";
      },
      getApparentType(): undefined {
        return undefined;
      },
    });

    const sourceFile = node("VariableStatement", { declarationList: { declarations: [] } });
    temp.fake.setSourceFile(temp.routeFile, sourceFile);

    return createNativeTypeScriptAdapter({
      packagePath: temp.root,
      runtime: temp.fake.runtime,
      version: "7.0.1-rc",
    });
  }

  describe("resolveValueReference", () => {
    it("reduces exported const initializers literal, object, array, spread, prefix unary, call, and shorthand properties", () => {
      const temp = setupTempProject();
      const routeFile = temp.routeFile;

      const twoDeclaration = node("VariableDeclaration", {
        name: id("two"),
        initializer: numLit("2"),
      });
      withSourceFile(twoDeclaration, routeFile);
      withForEachChild(twoDeclaration, []);

      const restDeclaration = node("VariableDeclaration", {
        name: id("rest"),
        initializer: objLit([propAssign(id("spread"), strLit("value"))]),
      });
      withSourceFile(restDeclaration, routeFile);
      withForEachChild(restDeclaration, []);

      const schemaParseCallee = propAccess(id("schema"), id("parse"));
      const frozenCallee = id("Object.freeze");
      frozenCallee.getText = () => "Object.freeze";

      const initializer = objLit([
        propAssign(id("ok"), keyword("TrueKeyword")),
        propAssign(
          id("count"),
          node("PrefixUnaryExpression", { operand: numLit("5"), operator: SyntaxKind.MinusToken }),
        ),
        propAssign(id("par"), node("ParenthesizedExpression", { expression: numLit("7") })),
        propAssign(id("cast"), node("AsExpression", { expression: numLit("9") })),
        propAssign(id("satisfied"), node("SatisfiesExpression", { expression: numLit("11") })),
        propAssign(id("nonNull"), node("NonNullExpression", { expression: numLit("13") })),
        propAssign(id("two"), node("Identifier", { text: "two" })),
        node("ShorthandPropertyAssignment", { name: id("shorty") }),
        node("SpreadAssignment", { expression: id("rest") }),
        propAssign(strLit("dashed"), numLit("42")),
        propAssign(numLit("3"), numLit("99")),
        propAssign(
          id("parsed"),
          callExpr(schemaParseCallee, [objLit([propAssign(id("inner"), numLit("1"))])]),
        ),
        propAssign(
          id("frozen"),
          callExpr(frozenCallee, [objLit([propAssign(id("inner"), strLit("x"))])]),
        ),
      ]);

      const valueDeclaration = node("VariableDeclaration", {
        name: id("value"),
        initializer,
      });
      withSourceFile(valueDeclaration, routeFile);
      withForEachChild(valueDeclaration, []);

      const shortyDeclaration = node("VariableDeclaration", {
        name: id("shorty"),
        initializer: strLit("short"),
      });
      withSourceFile(shortyDeclaration, routeFile);
      withForEachChild(shortyDeclaration, []);

      const valueSymbol: FakeSymbol = {
        name: "value",
        flags: SymbolFlags.Variable,
        valueDeclaration,
      };
      const shortySymbol: FakeSymbol = {
        name: "shorty",
        flags: SymbolFlags.Variable,
        valueDeclaration: shortyDeclaration,
      };
      const twoSymbol: FakeSymbol = {
        name: "two",
        flags: SymbolFlags.Variable,
        valueDeclaration: twoDeclaration,
      };
      const restSymbol: FakeSymbol = {
        name: "rest",
        flags: SymbolFlags.Variable,
        valueDeclaration: restDeclaration,
      };

      const sourceFile = node("VariableStatement", {
        declarationList: { declarations: [valueDeclaration] },
      });
      withSourceFile(sourceFile, routeFile);
      temp.fake.setSourceFile(routeFile, sourceFile);
      temp.fake.setChecker({
        resolveName(name: string): unknown {
          if (name === "value") return valueSymbol;
          if (name === "shorty") return shortySymbol;
          if (name === "two") return twoSymbol;
          if (name === "rest") return restSymbol;
          if (name === "schema") return { name: "schema", flags: SymbolFlags.Variable };
          return undefined;
        },
        getShorthandAssignmentValueSymbol(): unknown {
          return shortySymbol;
        },
        getSymbolAtLocation(candidate: unknown): unknown {
          const nodeArg = candidate as FakeNode;
          if (nodeArg?.text === "two") return twoSymbol;
          if (nodeArg?.text === "rest") return restSymbol;
          return undefined;
        },
        getAliasedSymbol(): unknown {
          return undefined;
        },
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const result = adapter.resolveValueReference("value", routeFile);

      expect(result.value).toMatchObject({
        ok: true,
        count: -5,
        par: 7,
        cast: 9,
        satisfied: 11,
        nonNull: 13,
        two: 2,
        shorty: "short",
        spread: "value",
        dashed: 42,
        "3": 99,
        parsed: { inner: 1 },
        frozen: { inner: "x" },
      });
    });

    it("returns an unresolved diagnostic when the referenced export is missing", () => {
      const temp = setupTempProject();
      const sourceFile = node("VariableStatement", { declarationList: { declarations: [] } });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({ resolveName: () => undefined });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const result = adapter.resolveValueReference("missing", temp.routeFile);

      expect(result.value).toBeUndefined();
      expect(result.diagnostic?.code).toBe("example-reference-unresolved");
    });

    it("returns an unserializable diagnostic when the initializer cannot be reduced", () => {
      const temp = setupTempProject();
      const declaration = node("VariableDeclaration", {
        name: id("value"),
        initializer: node("Identifier", { text: "other" }),
      });
      withSourceFile(declaration, temp.routeFile);
      withForEachChild(declaration, []);
      const symbol: FakeSymbol = {
        name: "value",
        flags: SymbolFlags.Variable,
        valueDeclaration: declaration,
      };
      const sourceFile = node("VariableStatement", {
        declarationList: { declarations: [declaration] },
      });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({
        resolveName: () => symbol,
        getSymbolAtLocation: () => undefined,
        getAliasedSymbol: () => undefined,
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const result = adapter.resolveValueReference("value", temp.routeFile);

      expect(result.value).toBeUndefined();
      expect(result.diagnostic?.code).toBe("example-reference-unserializable");
    });

    it("returns an unresolved diagnostic when the source file is not part of the project", () => {
      const temp = setupTempProject();
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const result = adapter.resolveValueReference(
        "value",
        path.join(temp.root, "src", "missing.ts"),
      );

      expect(result.value).toBeUndefined();
      expect(result.diagnostic?.code).toBe("example-reference-unresolved");
    });
  });

  describe("inferResponsesForExports", () => {
    it("infers Response.json, Response.redirect, and new Response(204) returns", () => {
      const temp = setupTempProject();
      const routeFile = temp.routeFile;

      const jsonReturn = retStmt(
        callExpr(propAccess(id("Response"), id("json")), [
          objLit([propAssign(id("ok"), keyword("TrueKeyword"))]),
          objLit([propAssign(id("status"), numLit("201"))]),
        ]),
      );
      const redirectReturn = retStmt(
        callExpr(propAccess(id("Response"), id("redirect")), [strLit("/next"), numLit("301")]),
      );
      const noContentReturn = retStmt(
        newExpr(id("Response"), [
          keyword("NullKeyword"),
          objLit([propAssign(id("status"), numLit("204"))]),
        ]),
      );
      const body = node("Block");
      withForEachChild(body, [jsonReturn, redirectReturn, noContentReturn]);

      const getFn = fnDecl("GET", body);
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [getFn];
      sourceFile.getSourceFile = () => ({ fileName: routeFile });
      temp.fake.setSourceFile(routeFile, sourceFile);
      temp.fake.setChecker({
        getTypeAtLocation(candidate: unknown): FakeType {
          const nodeArg = candidate as FakeNode;
          if (
            nodeArg?.kind === SyntaxKind.CallExpression &&
            nodeArg.expression?.name?.text === "json"
          ) {
            return makeType({ flags: 0, label: "Response<unknown>" });
          }
          if (nodeArg?.kind === SyntaxKind.ObjectLiteralExpression) {
            return makeType({
              flags: TypeFlags.StringLike,
              label: "string",
              symbolName: undefined,
            });
          }
          return makeType({ flags: 0, label: "object" });
        },
        getTypeArguments(): FakeType[] {
          return [];
        },
        typeToString: () => "object",
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const results = adapter.inferResponsesForExports(routeFile, ["GET"]);
      const responses = results.get("GET")?.responses ?? [];
      const statusCodes = responses
        .map((response) => response.statusCode ?? "")
        .toSorted((a, b) => a.localeCompare(b));
      const json = responses.find((response) => response.statusCode === "201");
      const redirect = responses.find((response) => response.statusCode === "301");
      const noContent = responses.find((response) => response.statusCode === "204");

      expect(statusCodes).toEqual(["201", "204", "301"]);
      expect(json?.contentType).toBe("application/json");
      expect(json?.source).toBe("typescript");
      expect(redirect?.source).toBe("typescript");
      expect(noContent?.source).toBe("typescript");
    });

    it("falls back to inline schemas when Response.json generic resolves to __object", () => {
      const temp = setupTempProject();
      const routeFile = temp.routeFile;

      const jsonReturn = retStmt(
        callExpr(propAccess(id("Response"), id("json")), [
          objLit([
            propAssign(id("ok"), keyword("TrueKeyword")),
            propAssign(id("total"), numLit("2")),
          ]),
          objLit([propAssign(id("status"), numLit("201"))]),
        ]),
      );
      const body = node("Block");
      withForEachChild(body, [jsonReturn]);

      const getFn = fnDecl("GET", body);
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [getFn];
      sourceFile.getSourceFile = () => ({ fileName: routeFile });
      temp.fake.setSourceFile(routeFile, sourceFile);

      const bodyType = makeType({
        flags: 0,
        label: "{ ok: boolean; total: number }",
        properties: [
          {
            name: "ok",
            flags: 0,
            type: makeType({ flags: TypeFlags.BooleanLike, label: "boolean" }),
          },
          {
            name: "total",
            flags: 0,
            type: makeType({ flags: TypeFlags.NumberLike, label: "number" }),
          },
        ],
      });
      const responseType = makeType({
        flags: 0,
        label: "Response<__object>",
        typeArguments: [makeType({ flags: 0, label: "__object", symbolName: "__object" })],
      });

      temp.fake.setChecker({
        getTypeAtLocation(candidate: unknown): FakeType {
          const nodeArg = candidate as FakeNode;
          if (
            nodeArg?.kind === SyntaxKind.CallExpression &&
            nodeArg.expression?.name?.text === "json"
          ) {
            return responseType;
          }
          if (nodeArg?.kind === SyntaxKind.ObjectLiteralExpression) {
            return bodyType;
          }
          return makeType({ flags: 0, label: "object" });
        },
        getTypeArguments(type: FakeType): FakeType[] {
          return type.typeArguments ?? [];
        },
        getPropertiesOfType(type: FakeType): {
          name: string;
          flags: number;
          type: FakeType;
          valueDeclaration?: FakeNode;
          declarations?: FakeNode[];
        }[] {
          return (type.properties ?? []).map((property) => ({
            name: property.name,
            flags: property.flags,
            type: property.type,
            valueDeclaration: stubDeclaration(routeFile),
            declarations: [stubDeclaration(routeFile)],
          }));
        },
        getTypeOfSymbol(symbol: { type?: FakeType }): FakeType {
          return (
            (symbol.type as FakeType) ?? makeType({ flags: TypeFlags.StringLike, label: "string" })
          );
        },
        getTypeOfSymbolAtLocation(_symbol: unknown, declaration: FakeNode): FakeType {
          const propertyName = (declaration as FakeNode & { name?: FakeNode }).name?.text;
          if (propertyName === "ok") {
            return makeType({ flags: TypeFlags.BooleanLike, label: "boolean" });
          }
          if (propertyName === "total") {
            return makeType({ flags: TypeFlags.NumberLike, label: "number" });
          }
          return makeType({ flags: 0, label: "object" });
        },
        typeToString(type: FakeType): string {
          return type.label ?? "object";
        },
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const results = adapter.inferResponsesForExports(routeFile, ["GET"]);
      const response = results.get("GET")?.responses[0];

      expect(response).toEqual({
        statusCode: "201",
        contentType: "application/json",
        source: "typescript",
        schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            total: { type: "number" },
          },
          required: ["ok", "total"],
        },
      });
    });

    it("falls back to signature inference for functions without return statements", () => {
      const temp = setupTempProject();
      const routeFile = temp.routeFile;

      const body = node("Block");
      withForEachChild(body, [node("ArrowFunction", {})]);

      const getFn = fnDecl("GET", body);
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [getFn];
      temp.fake.setSourceFile(routeFile, sourceFile);
      temp.fake.setChecker({
        getSignatureFromDeclaration(): unknown {
          return { id: "sig" };
        },
        getReturnTypeOfSignature(): FakeType {
          return makeType({
            flags: 0,
            label: "Promise<User>",
            isPromise: true,
            typeArguments: [makeType({ flags: 0, label: "User", symbolName: "User" })],
          });
        },
        getTypeAtLocation: () => makeType({ flags: 0 }),
        getTypeArguments(type: FakeType): FakeType[] {
          return type.typeArguments ?? [];
        },
        typeToString: () => "object",
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const results = adapter.inferResponsesForExports(routeFile, ["GET"]);
      const response = results.get("GET")?.responses[0];

      expect(response?.typeName).toBe("User");
      expect(response?.source).toBe("typescript");
    });

    it("returns empty results when no requested exports are present in the source file", () => {
      const temp = setupTempProject();
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [];
      temp.fake.setSourceFile(temp.routeFile, sourceFile);

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const results = adapter.inferResponsesForExports(temp.routeFile, ["POST"]);

      expect(results.size).toBe(0);
    });

    it("returns empty results when the source file is not part of the project", () => {
      const temp = setupTempProject();
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const results = adapter.inferResponsesForExports(path.join(temp.root, "src", "missing.ts"), [
        "GET",
      ]);

      expect(results.size).toBe(0);
    });
  });

  describe("resolveTypeByName", () => {
    it("maps string-like types to a string schema", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({ flags: TypeFlags.StringLike, label: "string" }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toEqual({ type: "string" });
    });

    it("maps number-like and boolean-like types", () => {
      const numberTemp = setupTempProject();
      const numberAdapter = adapterForType(numberTemp, () =>
        makeType({ flags: TypeFlags.NumberLike, label: "number" }),
      );
      expect(numberAdapter.resolveTypeByName("Target", numberTemp.routeFile)).toEqual({
        type: "number",
      });

      const booleanTemp = setupTempProject();
      const booleanAdapter = adapterForType(booleanTemp, () =>
        makeType({ flags: TypeFlags.BooleanLike, label: "boolean" }),
      );
      expect(booleanAdapter.resolveTypeByName("Target", booleanTemp.routeFile)).toEqual({
        type: "boolean",
      });
    });

    it("maps number and boolean literal unions to typed enums", () => {
      const numberTemp = setupTempProject();
      const numberAdapter = adapterForType(numberTemp, () =>
        makeType({
          flags: TypeFlags.Union,
          label: "numbers",
          isUnion: true,
          unionTypes: [
            makeType({
              flags: TypeFlags.NumberLiteral,
              label: "1",
              value: 1,
              isNumberLiteral: true,
            }),
            makeType({
              flags: TypeFlags.NumberLiteral,
              label: "2",
              value: 2,
              isNumberLiteral: true,
            }),
          ],
        }),
      );
      expect(numberAdapter.resolveTypeByName("Target", numberTemp.routeFile)).toMatchObject({
        type: "number",
        enum: [1, 2],
      });

      const booleanTemp = setupTempProject();
      const booleanAdapter = adapterForType(booleanTemp, () =>
        makeType({
          flags: TypeFlags.Union,
          label: "flags",
          isUnion: true,
          unionTypes: [
            makeType({ flags: TypeFlags.BooleanLiteral, label: "true" }),
            makeType({ flags: TypeFlags.BooleanLiteral, label: "false" }),
          ],
        }),
      );
      expect(booleanAdapter.resolveTypeByName("Target", booleanTemp.routeFile)).toMatchObject({
        type: "boolean",
        enum: [true, false],
      });
    });

    it("maps template literal types to strings", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({ flags: TypeFlags.TemplateLiteral, label: "`user-${string}`" }),
      );
      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toEqual({ type: "string" });
    });

    it("maps literal unions to enums with nullable metadata", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: TypeFlags.Union,
          label: "union",
          isUnion: true,
          unionTypes: [
            makeType({
              flags: TypeFlags.StringLiteral,
              label: "active",
              value: "active",
              isStringLiteral: true,
            }),
            makeType({
              flags: TypeFlags.StringLiteral,
              label: "inactive",
              value: "inactive",
              isStringLiteral: true,
            }),
            makeType({ flags: TypeFlags.Null, label: "null" }),
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "string",
        enum: ["active", "inactive"],
        nullable: true,
      });
    });

    it("unwraps nullable single-branch unions via recursion", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: TypeFlags.Union,
          label: "nullable-string",
          isUnion: true,
          unionTypes: [
            makeType({ flags: TypeFlags.StringLike, label: "string" }),
            makeType({ flags: TypeFlags.Null, label: "null" }),
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "string",
        nullable: true,
      });
    });

    it("falls back to oneOf for non-literal unions", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: TypeFlags.Union,
          label: "either",
          isUnion: true,
          unionTypes: [
            makeType({ flags: TypeFlags.StringLike, label: "string" }),
            makeType({ flags: TypeFlags.NumberLike, label: "number" }),
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        oneOf: [{ type: "string" }, { type: "number" }],
      });
    });

    it("maps tuples to fixed-length arrays", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: 0,
          label: "[string, number]",
          isTuple: true,
          typeArguments: [
            makeType({ flags: TypeFlags.StringLike, label: "string" }),
            makeType({ flags: TypeFlags.NumberLike, label: "number" }),
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "array",
        prefixItems: [{ type: "string" }, { type: "number" }],
        items: false,
        minItems: 2,
        maxItems: 2,
      });
    });

    it("maps array types to array items", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: 0,
          label: "string[]",
          isArray: true,
          typeArguments: [makeType({ flags: TypeFlags.StringLike, label: "string" })],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "array",
        items: { type: "string" },
      });
    });

    it("maps object properties with required markers", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: 0,
          label: "User",
          properties: [
            {
              name: "id",
              flags: 0,
              type: makeType({ flags: TypeFlags.StringLike, label: "string" }),
            },
            {
              name: "label",
              flags: SymbolFlags.Optional,
              type: makeType({ flags: TypeFlags.StringLike, label: "string" }),
            },
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "object",
        properties: { id: { type: "string" }, label: { type: "string" } },
        required: ["id"],
      });
    });

    it("maps string index signatures to additionalProperties", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: 0,
          label: "Record",
          indexInfos: [
            {
              keyType: makeType({ label: "string" }),
              valueType: makeType({ flags: TypeFlags.NumberLike, label: "number" }),
            },
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "object",
        additionalProperties: { type: "number" },
      });
    });

    it("maps numeric index signatures to arrays", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () =>
        makeType({
          flags: 0,
          label: "number[]",
          indexInfos: [
            {
              keyType: makeType({ label: "number" }),
              valueType: makeType({ flags: TypeFlags.StringLike, label: "string" }),
            },
          ],
        }),
      );

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toMatchObject({
        type: "array",
        items: { type: "string" },
      });
    });

    it("falls back to a generic object schema when no shape is available", () => {
      const temp = setupTempProject();
      const adapter = adapterForType(temp, () => makeType({ flags: 0, label: "unknown" }));

      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toEqual({ type: "object" });
    });

    it("returns null when the symbol cannot be resolved", () => {
      const temp = setupTempProject();
      temp.fake.setChecker({ resolveName: () => undefined });
      const sourceFile = node("VariableStatement", { declarationList: { declarations: [] } });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveTypeByName("Missing", temp.routeFile)).toBeNull();
    });
  });

  describe("resolveModule", () => {
    it("resolves relative module specifiers against the file system", () => {
      const temp = setupTempProject();
      fs.writeFileSync(path.join(temp.root, "src", "util.ts"), "export const x = 1;\n");
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveModule("./util", temp.routeFile)).toBe(
        path.join(temp.root, "src", "util.ts"),
      );
    });

    it("returns null when no file candidate matches", () => {
      const temp = setupTempProject();
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveModule("./missing", temp.routeFile)).toBeNull();
    });

    it("resolves path-mapped modules via compilerOptions.paths", () => {
      const temp = setupTempProject();
      fs.mkdirSync(path.join(temp.root, "src", "models"), { recursive: true });
      fs.writeFileSync(
        path.join(temp.root, "src", "models", "user.ts"),
        "export type User = { id: string };\n",
      );
      temp.fake.setProject({ baseUrl: ".", paths: { "@/*": ["./src/*"] } });
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveModule("@/models/user", temp.routeFile)).toBe(
        path.join(temp.root, "src", "models", "user.ts"),
      );
    });

    it("returns null for unmapped bare specifiers", () => {
      const temp = setupTempProject();
      temp.fake.setProject({ paths: {} });
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveModule("unmapped-module", temp.routeFile)).toBeNull();
    });

    it("falls back to Node resolution for bare package specifiers", () => {
      const temp = setupTempProject();
      const packageRoot = path.join(temp.root, "node_modules", "fixture-package");
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify({ name: "fixture-package", exports: "./index.js", type: "module" }),
      );
      fs.writeFileSync(path.join(packageRoot, "index.js"), "export const value = 1;\n");
      temp.fake.setProject({ paths: {} });
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.2",
      });

      expect(fs.realpathSync(adapter.resolveModule("fixture-package", temp.routeFile) ?? "")).toBe(
        fs.realpathSync(path.join(packageRoot, "index.js")),
      );
    });

    it("resolves index files, exact path mappings, and skips declaration files", () => {
      const temp = setupTempProject();
      fs.mkdirSync(path.join(temp.root, "src", "lib"), { recursive: true });
      fs.writeFileSync(path.join(temp.root, "src", "lib", "index.ts"), "export const value = 1;\n");
      fs.writeFileSync(path.join(temp.root, "src", "widget.tsx"), "export const Widget = 1;\n");
      fs.writeFileSync(
        path.join(temp.root, "src", "legacy.d.ts"),
        "export declare const legacy: string;\n",
      );
      fs.writeFileSync(path.join(temp.root, "src", "exact.ts"), "export const exact = 1;\n");
      temp.fake.setProject({
        baseUrl: ".",
        paths: {
          "@exact": ["./src/exact.ts"],
          "@skip": "not-an-array",
          "@missing/*": ["./src/missing/*"],
        },
      });
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveModule("./lib/index", temp.routeFile)).toBe(
        path.join(temp.root, "src", "lib", "index.ts"),
      );
      expect(adapter.resolveModule("./widget", temp.routeFile)).toBe(
        path.join(temp.root, "src", "widget.tsx"),
      );
      expect(adapter.resolveModule("./legacy", temp.routeFile)).toBeNull();
      expect(adapter.resolveModule("@exact", temp.routeFile)).toBe(
        path.join(temp.root, "src", "exact.ts"),
      );
      expect(adapter.resolveModule("@skip", temp.routeFile)).toBeNull();
      expect(adapter.resolveModule("@missing/item", temp.routeFile)).toBeNull();
      expect(
        adapter.resolveModule(path.join(temp.root, "src", "lib", "index"), temp.routeFile),
      ).toBe(path.join(temp.root, "src", "lib", "index.ts"));
    });
  });

  describe("project lifecycle", () => {
    it("creates a synthetic single-file project when no tsconfig is present and disposes it on clear", () => {
      const temp = setupTempProject({ withTsconfig: false });
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [];
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({ resolveName: () => undefined });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      const first = adapter.resolveValueReference("value", temp.routeFile);
      expect(first.diagnostic?.code).toBe("example-reference-unresolved");

      expect(() => adapter.clear()).not.toThrow();
    });

    it("invalidates cached projects when the source file changes", () => {
      const temp = setupTempProject();
      const sourceFile = node("FunctionDeclaration");
      sourceFile.statements = [];
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({ resolveName: () => undefined });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      adapter.resolveValueReference("value", temp.routeFile);
      expect(() => adapter.invalidate(temp.routeFile)).not.toThrow();
      expect(() => adapter.clear()).not.toThrow();
    });

    it("returns null from resolveTypeByName when the source file is not in the project", () => {
      const temp = setupTempProject();
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(
        adapter.resolveTypeByName("Target", path.join(temp.root, "src", "missing.ts")),
      ).toBeNull();
    });
  });

  describe("leftover evaluate and export branches", () => {
    it("reduces type assertions, plus unary, binding elements, enums, and exported functions", () => {
      const temp = setupTempProject();
      const routeFile = temp.routeFile;

      const plus = node("PrefixUnaryExpression", {
        operand: numLit("4"),
        operator: SyntaxKind.PlusToken,
      });
      const asserted = node("TypeAssertionExpression", { expression: numLit("8") });
      const binding = asResolvable(node("BindingElement", { initializer: numLit("6") }), routeFile);
      const enumMember = asResolvable(
        node("EnumMember", { name: id("Draft"), initializer: strLit("draft") }),
        routeFile,
      );
      const emptyUnary = node("PrefixUnaryExpression", { operator: SyntaxKind.MinusToken });
      const stringUnary = node("PrefixUnaryExpression", {
        operand: strLit("nope"),
        operator: SyntaxKind.MinusToken,
      });
      const unknownUnary = node("PrefixUnaryExpression", {
        operand: numLit("1"),
        operator: 999,
      });
      const noOpUnary = node("PrefixUnaryExpression", { operand: numLit("1") });
      const emptyParse = callExpr(propAccess(id("schema"), id("parse")), []);
      const emptyFreeze = callExpr(id("Object.freeze"), []);
      emptyFreeze.getText = () => "Object.freeze";
      const otherCall = callExpr(id("Date.now"), []);
      otherCall.getText = () => "Date.now";
      const badSpread = node("SpreadAssignment", { expression: numLit("1") });
      const nameless = node("PropertyAssignment", { initializer: numLit("1") });
      const arraySpread = node("ArrayLiteralExpression", {
        elements: [node("SpreadElement", { expression: numLit("1") })],
      });
      const emptySpread = node("SpreadAssignment");
      const emptyArraySpread = node("SpreadElement");
      const shorthandBare = node("ShorthandPropertyAssignment", { name: id("missing") });

      const symbols: Record<string, FakeSymbol> = {};
      const addValue = (name: string, initializer: FakeNode): void => {
        const declaration = asResolvable(
          node("VariableDeclaration", { name: id(name), initializer }),
          routeFile,
        );
        symbols[name] = {
          name,
          flags: SymbolFlags.Variable,
          valueDeclaration: declaration,
        };
      };

      addValue(
        "value",
        objLit([
          propAssign(id("plus"), plus),
          propAssign(id("asserted"), asserted),
          propAssign(id("falsy"), node("FalseKeyword")),
          propAssign(id("nully"), node("NullKeyword")),
        ]),
      );
      addValue("emptyUnary", emptyUnary);
      addValue("stringUnary", stringUnary);
      addValue("unknownUnary", unknownUnary);
      addValue("noOpUnary", noOpUnary);
      addValue("emptyParse", emptyParse);
      addValue("emptyFreeze", emptyFreeze);
      addValue("otherCall", otherCall);
      addValue("spreadFail", objLit([badSpread]));
      addValue("emptySpreadObj", objLit([emptySpread]));
      addValue("namelessObj", objLit([nameless]));
      addValue("shorthandObj", objLit([shorthandBare]));
      addValue("arrayFail", arraySpread);
      addValue("emptyArray", node("ArrayLiteralExpression"));
      addValue("emptyObject", node("ObjectLiteralExpression"));
      addValue("emptyItems", node("ArrayLiteralExpression", { elements: [emptyArraySpread] }));
      symbols.emptyDecl = {
        name: "emptyDecl",
        flags: SymbolFlags.Variable,
        valueDeclaration: asResolvable(
          node("VariableDeclaration", { name: id("emptyDecl") }),
          routeFile,
        ),
      };
      const cycleId = id("cycle");
      addValue("cycle", cycleId);

      const bindingSymbol: FakeSymbol = {
        name: "bound",
        flags: SymbolFlags.Variable,
        valueDeclaration: binding,
      };
      const enumSymbol: FakeSymbol = {
        name: "Draft",
        flags: SymbolFlags.Value,
        valueDeclaration: enumMember,
      };
      symbols.bound = bindingSymbol;
      symbols.Draft = enumSymbol;

      const getBody = node("Block");
      withForEachChild(getBody, []);
      const exportedFn = fnDecl("GET", getBody);
      const sourceFile = node("SourceFile");
      sourceFile.statements = [exportedFn];
      sourceFile.getSourceFile = () => ({ fileName: routeFile });
      temp.fake.setSourceFile(routeFile, sourceFile);
      temp.fake.setChecker({
        resolveName(name: string): unknown {
          return symbols[name];
        },
        getShorthandAssignmentValueSymbol(): unknown {
          return undefined;
        },
        getSymbolAtLocation(candidate: unknown): unknown {
          const nodeArg = candidate as FakeNode;
          if (nodeArg?.text === "cycle") {
            return symbols.cycle;
          }
          return undefined;
        },
        getTypeAtLocation(): undefined {
          return undefined;
        },
        getSignaturesOfType(): unknown[] {
          return [];
        },
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveValueReference("value", routeFile).value).toEqual({
        plus: 4,
        asserted: 8,
        falsy: false,
        nully: null,
      });
      expect(adapter.resolveValueReference("emptyUnary", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("stringUnary", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("unknownUnary", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("noOpUnary", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("emptyParse", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("emptyFreeze", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("otherCall", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("spreadFail", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("emptySpreadObj", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("namelessObj", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("shorthandObj", routeFile).value).toEqual({});
      expect(adapter.resolveValueReference("arrayFail", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("emptyArray", routeFile).value).toEqual([]);
      expect(adapter.resolveValueReference("emptyObject", routeFile).value).toEqual({});
      expect(adapter.resolveValueReference("emptyItems", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("emptyDecl", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("cycle", routeFile).value).toBeUndefined();
      expect(adapter.resolveValueReference("bound", routeFile).value).toBe(6);
      expect(adapter.resolveValueReference("Draft", routeFile).value).toBe("draft");
      expect(adapter.inferResponsesForExports(routeFile, ["GET", "value"]).get("GET")).toEqual({
        responses: [],
        diagnostics: [],
      });
      adapter.invalidate(routeFile);
    });

    it("throws when a native snapshot cannot produce a project", () => {
      const temp = setupTempProject({ withTsconfig: false });
      class EmptyAPI {
        close(): void {}
        updateSnapshot(): {
          dispose(): void;
          getProject(): undefined;
          getDefaultProjectForFile(): undefined;
          getProjects(): [];
        } {
          return {
            dispose() {},
            getProject() {
              return undefined;
            },
            getDefaultProjectForFile() {
              return undefined;
            },
            getProjects() {
              return [];
            },
          };
        }
      }
      const runtime: NativeTypeScriptRuntime = {
        ast: temp.fake.runtime.ast,
        sync: {
          ...temp.fake.runtime.sync,
          API: EmptyAPI,
        },
      };
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime,
        version: "7.0.1-rc",
      });
      expect(() => adapter.resolveValueReference("value", temp.routeFile)).toThrow(
        /Could not create a TypeScript native project/,
      );
    });

    it("reads redirect status from an options object and names array aliases", () => {
      const temp = setupTempProject();
      const redirectReturn = retStmt(
        callExpr(propAccess(id("Response"), id("redirect")), [
          strLit("/next"),
          objLit([propAssign(id("status"), numLit("308"))]),
        ]),
      );
      const body = node("Block");
      withForEachChild(body, [redirectReturn]);
      const getFn = fnDecl("GET", body);
      const sourceFile = node("SourceFile");
      sourceFile.statements = [getFn];
      sourceFile.getSourceFile = () => ({ fileName: temp.routeFile });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({
        getTypeAtLocation(candidate: unknown): FakeType {
          const nodeArg = candidate as FakeNode;
          if (nodeArg?.kind === SyntaxKind.CallExpression) {
            return makeType({
              flags: TypeFlags.Any,
              symbolName: "Response",
              label: "Response",
            });
          }
          return makeType({ flags: TypeFlags.Any, label: "unknown" });
        },
        getSignaturesOfType: () => [],
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });
      expect(
        adapter.inferResponsesForExports(temp.routeFile, ["GET"]).get("GET")?.responses[0],
      ).toEqual(expect.objectContaining({ statusCode: "308" }));

      const arrayAdapter = adapterForType(temp, () =>
        makeType({
          flags: TypeFlags.Object,
          isArray: true,
          typeArguments: [makeType({ flags: TypeFlags.StringLike, label: "string" })],
        }),
      );
      expect(arrayAdapter.resolveTypeByName("Users", temp.routeFile)).toEqual({
        type: "array",
        items: { type: "string" },
      });
    });

    it("falls back when compiler flag tables and alias helpers are sparse", () => {
      const temp = setupTempProject();
      const sparseRuntime: NativeTypeScriptRuntime = {
        ast: temp.fake.runtime.ast,
        sync: {
          ...temp.fake.runtime.sync,
          SymbolFlags: { Alias: 1 },
          ModifierFlags: {},
          SignatureKind: {},
          ObjectFlags: {},
        },
      };
      const declaration = asResolvable(
        node("VariableDeclaration", {
          name: id("value"),
          initializer: numLit("1"),
        }),
        temp.routeFile,
      );
      const aliasSymbol: FakeSymbol = {
        name: "value",
        flags: 1,
        valueDeclaration: declaration,
        getExportSymbol() {
          return {
            name: "value",
            flags: SymbolFlags.Variable,
            valueDeclaration: declaration,
          };
        },
      };
      const sourceFile = node("VariableStatement", {
        declarationList: { declarations: [declaration] },
      });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      temp.fake.setChecker({
        resolveName: () => aliasSymbol,
        getAliasedSymbol: undefined,
        getTypeAtLocation: () => undefined,
        getDeclaredTypeOfSymbol: () => undefined,
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: sparseRuntime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveValueReference("value", temp.routeFile).value).toBe(1);
      expect(adapter.resolveTypeByName("Target", temp.routeFile)).toBeNull();
    });

    it("covers empty flag tables on resolve helpers", () => {
      const temp = setupTempProject();
      const emptyFake = createFakeRuntime({
        ObjectFlags: {},
        SymbolFlags: {},
        TypeFlags: {},
      });
      const sourceFile = node("SourceFile");
      sourceFile.statements = [];
      sourceFile.getSourceFile = () => ({ fileName: temp.routeFile });
      emptyFake.setSourceFile(temp.routeFile, sourceFile);
      const declaration = asResolvable(node("Identifier", { text: "User" }), temp.routeFile);
      emptyFake.setChecker({
        resolveName: () => ({
          name: "User",
          flags: 0,
          valueDeclaration: declaration,
        }),
        getDeclaredTypeOfSymbol: () => ({ flags: 0 }),
        getTypeOfSymbol: () => ({ flags: 0 }),
        getPropertiesOfType: () => [],
        getIndexInfosOfType: () => [],
        getSymbolAtLocation: () => undefined,
        getTypeAtLocation: () => ({ flags: 0 }),
        getSignaturesOfType: () => [],
        typeToString: () => "User",
      });

      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: emptyFake.runtime,
        version: "7.0.1-rc",
      });

      expect(adapter.resolveTypeByName("User", temp.routeFile)).toEqual({ type: "object" });
      expect(adapter.resolveValueReference("missing", temp.routeFile).value).toBeUndefined();
    });

    it("covers leftover export maps and missing declaration lists", () => {
      const temp = setupTempProject();
      const emptySource = node("SourceFile");
      emptySource.getSourceFile = () => ({ fileName: temp.routeFile });
      temp.fake.setSourceFile(temp.routeFile, emptySource);
      const adapter = createNativeTypeScriptAdapter({
        packagePath: temp.root,
        runtime: temp.fake.runtime,
        version: "7.0.1-rc",
      });
      expect(adapter.inferResponsesForExports(temp.routeFile, ["GET"]).size).toBe(0);

      const namelessFn = fnDecl("", node("Block"));
      namelessFn.name = node("Identifier");
      const bareVariable = node("VariableStatement", {
        modifierFlags: ModifierFlags.Export,
      });
      const unnamedDecl = asResolvable(
        node("VariableDeclaration", { name: node("Identifier") }),
        temp.routeFile,
      );
      const namedVariable = node("VariableStatement", {
        modifierFlags: ModifierFlags.Export,
        declarationList: { declarations: [unnamedDecl] },
      });
      const sourceFile = node("SourceFile");
      sourceFile.statements = [namelessFn, bareVariable, namedVariable];
      sourceFile.getSourceFile = () => ({ fileName: temp.routeFile });
      temp.fake.setSourceFile(temp.routeFile, sourceFile);
      expect(
        adapter.inferResponsesForExports(temp.routeFile, ["GET", ""]).size,
      ).toBeGreaterThanOrEqual(0);
    });
  });
});
