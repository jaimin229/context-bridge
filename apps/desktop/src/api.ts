export class AppCallError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppCallError';
    this.code = code;
  }
}

export async function call<T>(operation: Promise<ResultLike<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    const details = result.error.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
    throw new AppCallError(
      result.error.code,
      details ? `${result.error.message} ${details}` : result.error.message,
    );
  }
  return result.value;
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppCallError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
