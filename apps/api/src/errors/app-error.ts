import { Logger } from "@repo/logger";

/**
 * Options for configuring AppError behavior.
 */
interface AppErrorParams {
  /** User-facing friendly message in Spanish. */
  message: string;
  /** HTTP status code. */
  statusCode?: number;
  /** Unique textual error code. */
  code?: string;
  /** Additional error context details */
  details?: any;
  /**
   * When true, suppresses automatic warn logging on construction.
   * Use this for expected business flows (e.g. duplicate email, already exists)
   * that are normal user behavior and should not produce log noise.
   */
  silent?: boolean;
}

/**
 * Base class for application-specific business logic errors.
 * Automatically logs its own instantiation using the shared Logger,
 * unless the `silent` option is set to true.
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  /**
   * Initializes a new AppError, logging it unless silent mode is enabled.
   * @param params - Configuration object for the error.
   */
  constructor({
    message,
    statusCode = 400,
    code = "BAD_REQUEST",
    details,
    silent = false,
  }: AppErrorParams) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Skip logging for expected business flows to avoid log noise
    if (silent) return;

    // Automatically log the application error occurrence
    const logger = new Logger(`API:Error:${this.name}`);
    logger.warn(`${code}: ${message}`, { details });
  }
}
