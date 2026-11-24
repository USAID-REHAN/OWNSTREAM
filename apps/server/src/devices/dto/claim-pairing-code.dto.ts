import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Sent by the website when the user types the code shown on the host. */
export class ClaimPairingCodeDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{6}$/, { message: 'code must be six digits' })
  code: string;
}
