/**
 * A form's state in an island, as Inertia's useForm: what is typed (data), the server's answer to it
 * (errors, failure) and whether it is being sent (processing). It sends JSON to the API with fetch,
 * so the page is not loaded again and nothing typed is lost
 */
import { useState } from "hono/jsx";

/** A failure the API answered with: { error: { code, message, details? } } */
export type Failure = { code: string; message: string; details?: unknown };

type Options<T> = {
  /** Turns what is typed into what the API takes (a string of digits into a number) */
  transform?: (data: T) => unknown;
  onSuccess?: (body: unknown) => void;
  /** Called with any failure but VALIDATION_ERROR (as Inertia's onError) */
  onError?: (failure: Failure) => void;
};

export const useForm = <T extends Record<string, unknown>>(initial: T) => {
  const [data, setAll] = useState(initial);
  /** The fields the API's VALIDATION_ERROR named, each with its first reason */
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  /** Any other failure (MONTH_CLOSED, EXPENSE_OVER_BUDGET, ...); the island decides how to show it */
  const [failure, setFailure] = useState<Failure | null>(null);
  const [processing, setProcessing] = useState(false);

  const setData = <K extends keyof T>(key: K, value: T[K]) =>
    setAll((current) => ({ ...current, [key]: value }));

  const submit = async (method: string, url: string, options: Options<T> = {}) => {
    setProcessing(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        // DELETE sends no body
        body:
          method === "DELETE"
            ? undefined
            : JSON.stringify(options.transform ? options.transform(data) : data),
      });
      const body: unknown = await res.json();
      if (res.ok) {
        setErrors({});
        setFailure(null);
        options.onSuccess?.(body);
        return;
      }
      // hono-kit answers { error: { code, message } }; Better Auth (/api/auth) answers { code, message }
      const error = (body as { error?: Failure }).error ?? (body as Failure);
      if (error.code === "VALIDATION_ERROR") {
        const details = (error.details ?? {}) as Record<string, string[]>;
        setErrors(
          Object.fromEntries(
            Object.entries(details).map(([field, reasons]) => [field, reasons[0]]),
          ) as Partial<Record<keyof T, string>>,
        );
        setFailure(null);
      } else {
        setErrors({});
        setFailure(error);
        options.onError?.(error);
      }
    } finally {
      setProcessing(false);
    }
  };

  return {
    data,
    setData,
    errors,
    failure,
    processing,
    post: (url: string, options?: Options<T>) => submit("POST", url, options),
    put: (url: string, options?: Options<T>) => submit("PUT", url, options),
    delete: (url: string, options?: Options<T>) => submit("DELETE", url, options),
    /** Back to the initial values, or only these fields */
    reset: (...keys: (keyof T)[]) =>
      setAll((current) =>
        keys.length === 0
          ? initial
          : { ...current, ...Object.fromEntries(keys.map((key) => [key, initial[key]])) },
      ),
  };
};
