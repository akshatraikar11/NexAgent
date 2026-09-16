export class RetryableError extends Error {
  public readonly stepName: string;
  public readonly attempt: number;

  constructor(message: string, stepName: string, attempt = 1) {
    super(message);
    this.name = 'RetryableError';
    this.stepName = stepName;
    this.attempt = attempt;
  }
}

export class FatalError extends Error {
  public readonly stepName: string;

  constructor(message: string, stepName: string) {
    super(message);
    this.name = 'FatalError';
    this.stepName = stepName;
  }
}
