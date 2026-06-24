export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Context interface for logging metadata.
 * Allows tracking the origin of the log like file name, line number, or custom business properties.
 */
export interface LogContext {
  /** The filename where the log was triggered */
  file?: string;
  /** The line number in the source file */
  line?: number;
  /** Any other dynamic contextual properties */
  [key: string]: any;
}

/**
 * Standard structured logger designed to run across multiple environments:
 * - Local development: Prints readable, ANSI-colored formatted console logs.
 * - Cloudflare Workers: Outputs structured JSON for automated log indexing and search.
 *
 * @example
 * // Create a logger instance for a module
 * const logger = new Logger("API:Auth:Login");
 * 
 * // Log a warning when validation fails
 * logger.warn("Validation failed for user email", { file: "login.ts", line: 24, email: "user@example.com" });
 * 
 * // Log a critical error with raw exception details
 * try {
 *   await db.insert(...);
 * } catch (error) {
 *   logger.error("Failed to insert user to database", { file: "db.ts", line: 110 }, error);
 * }
 */
export class Logger {
  private serviceName: string;

  /**
   * Initializes a new Logger instance.
   * @param serviceName - The name of the application service or module (e.g. "API:Auth", "Web:ServerAction").
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Evaluates if the current execution is running in development mode.
   * @returns true if running in development or testing, false otherwise.
   */
  private checkIsDev(): boolean {
    if (typeof process !== "undefined" && process.env) {
      return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    }
    return true; // Fallback to dev if we can't determine
  }

  /**
   * Internal formatting and logging dispatcher.
   * Prints color logs to stdout in dev, and stringifies structured JSON in prod.
   * @param level - Severity level of the log.
   * @param message - Main descriptive message of the event.
   * @param context - Additional structured metadata.
   * @param args - Extra raw parameters or caught errors to include.
   */
  private log(level: LogLevel, message: string, context?: LogContext, ...args: any[]): void {
    const isDev = this.checkIsDev();
    const timestamp = new Date().toISOString();

    if (isDev) {
      // ANSI colors for readable terminal formatting in development
      const colors = {
        debug: "\x1b[36m", // Cyan
        info: "\x1b[32m",  // Green
        warn: "\x1b[33m",  // Yellow
        error: "\x1b[31m", // Red
      };
      const reset = "\x1b[0m";
      const color = colors[level] || reset;

      // Format contextual properties like [filename.ts:line] if provided
      const contextStr = context 
        ? ` [${context.file || ""}${context.line ? `:${context.line}` : ""}]`
        : "";

      console.log(
        `${color}[${timestamp}] [${level.toUpperCase()}] [${this.serviceName}]${contextStr}:${reset} ${message}`,
        context ? { ...context } : "",
        ...args
      );
      return;
    }

    // Structured JSON logging for production (Cloudflare Workers logs)
    const logData = {
      timestamp,
      level,
      serviceName: this.serviceName,
      message,
      context,
      details: args.length > 0 ? args : undefined,
    };

    if (level === "error") {
      console.error(JSON.stringify(logData));
      return;
    }
    
    if (level === "warn") {
      console.warn(JSON.stringify(logData));
      return;
    }

    console.log(JSON.stringify(logData));
  }

  /**
   * Logs events at the 'debug' level for local tracing.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  debug(message: string, context?: LogContext, ...args: any[]): void {
    this.log("debug", message, context, ...args);
  }

  /**
   * Logs events at the 'info' level.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  info(message: string, context?: LogContext, ...args: any[]): void {
    this.log("info", message, context, ...args);
  }

  /**
   * Logs warnings about unexpected business flow issues or schema validation errors.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  warn(message: string, context?: LogContext, ...args: any[]): void {
    this.log("warn", message, context, ...args);
  }

  /**
   * Logs critical errors, server crashes, or API connection issues.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  error(message: string, context?: LogContext, ...args: any[]): void {
    this.log("error", message, context, ...args);
  }
}
