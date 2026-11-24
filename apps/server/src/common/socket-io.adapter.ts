import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/** Encrypted chat messages are small; this caps one socket message at 512 KB. */
export const MAX_SOCKET_MESSAGE_BYTES = 512 * 1024;

/** Socket.IO with the same CORS rule as the REST API: only the website may connect from a browser. */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.allowedOrigin, credentials: true },
      maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
    }) as Server;
  }
}
