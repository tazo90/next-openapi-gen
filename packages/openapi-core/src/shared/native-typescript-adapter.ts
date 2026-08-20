import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";

import {
  getNativeTypeArguments,
  isNativeArrayType,
  isNativeTupleType,
  resolveNodeHandle,
  typeToOpenApiSchema,
} from "./native-typescript-schema.js";
import type {
  NativeAstModule,
  NativeCheckerApi,
  NativeNode,
  NativeProject,
  NativeProjectApi,
  NativeSignature,
  NativeSymbol,
  NativeSyncModule,
  NativeType,
} from "./native-typescript-types.js";
import { findTypeScriptConfigFile } from "./tsconfig-file.js";
import type { Diagnostic, InferredResponseDefinition, OpenAPIDefinition } from "./types.js";
import type {
  InferredRouteResponses,
  TypeScriptCompilerAdapter,
  TypeScriptValueReferenceResult,
} from "./typescript-adapter.js";
import type { NativeTypeScriptRuntime } from "./typescript-runtime.js";

const moduleRequire = createRequire(import.meta.url);

export function createNativeTypeScriptAdapter({
  packagePath,
  runtime,
  version,
}: {
  packagePath: string;
  runtime: NativeTypeScriptRuntime;
  version: string;
}): TypeScriptCompilerAdapter {
  return new NativeTypeScriptAdapter(packagePath, runtime, version);
}

class NativeTypeScriptAdapter implements TypeScriptCompilerAdapter {
  public readonly kind = "native";
  public readonly packagePath: string;
  public readonly version: string;

  private readonly api: InstanceType<NativeSyncModule["API"]>;
  private readonly ast: NativeAstModule;
  private readonly sync: NativeSyncModule;
  private readonly projectCache = new Map<string, NativeProject>();

  constructor(packagePath: string, runtime: NativeTypeScriptRuntime, version: string) {
    this.packagePath = packagePath;
    this.version = version;
    this.ast = runtime.ast as NativeAstModule;
    this.sync = runtime.sync as NativeSyncModule;
    this.api = new this.sync.API({ cwd: process.cwd() });
  }

  public clear(): void {
    for (const cachedProject of this.projectCache.values()) {
      disposeNativeProject(cachedProject);
    }
    this.projectCache.clear();
    this.api.close();
  }

  public invalidate(filePath: string): void {
    const absoluteFilePath = path.resolve(filePath);
    for (const [cacheKey, cachedProject] of this.projectCache) {
      const configPath = cachedProject.configPath;
      if (
        cacheKey.endsWith(absoluteFilePath) ||
        (configPath && isWithinConfigProject(absoluteFilePath, configPath))
      ) {
        disposeNativeProject(cachedProject);
        this.projectCache.delete(cacheKey);
      }
    }
  }

  public resolveModule(importPath: string, fromFilePath: string): string | null {
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      return resolveFileModule(importPath, fromFilePath);
    }

