import { ActionResponse } from "@/lib/utils/action-toast";
import { Logger } from "@repo/logger";

/**
 * Minimum subset of Response required by apiAction to handle responses.
 * Avoids type assignment conflicts between Hono ClientResponse and Cloudflare Workers Response.
 */
interface MinimalResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

/**
 * Configuration options required to execute a Server Action securely.
 */
interface ApiActionOptions<T> {
  /** The asynchronous Hono RPC API call function execution (returns a Promise resolving to minimal response properties) */
  apiCall: () => Promise<MinimalResponse>;
  /** Optional callback to process success data on the server side (e.g. cookie manipulation) */
  onSuccess?: (data: T) => Promise<void> | void;
  /** Context name of the Server Action for logging and identification */
  actionName: string;
}

/**
 * Wraps Hono RPC fetch calls inside Next.js Server Actions to centralize try-catch handling,
 * response JSON parsing, HTTP status validation, and unified logging.
 *
 * Establishes that user-facing success and failure messages originate solely from the API backend.
 * Only logs on failure (errors or warnings) to avoid polluting logs on successful executions.
 *
 * @example
 * // In apps/web/src/actions/auth/login-action.ts
 * export async function loginAction(data: LoginCredentials) {
 *   return apiAction({
 *     actionName: "login",
 *     apiCall: () => api.auth.login.$post({ json: data }),
 *     onSuccess: async (responseData) => {
 *       // Manage server session cookie safely on NextJS server
 *       await createSession(responseData.user.id);
 *     }
 *   });
 * }
 *
 * @param options - Parameters containing the API call function, the action context name, and onSuccess callback.
 * @returns A structured promise containing success status, friendly user message, and typed data/error details.
 */
export async function apiAction<T>({
  apiCall,
  onSuccess,
  actionName,
}: ApiActionOptions<T>): Promise<ActionResponse<T>> {
  const logger = new Logger("Web:ServerAction");
  const logContext = { file: "api-action.ts", actionName };

  try {
    const response = await apiCall();

    // 1. Check HTTP level errors (e.g. 500 Internal Error, 404 Not Found)
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`HTTP error returned. Status: ${response.status}`, logContext, errorText);

      // Attempt to parse if the backend returned structured error in JSON format
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson && typeof errorJson === "object" && "message" in errorJson) {
          return {
            success: false,
            message: errorJson.message,
            error: errorJson.error || `HTTP ${response.status}`,
          };
        }
      } catch {
        // Fallback to default response if parsing fails
      }

      return {
        success: false,
        message: "No se pudo procesar la solicitud en el servidor. Por favor, intenta de nuevo.",
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    // 2. Parse response JSON safely
    const json = (await response.json()) as {
      success: boolean;
      message?: string;
      error?: string;
      data?: any;
    };

    // 3. Check application business-level failure (e.g. authentication failed, invalid states)
    if (!json.success) {
      logger.warn("API request failed validation/business logic", logContext, json.message || json.error);
      return {
        success: false,
        message: json.message || "La operación no se pudo completar.",
        error: json.error,
      };
    }

    // 4. Run secondary server-side callbacks (such as createSession)
    if (onSuccess) {
      await onSuccess(json.data);
    }

    // Notice that there is no logger.info() here if everything is successful, as requested.
    return {
      success: true,
      message: json.message,
      data: json.data as T,
    };
  } catch (error) {
    // 5. Catch unexpected runtime crashes
    logger.error("Unexpected crash during action execution", logContext, error);

    return {
      success: false,
      message: "Ocurrió un error inesperado al procesar la solicitud. Por favor, intenta de nuevo.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
