import { fail, ok, Result } from '../../../../shared/domain/result';
import { readableError } from '../services/excel-api.service';

/** Settles an API request into a Result whose error is the readable message. */
export async function apiResult<T>(request: Promise<T>): Promise<Result<T>> {
  try {
    return ok(await request);
  } catch (error) {
    return fail(await readableError(error));
  }
}