    const project = this.getProject(fromFilePath);
    return (
      resolvePathMappedModule(importPath, fromFilePath, project.project.compilerOptions) ??
      resolveNodeModule(importPath, fromFilePath)
    );
  }

  public resolveValueReference(
    referenceName: string,
    fromFilePath: string,
  ): TypeScriptValueReferenceResult {
    const absoluteFilePath = path.resolve(fromFilePath);
    const project = this.getProject(absoluteFilePath);
    const sourceFile = project.project.program.getSourceFile(absoluteFilePath);
    if (!sourceFile) {
      return {
        diagnostic: {
          code: "example-reference-unresolved",
          severity: "warning",
          message: `Could not resolve example reference "${referenceName}" because the source file was not part of the TypeScript project.`,
          filePath: absoluteFilePath,
        },
      };
    }

    const symbol = this.resolveSymbol(referenceName, sourceFile, "value", project.project);
    if (!symbol) {
      return {
        diagnostic: {
          code: "example-reference-unresolved",
          severity: "warning",
          message: `Could not resolve example reference "${referenceName}". Export a serializable value or inline the example instead.`,
          filePath: absoluteFilePath,
        },
      };
    }

    const value = this.evaluateSymbol(symbol, project.project, new Set<string>());
    if (typeof value === "undefined") {
      return {
        diagnostic: {
          code: "example-reference-unserializable",
          severity: "warning",
          message: `Example reference "${referenceName}" could not be reduced to a serializable value. Use an exported literal, object, array, or schema.parse(...) result instead.`,
          filePath: absoluteFilePath,
        },
      };
    }

    return { value };
  }

  public inferResponsesForExports(
    filePath: string,
    exportNames: readonly string[],
  ): Map<string, InferredRouteResponses> {
    const absoluteFilePath = path.resolve(filePath);
    const project = this.getProject(absoluteFilePath).project;
    const sourceFile = project.program.getSourceFile(absoluteFilePath);
    if (!sourceFile) {
      return new Map();
    }

    const exportNodeMap = this.getExportNodeMap(sourceFile);
    const requestedExportNames = Array.from(
      new Set(exportNames.filter((exportName) => exportNodeMap.has(exportName))),
    );
    if (requestedExportNames.length === 0) {
      return new Map();
    }

    const results = new Map<string, InferredRouteResponses>();
    for (const exportName of requestedExportNames) {
      const exportNode = exportNodeMap.get(exportName);
      if (exportNode) {
        results.set(exportName, this.inferResponsesForExportNode(sourceFile, exportNode, project));
      }
    }
    return results;
  }

  public resolveTypeByName(typeName: string, filePath: string): OpenAPIDefinition | null {
    const absoluteFilePath = path.resolve(filePath);
    const project = this.getProject(absoluteFilePath).project;
    const sourceFile = project.program.getSourceFile(absoluteFilePath);
    if (!sourceFile) {
      return null;
    }

    const symbol = this.resolveSymbol(typeName, sourceFile, "type", project);
    if (!symbol) {
      return null;
    }

    const targetSymbol = this.resolveAlias(symbol, project.checker);
    const declaration = resolveNodeHandle(
      targetSymbol.valueDeclaration ?? targetSymbol.declarations?.[0],
      project,
    );
    if (!declaration) {
      return null;
    }

    const flags = this.sync.SymbolFlags;
    const declaredTypeFlags = (flags.TypeAlias ?? 0) | (flags.Interface ?? 0);
    const resolvedType =
      targetSymbol.flags & declaredTypeFlags
        ? project.checker.getDeclaredTypeOfSymbol(targetSymbol)
        : project.checker.getTypeAtLocation(declaration);
    return resolvedType
      ? this.typeToOpenApiSchema(resolvedType, project.checker, project, new Set<string>())
      : null;
  }

  private getProject(filePath: string): NativeProject {
    const absoluteFilePath = path.resolve(filePath);
    const configPath = findTypeScriptConfigFile(absoluteFilePath);
    const cacheKey = `${this.packagePath}:${configPath ?? absoluteFilePath}`;
    const cachedProject = this.projectCache.get(cacheKey);
    if (cachedProject) {
      return cachedProject;
    }

    let syntheticConfigRoot: string | undefined;
    let projectConfigPath = configPath;
    if (!projectConfigPath) {
      syntheticConfigRoot = createSyntheticSingleFileProject(absoluteFilePath);
      projectConfigPath = path.join(syntheticConfigRoot, "tsconfig.json");
    }
    const snapshot = this.api.updateSnapshot({ openProject: projectConfigPath });
    const project =
      snapshot.getProject(projectConfigPath) ??
      snapshot.getDefaultProjectForFile(absoluteFilePath) ??
      snapshot.getProjects()[0];
    if (!project) {
      snapshot.dispose();
      if (syntheticConfigRoot) {
        fs.rmSync(syntheticConfigRoot, { recursive: true, force: true });
      }
      throw new Error(`Could not create a TypeScript native project for ${absoluteFilePath}`);
    }

    const nativeProject: NativeProject = syntheticConfigRoot
      ? { configPath, project, snapshot, syntheticConfigRoot }
      : { configPath, project, snapshot };
    this.projectCache.set(cacheKey, nativeProject);
    return nativeProject;
  }

  private resolveSymbol(
    name: string,
    location: NativeNode,
    meaning: "type" | "value",
    project: NativeProjectApi,
  ): NativeSymbol | undefined {
    const flags = this.sync.SymbolFlags;
    const typeFlags = (flags.Type ?? 0) | (flags.Alias ?? 0);
    const valueFlags =
      (flags.Value ?? 0) | (flags.Alias ?? 0) | (flags.Variable ?? 0) | (flags.Function ?? 0);
    const symbol = project.checker.resolveName(
      name,
      meaning === "type" ? typeFlags : valueFlags,
      location,
      false,
    );
    return symbol ? this.resolveAlias(symbol, project.checker) : undefined;
  }

  private resolveAlias(symbol: NativeSymbol, checker: NativeCheckerApi): NativeSymbol {
    if (!(symbol.flags & (this.sync.SymbolFlags.Alias ?? 0))) {
      return symbol;
    }

    return checker.getAliasedSymbol?.(symbol) ?? symbol.getExportSymbol?.() ?? symbol;
  }

  private evaluateSymbol(
    symbol: NativeSymbol,
    project: NativeProjectApi,
    seen: Set<string>,
  ): unknown | undefined {
    const declaration = this.getResolvableDeclaration(symbol, project);
    if (!declaration) {
      return undefined;
    }

    const symbolKey = `${declaration.getSourceFile().fileName}:${declaration.pos}:${symbol.name}`;
    if (seen.has(symbolKey)) {
      return undefined;
    }

    seen.add(symbolKey);
    const result = this.evaluateNode(declaration, project, seen);
    seen.delete(symbolKey);
    return result;
  }

  private getResolvableDeclaration(
    symbol: NativeSymbol,
    project: NativeProjectApi,
  ): NativeNode | undefined {
    const target = this.resolveAlias(symbol, project.checker);
    const declarations = [target.valueDeclaration, ...(target.declarations ?? [])];
    return declarations
      .map((declaration) => resolveNodeHandle(declaration, project))
      .find((declaration) => declaration && this.isResolvableDeclaration(declaration));
  }

  private isResolvableDeclaration(node: NativeNode | undefined): node is NativeNode {
    return Boolean(
      node &&
      (this.is("VariableDeclaration", node) ||
        this.is("BindingElement", node) ||
        this.is("PropertyAssignment", node) ||
        this.is("ShorthandPropertyAssignment", node) ||
        this.is("FunctionDeclaration", node) ||
        this.is("EnumMember", node)),
    );
  }

  private evaluateNode(
    node: NativeNode,
    project: NativeProjectApi,
    seen: Set<string>,
  ): unknown | undefined {
    const syntaxKind = this.ast.SyntaxKind;
    if (this.is("VariableDeclaration", node) || this.is("BindingElement", node)) {
      return node.initializer ? this.evaluateNode(node.initializer, project, seen) : undefined;
    }

    if (this.is("PropertyAssignment", node)) {
      return node.initializer ? this.evaluateNode(node.initializer, project, seen) : undefined;
    }

    if (this.is("ShorthandPropertyAssignment", node)) {
      const symbol = project.checker.getShorthandAssignmentValueSymbol(node);
      return symbol ? this.evaluateSymbol(symbol, project, seen) : undefined;
    }

    if (
      this.is("ParenthesizedExpression", node) ||
      this.is("AsExpression", node) ||
      this.is("TypeAssertionExpression", node) ||
      this.is("SatisfiesExpression", node) ||
      this.is("NonNullExpression", node)
    ) {
      return node.expression ? this.evaluateNode(node.expression, project, seen) : undefined;
    }

    if (this.is("PrefixUnaryExpression", node)) {
      const operand = node.operand ? this.evaluateNode(node.operand, project, seen) : undefined;
      if (typeof operand !== "number") {
        return undefined;
      }

      const operator = node.operator;
      if (typeof operator === "undefined") {
        return undefined;
      }

      switch (operator) {
        case syntaxKind.MinusToken:
          return -operand;
        case syntaxKind.PlusToken:
          return operand;
        default:
          return undefined;
      }
    }

    if (this.isStringLiteralLike(node)) {
      return node.text;
    }

    if (this.is("NumericLiteral", node)) {
      return Number(node.text);
    }

    if (node.kind === syntaxKind.TrueKeyword) {
      return true;
    }

    if (node.kind === syntaxKind.FalseKeyword) {
      return false;
    }

    if (node.kind === syntaxKind.NullKeyword) {
      return null;
    }

    if (this.is("ObjectLiteralExpression", node)) {
      const result: Record<string, unknown> = {};
      for (const property of node.properties ?? []) {
        if (this.is("SpreadAssignment", property)) {
          const spreadValue = property.expression
            ? this.evaluateNode(property.expression, project, seen)
            : undefined;
          if (!isRecord(spreadValue)) {
            return undefined;
          }
          Object.assign(result, spreadValue);
          continue;
        }

        const propertyName = this.getPropertyName(property.name);
        if (!propertyName) {
          return undefined;
        }

        const value = this.evaluateNode(property, project, seen);
        if (typeof value !== "undefined") {
          result[propertyName] = value;
        }
      }
      return result;
    }

    if (this.is("ArrayLiteralExpression", node)) {
      const result: unknown[] = [];
      for (const element of node.elements ?? []) {
        if (this.is("SpreadElement", element)) {
          const spreadValue = element.expression
            ? this.evaluateNode(element.expression, project, seen)
            : undefined;
          if (!Array.isArray(spreadValue)) {
            return undefined;
          }
          result.push(...spreadValue);
          continue;
        }
        result.push(this.evaluateNode(element, project, seen));
      }
      return result;
    }

    if (this.is("Identifier", node)) {
      const symbol = project.checker.getSymbolAtLocation(node);
      return symbol ? this.evaluateSymbol(symbol, project, seen) : undefined;
    }

    if (this.is("CallExpression", node)) {
      const callee = node.expression;
      const calleeText = this.getText(callee);
      if (
        callee &&
        this.is("PropertyAccessExpression", callee) &&
        ["parse", "parseAsync"].includes(callee.name?.text ?? "")
      ) {
        return node.arguments?.[0]
          ? this.evaluateNode(node.arguments[0], project, seen)
          : undefined;
      }

      if (calleeText === "Object.freeze") {
        return node.arguments?.[0]
          ? this.evaluateNode(node.arguments[0], project, seen)
          : undefined;
      }
    }

    if (this.is("EnumMember", node)) {
      return node.initializer
        ? this.evaluateNode(node.initializer, project, seen)
        : this.getText(node.name);
    }

    return undefined;
  }

  private getExportNodeMap(sourceFile: NativeNode): Map<string, NativeNode> {
    const exportNodes = new Map<string, NativeNode>();
    for (const statement of sourceFile.statements ?? []) {
      if (
        this.is("FunctionDeclaration", statement) &&
        statement.name?.text &&
        this.hasExportModifier(statement)
      ) {
        exportNodes.set(statement.name.text, statement);
        continue;
      }

      if (this.is("VariableStatement", statement) && this.hasExportModifier(statement)) {
        for (const declaration of statement.declarationList?.declarations ?? []) {
          if (declaration.name && this.is("Identifier", declaration.name)) {
            exportNodes.set(declaration.name.text ?? "", declaration);
          }
        }
      }
    }
    return exportNodes;
  }

  private hasExportModifier(node: NativeNode): boolean {
    return Boolean(
      node.modifierFlags && node.modifierFlags & (this.sync.ModifierFlags.Export ?? 0),
    );
  }

  private inferResponsesForExportNode(
    sourceFile: NativeNode,
    exportNode: NativeNode,
    project: NativeProjectApi,
  ): InferredRouteResponses {
    const diagnostics: Diagnostic[] = [];
    const responses = this.inferResponsesFromReturns(exportNode, sourceFile, project, diagnostics);
    if (responses.length > 0) {
      return { responses, diagnostics };
    }

    const signatureResponse = this.inferResponseFromSignature(exportNode, project);
    return {
      responses: signatureResponse ? [signatureResponse] : [],
      diagnostics,
    };
  }

  private inferResponsesFromReturns(
    exportNode: NativeNode,
    sourceFile: NativeNode,
    project: NativeProjectApi,
    diagnostics: Diagnostic[],
  ): InferredResponseDefinition[] {
    const functionLike = this.getFunctionLikeNode(exportNode);
    if (!functionLike?.body) {
      return [];
    }

    const responses: InferredResponseDefinition[] = [];
    this.visitReturns(functionLike.body, (expression) => {
      const inferredResponse = this.inferResponseFromExpression(expression, sourceFile, project);
      if (inferredResponse) {
        responses.push(inferredResponse);
        return;
      }

      diagnostics.push({
        code: "response-inference-unresolved",
        severity: "warning",
        message:
          "Could not fully infer a response schema from a return statement. Add an explicit @response tag to make the output deterministic.",
        filePath: sourceFile.fileName,
      });
    });

    return dedupeResponses(responses);
  }

  private inferResponseFromExpression(
    expression: NativeNode,
    sourceFile: NativeNode,
    project: NativeProjectApi,
  ): InferredResponseDefinition | undefined {
    if (this.is("CallExpression", expression)) {
      const calleeText = this.getText(expression.expression, sourceFile);
      if (calleeText === "NextResponse.json" || calleeText === "Response.json") {
        const callType = project.checker.getTypeAtLocation(expression);
        const responseType = callType
          ? this.extractNamedResponseType(callType, project.checker)
          : undefined;
        const bodyType = expression.arguments?.[0]
          ? project.checker.getTypeAtLocation(expression.arguments[0])
          : undefined;
        const candidate = responseType
          ? { typeName: responseType }
          : bodyType
            ? this.toSchemaCandidate(bodyType, project.checker, project)
            : {};
        return {
          ...candidate,
          statusCode: this.getStatusCodeFromInit(expression.arguments?.[1]) || "200",
          contentType: "application/json",
          source: "typescript",
        };
      }

      if (calleeText === "NextResponse.redirect" || calleeText === "Response.redirect") {
        return {
          statusCode: this.getStatusCodeFromRedirectCall(expression) || "302",
          source: "typescript",
        };
      }
    }

    if (
      this.is("NewExpression", expression) &&
      this.getText(expression.expression, sourceFile) === "Response" &&
      this.getStatusCodeFromInit(expression.arguments?.[1]) === "204"
    ) {
      return { statusCode: "204", source: "typescript" };
    }

    return undefined;
  }

  private inferResponseFromSignature(
    exportNode: NativeNode,
    project: NativeProjectApi,
  ): InferredResponseDefinition | undefined {
    const signatureNode = this.getFunctionLikeNode(exportNode);
    if (!signatureNode) {
      return undefined;
    }

    const signature =
      project.checker.getSignatureFromDeclaration?.(signatureNode) ??
      this.getCallSignatureForNode(signatureNode, project);
    if (!signature) {
      return undefined;
    }

    const returnType = project.checker.getReturnTypeOfSignature(signature);
    const typeName = returnType
      ? this.extractNamedResponseType(
          this.unwrapPromiseType(returnType, project.checker),
          project.checker,
        )
      : undefined;
    return typeName ? { typeName, source: "typescript" } : undefined;
  }

  private getFunctionLikeNode(node: NativeNode): NativeNode | undefined {
    if (this.is("FunctionDeclaration", node)) {
      return node;
    }

    if (
      this.is("VariableDeclaration", node) &&
      node.initializer &&
      (this.is("ArrowFunction", node.initializer) ||
        this.is("FunctionExpression", node.initializer))
    ) {
      return node.initializer;
    }

    return undefined;
  }

  private getCallSignatureForNode(
    node: NativeNode,
    project: NativeProjectApi,
  ): NativeSignature | undefined {
    const type = project.checker.getTypeAtLocation(node);
    const signatureKind = this.sync.SignatureKind?.Call ?? 0;
    return type ? project.checker.getSignaturesOfType(type, signatureKind)[0] : undefined;
  }

  private visitReturns(node: NativeNode, visitor: (expression: NativeNode) => void): void {
    node.forEachChild((child) => {
      if (this.is("ReturnStatement", child) && child.expression) {
        visitor(child.expression);
        return undefined;
      }

      if (
        this.is("FunctionDeclaration", child) ||
        this.is("ArrowFunction", child) ||
        this.is("FunctionExpression", child) ||
        this.is("MethodDeclaration", child)
      ) {
        return undefined;
      }

      this.visitReturns(child, visitor);
      return undefined;
    });
  }

  private getStatusCodeFromInit(node: NativeNode | undefined): string | undefined {
    if (!node || !this.is("ObjectLiteralExpression", node)) {
      return undefined;
    }

    for (const property of node.properties ?? []) {
      if (
        this.is("PropertyAssignment", property) &&
        property.name &&
        this.is("Identifier", property.name) &&
        property.name.text === "status" &&
        property.initializer &&
        this.is("NumericLiteral", property.initializer)
      ) {
        return property.initializer.text;
      }
    }

    return undefined;
  }

  private getStatusCodeFromRedirectCall(expression: NativeNode): string | undefined {
    const statusArgument = expression.arguments?.[1];
    if (statusArgument && this.is("NumericLiteral", statusArgument)) {
      return statusArgument.text;
    }

    if (!statusArgument || !this.is("ObjectLiteralExpression", statusArgument)) {
      return undefined;
    }

    return this.getStatusCodeFromInit(statusArgument);
  }

  private toSchemaCandidate(
    type: NativeType,
    checker: NativeCheckerApi,
    project: NativeProjectApi,
  ): Pick<InferredResponseDefinition, "typeName" | "schema"> {
    const typeName = this.extractNamedType(type, checker);
    return typeName
      ? { typeName }
      : { schema: this.typeToOpenApiSchema(type, checker, project, new Set<string>()) };
  }

  private extractNamedResponseType(
    type: NativeType,
    checker: NativeCheckerApi,
  ): string | undefined {
    const firstTypeArgument = getNativeTypeArguments(type, checker)[0];
    return firstTypeArgument ? this.extractNamedType(firstTypeArgument, checker) : undefined;
  }

  private extractNamedType(type: NativeType, checker: NativeCheckerApi): string | undefined {
    if (
      isNativeArrayType(type, checker, this.sync.ObjectFlags) ||
      isNativeTupleType(type, checker, this.sync.ObjectFlags)
    ) {
      const elementType = getNativeTypeArguments(type, checker)[0];
      const elementName = elementType ? this.extractNamedType(elementType, checker) : undefined;
      return elementName ? `${elementName}[]` : undefined;
    }

    const aliasName = type.getAliasSymbol?.()?.name;
    if (aliasName && isUsableTypeName(aliasName) && !isIgnoredRuntimeType(aliasName)) {
      return aliasName;
    }

    const symbolName = type.getSymbol?.()?.name;
    if (symbolName && isUsableTypeName(symbolName) && !isIgnoredRuntimeType(symbolName)) {
      return symbolName;
    }

    return undefined;
  }

  private typeToOpenApiSchema(
    type: NativeType,
    checker: NativeCheckerApi,
    project: NativeProjectApi,
    seen: Set<string>,
  ): OpenAPIDefinition {
    return typeToOpenApiSchema(type, checker, project, seen, {
      objectFlags: this.sync.ObjectFlags,
      symbolFlags: this.sync.SymbolFlags,
      typeFlags: this.sync.TypeFlags,
    });
  }

  private unwrapPromiseType(type: NativeType, checker: NativeCheckerApi): NativeType {
    if (type.getSymbol?.()?.name === "Promise") {
      return getNativeTypeArguments(type, checker)[0] ?? type;
    }
    return type;
  }

  private is(name: string, node: NativeNode | undefined): boolean {
    const predicate = this.ast[`is${name}`];
    return typeof predicate === "function"
      ? (predicate as (candidate: NativeNode | undefined) => boolean)(node)
      : node?.kind === this.ast.SyntaxKind[name];
  }

  private isStringLiteralLike(node: NativeNode): boolean {
    return (
      this.is("StringLiteral", node) ||
      this.is("NoSubstitutionTemplateLiteral", node) ||
      this.is("TemplateHead", node) ||
      this.is("TemplateMiddle", node) ||
      this.is("TemplateTail", node)
    );
  }

  private getPropertyName(name: NativeNode | undefined): string | undefined {
    if (!name) {
      return undefined;
    }

    if (this.is("Identifier", name) || this.is("PrivateIdentifier", name)) {
      return name.text;
    }

    if (this.is("StringLiteral", name) || this.is("NumericLiteral", name)) {
      return name.text;
    }

    return undefined;
  }

  private getText(node: NativeNode | undefined, sourceFile?: NativeNode): string {
    if (!node) {
      return "";
    }

    if (node.getText) {
      return node.getText(sourceFile);
    }

    if (
      this.is("Identifier", node) ||
      this.isStringLiteralLike(node) ||
      this.is("NumericLiteral", node)
    ) {
      return node.text ?? "";
    }

    if (this.is("PropertyAccessExpression", node)) {
      return `${this.getText(node.expression, sourceFile)}.${this.getText(node.name, sourceFile)}`;
    }

    return node.text ?? "";
  }
}

