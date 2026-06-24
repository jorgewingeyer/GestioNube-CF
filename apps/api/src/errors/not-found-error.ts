import { AppError } from "./app-error";

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends AppError {
  /**
   * Initializes and logs a new NotFoundError.
   * @param message - User-facing warning message.
   */
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
