import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Server environment (Implementation Plan v3, section 6). Checked once at start up. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsUrl({ require_tld: false })
  PUBLIC_WEB_URL: string;

  @IsString()
  @IsNotEmpty()
  NEON_DATABASE_URL: string;

  /** true for Neon, false for the local Docker database. Missing means true. */
  @Transform(({ obj }) => (obj.DB_SSL === undefined ? true : String(obj.DB_SSL).toLowerCase() === 'true'))
  @IsBoolean()
  DB_SSL: boolean = true;

  @IsUrl({ require_tld: false })
  SUPABASE_URL: string;

  @IsOptional()
  @IsString()
  SUPABASE_ANON_KEY?: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsOptional()
  @IsString()
  RAWG_API_KEY?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_SECRET?: string;

  /** Secret mixed into every device token hash. Required: hosts cannot pair without it. */
  @IsString()
  @MinLength(16)
  DEVICE_TOKEN_PEPPER: string;

  @IsOptional()
  @IsString()
  STUN_URLS?: string;

  @IsOptional()
  @IsString()
  TURN_URL?: string;

  @IsOptional()
  @IsString()
  TURN_USERNAME?: string;

  @IsOptional()
  @IsString()
  TURN_CREDENTIAL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return env;
}
