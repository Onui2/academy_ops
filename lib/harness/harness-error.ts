export class HarnessError extends Error {
  readonly status: number;
  readonly exposeMessage: string;

  constructor(message: string, status = 400, exposeMessage?: string) {
    super(message);
    this.name = "HarnessError";
    this.status = status;
    this.exposeMessage = exposeMessage ?? message;
  }
}

export function isHarnessError(error: unknown): error is HarnessError {
  return error instanceof HarnessError;
}
