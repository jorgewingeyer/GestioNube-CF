import { AppError } from "./app-error";

/**
 * Thrown when a registration attempt is made with an email that already exists in the database.
 */
export class DuplicateEmailError extends AppError {
  /**
   * Initializes and logs a new DuplicateEmailError.
   * @param message - User-facing warning message.
   */
  constructor(
    message = "Vaya, parece que este correo electrónico ya está registrado. ¿Quizás quisiste iniciar sesión?",
  ) {
    super({
      message,
      statusCode: 400,
      code: "EMAIL_ALREADY_REGISTERED",
      silent: true,
    });
    this.name = "DuplicateEmailError";
  }
}
