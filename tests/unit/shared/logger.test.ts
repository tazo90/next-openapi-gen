import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@next-openapi-gen/shared/logger.js";

const OriginalError = globalThis.Error;

describe("logger", () => {
  afterEach(() => {
    globalThis.Error = OriginalError;
    vi.restoreAllMocks();
    logger.init({ debug: false } as never);
  });

  it("falls back to Unknown when stack information is unavailable", () => {
    class NoStackError extends OriginalError {
      constructor() {
        super("no stack");
        this.stack = "";
      }
    }

    globalThis.Error = NoStackError as ErrorConstructor;

    expect((logger as any).getCallerInfo()).toBe("Unknown");
  });

  it("extracts the caller name from stack traces and falls back when parsing fails", () => {
    class StackError extends OriginalError {
      constructor() {
        super("stack");
        this.stack = ["Error", "    at one", "    at two", "    at UserService.createUser"].join(
          "\n",
        );
      }
    }

    globalThis.Error = StackError as ErrorConstructor;
    expect((logger as any).getCallerInfo()).toBe("UserService");

    class UnparseableStackError extends OriginalError {
      constructor() {
        super("stack");
        this.stack = ["Error", "    at one", "    at two", "    at <anonymous>"].join("\n");
      }
    }

    globalThis.Error = UnparseableStackError as ErrorConstructor;
    expect((logger as any).getCallerInfo()).toBe("Unknown");
  });

  it("falls back to Unknown when the caller line is missing", () => {
    class ShortStackError extends OriginalError {
      constructor() {
        super("stack");
        this.stack = "Error\n    at one";
      }
    }

    globalThis.Error = ShortStackError as ErrorConstructor;

    expect((logger as any).getCallerInfo()).toBe("Unknown");
  });

  it("writes log, warn, and error messages with the resolved caller", () => {
    vi.spyOn(logger as any, "getCallerInfo").mockReturnValue("Tester");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.log("hello", { ok: true });
    logger.warn("careful", 1);
    logger.error("boom", 2);

    expect(logSpy).toHaveBeenCalledWith("[Tester] hello", { ok: true });
    expect(warnSpy).toHaveBeenCalledWith("[Tester] careful", 1);
    expect(errorSpy).toHaveBeenCalledWith("[Tester] boom", 2);
  });

  it("only logs debug messages when debug mode is enabled", () => {
    vi.spyOn(logger as any, "getCallerInfo").mockReturnValue("Tester");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.init({ debug: false } as never);
    logger.debug("hidden");
    expect(logSpy).not.toHaveBeenCalled();

    logger.init({ debug: true } as never);
    logger.debug("visible", 42);
    expect(logSpy).toHaveBeenCalledWith("[Tester] visible", 42);
  });
});
