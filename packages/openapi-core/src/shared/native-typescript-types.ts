export type NativeProject = {
  configPath: string | null;
  project: NativeProjectApi;
  syntheticConfigRoot?: string;
  snapshot: NativeSnapshotApi;
};

export type NativeProjectApi = {
  checker: NativeCheckerApi;
  compilerOptions: Record<string, unknown>;
  configFileName: string;
  program: {
    getSourceFile(file: string): NativeNode | undefined;
  };
};

export type NativeSnapshotApi = {
  dispose(): void;
  getDefaultProjectForFile(file: string): NativeProjectApi | undefined;
  getProject(configFileName: string): NativeProjectApi | undefined;
  getProjects(): readonly NativeProjectApi[];
};

export type NativeCheckerApi = {
  getAliasedSymbol?(symbol: NativeSymbol): NativeSymbol;
  getApparentType?(type: NativeType): NativeType | undefined;
  getDeclaredTypeOfSymbol(symbol: NativeSymbol): NativeType | undefined;
  getPropertiesOfType(type: NativeType): readonly NativeSymbol[];
  getIndexInfosOfType(type: NativeType): readonly { keyType: NativeType; valueType: NativeType }[];
  getReturnTypeOfSignature(signature: NativeSignature): NativeType | undefined;
  getShorthandAssignmentValueSymbol(node: NativeNode): NativeSymbol | undefined;
  getSignatureFromDeclaration?(node: NativeNode): NativeSignature | undefined;
  getSignaturesOfType(type: NativeType, kind: number): readonly NativeSignature[];
  getSymbolAtLocation(node: NativeNode): NativeSymbol | undefined;
  getTypeArguments(type: NativeType): readonly NativeType[];
  getTypeAtLocation(node: NativeNode): NativeType | undefined;
  getTypeOfSymbol(symbol: NativeSymbol): NativeType | undefined;
  getTypeOfSymbolAtLocation(symbol: NativeSymbol, location: NativeNode): NativeType | undefined;
  isArrayLikeType(type: NativeType): boolean;
  isArrayType?(type: NativeType): boolean;
  isTupleType?(type: NativeType): boolean;
  resolveName(
    name: string,
    meaning: number,
    location?: NativeNode,
    excludeGlobals?: boolean,
  ): NativeSymbol | undefined;
  typeToString(type: NativeType): string;
};

export type NativeNode = {
  arguments?: readonly NativeNode[];
  body?: NativeNode;
  declarationList?: { declarations: readonly NativeNode[] };
  declarations?: readonly NativeNode[];
  elements?: readonly NativeNode[];
  expression?: NativeNode;
  fileName?: string;
  forEachChild<T>(visitor: (node: NativeNode) => T | undefined): T | undefined;
  getSourceFile(): { fileName: string };
  getText?(sourceFile?: NativeNode): string;
  initializer?: NativeNode;
  kind: number;
  modifierFlags?: number;
  name?: NativeNode;
  node?: NativeNode;
  operand?: NativeNode;
  operator?: number;
  parent?: NativeNode;
  pos: number;
  properties?: readonly NativeNode[];
  statements?: readonly NativeNode[];
  text?: string;
  valueDeclaration?: NativeNode;
};

export type NativeSignature = Record<string, unknown>;

export type NativeSymbol = {
  declarations?: readonly NativeNodeHandle[];
  flags: number;
  getExportSymbol?(): NativeSymbol | undefined;
  name: string;
  valueDeclaration?: NativeNodeHandle;
};

export type NativeNodeHandle =
  | NativeNode
  | { resolve(project: NativeProjectApi): NativeNode | undefined };

export type NativeType = {
  flags: number;
  objectFlags?: number;
  getAliasSymbol?(): NativeSymbol | undefined;
  getStringIndexType?(): NativeType | undefined;
  getSymbol?(): NativeSymbol | undefined;
  getTypes?(): readonly NativeType[] | undefined;
  isNumberLiteralType?(): boolean;
  isStringLiteralType?(): boolean;
  value?: string | number | boolean | bigint;
};

export type NativeSyncModule = {
  API: new (options?: { cwd?: string }) => {
    close(): void;
    parseConfigFile(file: string): { fileNames: string[]; options: Record<string, unknown> };
    updateSnapshot(params?: {
      openProject?: string;
      fileChanges?: { changed?: string[]; created?: string[]; deleted?: string[] };
    }): NativeSnapshotApi;
  };
  ModifierFlags: Record<string, number | undefined>;
  ObjectFlags: Record<string, number | undefined>;
  SignatureKind: Record<string, number | undefined>;
  SymbolFlags: Record<string, number | undefined>;
  TypeFlags: Record<string, number | undefined>;
};

export type NativeAstModule = Record<string, unknown> & {
  SyntaxKind: Record<string, number | undefined>;
};

export type NativeFlagTable = Record<string, number | undefined>;
