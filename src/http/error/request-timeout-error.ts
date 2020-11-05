import { EpsilonHttpError } from './epsilon-http-error';

export class RequestTimeoutError<T = void> extends EpsilonHttpError<T> {
  public static readonly HTTP_CODE: number = 500;

  constructor(...errors: string[]) {
    super(...errors);
    this.withHttpStatusCode(RequestTimeoutError.HTTP_CODE);
  }
}
