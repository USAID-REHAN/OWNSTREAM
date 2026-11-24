import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostWith(response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return { getType: () => 'http', switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let response: { status: jest.Mock; json: jest.Mock };

  beforeEach(() => {
    response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
  });

  it('keeps the message of an HTTP error', () => {
    filter.catch(new NotFoundException('Profile not found'), hostWith(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 404, message: 'Profile not found', error: 'Not Found' });
  });

  it('passes validation messages through', () => {
    filter.catch(new BadRequestException(['displayName must be a string']), hostWith(response));

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['displayName must be a string'],
      error: 'Bad Request',
    });
  });

  it('hides the details of unexpected errors', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('connection string with password'), hostWith(response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });
});
