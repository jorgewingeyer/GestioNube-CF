import { toast } from "sonner";

/**
 * Standard response interface for Server Actions and tRPC procedures.
 * Ensures consistent data structure across the application.
 */
export interface ActionResponse<T = unknown> {
  success: boolean;
  message?: string | any;
  error?: string;
  data?: T;
}

/**
 * Options for the toasted helper.
 */
export interface ToastedOptions<T> {
  /** The async function (Server Action or tRPC call) to execute */
  action: () => Promise<ActionResponse<T>>;
  /** Message shown while the action is in progress */
  loadingMessage?: string;
  /** Message shown on success. Can be a string or a function that receives the action response */
  successMessage?: string | ((res: ActionResponse<T>) => string);
  /** Message shown on error. Can be a string or a function that receives the error object */
  errorMessage?: string | ((error: Error) => string);
  /** Callback triggered after a successful action */
  onSuccess?: (res: ActionResponse<T>) => void;
  /** Callback triggered after an error occurred */
  onError?: (error: Error) => void;
}

/**
 * Executes a Server Action or tRPC call with a toast promise for automatic
 * feedback on loading, success, and error states.
 *
 * @example
 * await toasted({
 *   action: () => loginAction(values),
 *   loadingMessage: "Iniciando sesión...",
 *   onSuccess: () => router.push("/dashboard")
 * });
 *
 * @param options - Configuration for the action execution and feedback
 */
export async function toasted<T>({
  action,
  loadingMessage = "Procesando...",
  successMessage,
  errorMessage,
  onSuccess,
  onError,
}: ToastedOptions<T>): Promise<void> {
  const promise = (async () => {
    const res = await action();

    if (!res.success) {
      // We throw an error to be caught by toast.promise error state
      const errorMsg =
        typeof res.message === "string"
          ? res.message
          : res.error || "Ocurrió un error inesperado.";
      throw new Error(errorMsg);
    }

    if (onSuccess) {
      onSuccess(res);
    }

    return res;
  })();

  toast.promise(promise, {
    loading: loadingMessage,
    success: (res) => {
      if (typeof successMessage === "function") return successMessage(res);
      if (successMessage) return successMessage;
      return typeof res.message === "string"
        ? res.message
        : "Operación completada con éxito.";
    },
    error: (err: Error) => {
      if (typeof errorMessage === "function") return errorMessage(err);
      if (errorMessage) return errorMessage;
      return err.message;
    },
  });

  try {
    // We await the promise to ensure the calling component (e.g. form)
    // knows when the action is truly finished (e.g. for isSubmitting state).
    await promise;
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
  }
}