function createSyntheticSingleFileProject(filePath: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-ts7-single-"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          allowJs: false,
          jsx: "preserve",
          module: "esnext",
          moduleResolution: "bundler",
          target: "es2022",
        },
        files: [filePath],
      },
      null,
      2,
    ),
  );
  return root;
}

function disposeNativeProject(project: NativeProject): void {
  project.snapshot.dispose();
  if (project.syntheticConfigRoot) {
    fs.rmSync(project.syntheticConfigRoot, { recursive: true, force: true });
  }
}

function isWithinConfigProject(filePath: string, configPath: string): boolean {
  return !path.relative(path.dirname(configPath), filePath).startsWith("..");
}

function resolveFileModule(importPath: string, fromFilePath: string): string | null {
  const basePath = importPath.startsWith("/")
    ? importPath
    : path.resolve(path.dirname(fromFilePath), importPath);
  return resolveFileCandidate(basePath);
}

function resolvePathMappedModule(
  importPath: string,
  fromFilePath: string,
  compilerOptions: Record<string, unknown>,
): string | null {
  const paths = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};
  const baseUrl =
    typeof compilerOptions.baseUrl === "string"
      ? path.resolve(
          path.dirname(findTypeScriptConfigFile(fromFilePath) ?? fromFilePath),
          compilerOptions.baseUrl,
        )
      : path.dirname(findTypeScriptConfigFile(fromFilePath) ?? fromFilePath);

  for (const [pattern, replacements] of Object.entries(paths)) {
    if (!Array.isArray(replacements)) {
      continue;
    }

    const wildcardIndex = pattern.indexOf("*");
    const prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
    const suffix = wildcardIndex === -1 ? "" : pattern.slice(wildcardIndex + 1);
    if (!importPath.startsWith(prefix) || !importPath.endsWith(suffix)) {
      continue;
    }

    const wildcard = importPath.slice(prefix.length, importPath.length - suffix.length);
    for (const replacement of replacements) {
      if (typeof replacement !== "string") {
        continue;
      }

      const candidate = path.resolve(baseUrl, replacement.replace("*", wildcard));
      const resolved = resolveFileCandidate(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function resolveNodeModule(importPath: string, fromFilePath: string): string | null {
  try {
    const resolvedPath = moduleRequire.resolve(importPath, {
      paths: [path.dirname(path.resolve(fromFilePath))],
    });
    return resolvedPath.endsWith(".d.ts") ? null : resolvedPath;
  } catch {
    return null;
  }
}

function resolveFileCandidate(basePath: string): string | null {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.mts"),
    path.join(basePath, "index.cts"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.jsx"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && !candidate.endsWith(".d.ts")) ?? null
  );
}

function dedupeResponses(responses: InferredResponseDefinition[]): InferredResponseDefinition[] {
  const seenKeys = new Set<string>();
  return responses.filter((response) => {
    const key = [
      response.statusCode || "",
      response.typeName || "",
      response.itemTypeName || "",
      response.contentType || "",
      response.schema ? JSON.stringify(response.schema) : "",
    ].join("|");
    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIgnoredRuntimeType(typeName: string): boolean {
  return typeName === "Promise" || typeName === "Response" || typeName === "NextResponse";
}

function isUsableTypeName(typeName: string): boolean {
  return (
    typeName !== "__type" && !typeName.startsWith("__object") && /^[A-Za-z_$][\w$]*$/.test(typeName)
  );
}
