import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** Gives every error the same shape and never leaks internal details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);
    if (host.getType() !== 'http') {
      // Realtime handlers answer through acknowledgements and never throw on purpose,
      // so anything that reaches here is unexpected: log it, never echo details to the socket.
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
      return;
    }
    const response = host.switchToHttp().getResponse<Response>();
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Error',
      };
    }
    const statusCode = exception.getStatus();
    const res = exception.getResponse();
    const fallbackError = STATUS_CODES[statusCode] ?? 'Error';
    if (typeof res === 'string') {
      return { statusCode, message: res, error: fallbackError };
    }
    const { message, error } = res as { message?: string | string[]; error?: string };
    return { statusCode, message: message ?? exception.message, error: error ?? fallbackError };
  }
}
