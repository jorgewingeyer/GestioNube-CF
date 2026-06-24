import { Logger } from "@repo/logger";

/**
 * Base class for application-specific business logic errors.
 * Automatically logs its own instantiation using the shared Logger.
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  /**
   * Initializes and logs a new AppError.
   * @param message - User-facing friendly message in Spanish.
   * @param statusCode - HTTP status code.
   * @param code - Unique textual error code.
   * @param details - Additional error context details.
   */
  constructor(message: string, statusCode = 400, code = "BAD_REQUEST", details?: any) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Automatically log the application error occurrence
    const logger = new Logger(`API:Error:${this.name}`);
    logger.warn(`${code}: ${message}`, { details });
  }
}
