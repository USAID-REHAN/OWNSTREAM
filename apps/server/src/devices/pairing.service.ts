import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { DataSource, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/db-errors';
import { DeviceEntity, PairingCodeEntity } from '../database/entities';
import { DeviceTokenService } from './device-token.service';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';

/** How long a new code can be claimed on the website. */
export const PAIRING_CODE_TTL_MS = 10 * 60_000;
/** After the user claims a code, how long the host has to collect its device token. */
export const PAIRING_PICKUP_WINDOW_MS = 2 * 60_000;
/** The host polls the status route this often (30 per minute limit; section 9.3 of the plan). */
export const PAIRING_POLL_SECONDS = 6;
export const MAX_DEVICES_PER_USER = 10;
/** Used and expired codes are deleted this long after they expire. */
const CODE_RETENTION_MS = 60 * 60_000;
const CODE_ATTEMPTS = 5;

export interface PairingCodeCreated {
  code: string;
  /** Only the host gets this; it must send it back as X-Pairing-Secret when polling. */
  pairingSecret: string;
  expiresAt: Date;
  pollIntervalSeconds: number;
}

export type PairingStatus =
  | { status: 'pending'; expiresAt: Date }
  | { status: 'expired' }
  | { status: 'paired'; deviceId: string; deviceToken: string };

export interface PairingClaimed {
  status: 'claimed';
  hostName: string | null;
}

const SIX_DIGITS = /^\d{6}$/;

/**
 * F2 pairing (Implementation Plan section 10.2):
 * 1. the host asks for a six digit code, 2. the user claims it on the website,
 * 3. the host polls the status and collects its device token exactly once.
 */
@Injectable()
export class PairingService {
  constructor(
    @InjectRepository(PairingCodeEntity) private readonly codes: Repository<PairingCodeEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tokens: DeviceTokenService,
    private readonly audit: AuditService,
  ) {}

  async createCode(dto: CreatePairingCodeDto): Promise<PairingCodeCreated> {
    await this.codes.delete({ expiresAt: LessThan(new Date(Date.now() - CODE_RETENTION_MS)) });

    const pairingSecret = this.tokens.generate();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      try {
        await this.codes.insert({
          code,
          hostName: dto.hostName,
          hostOs: dto.hostOs ?? null,
          secretHash: this.tokens.hash(pairingSecret),
          expiresAt,
        });
        return { code, pairingSecret, expiresAt, pollIntervalSeconds: PAIRING_POLL_SECONDS };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ServiceUnavailableException('Could not create a pairing code, please try again');
  }

  /** Called by the host. Wrong code and wrong secret give the same 404. */
  async status(code: string, pairingSecret: string | undefined, ip: string | null): Promise<PairingStatus> {
    if (!SIX_DIGITS.test(code) || !pairingSecret) throw this.codeNotFound();

    const row = await this.codes.findOneBy({ code });
    if (!row || !this.tokens.matches(pairingSecret, row.secretHash)) throw this.codeNotFound();
    if (row.deviceId) throw new GoneException('This pairing code was already used');
    if (row.expiresAt <= new Date()) return { status: 'expired' };
    if (!row.claimedByUser) return { status: 'pending', expiresAt: row.expiresAt };

    const paired = await this.completePairing(row.id);
    if (paired.status === 'paired') {
      await this.audit.log(row.claimedByUser, 'device.paired', 'device', paired.deviceId, ip);
    }
    return paired;
  }

  /** Called by the website when the user types the code. */
  async claim(userId: string, code: string, ip: string | null): Promise<PairingClaimed> {
    const deviceCount = await this.devices.count({ where: { userId } });
    if (deviceCount >= MAX_DEVICES_PER_USER) {
      throw new BadRequestException(`You can pair at most ${MAX_DEVICES_PER_USER} devices`);
    }

    const now = new Date();
    const result = await this.codes.update(
      { code, claimedByUser: IsNull(), expiresAt: MoreThan(now) },
      { claimedByUser: userId, expiresAt: new Date(now.getTime() + PAIRING_PICKUP_WINDOW_MS) },
    );
    if (!result.affected) throw this.codeNotFound();

    const row = await this.codes.findOneBy({ code });
    await this.audit.log(userId, 'device.pair_claimed', 'pairing_code', row?.id ?? null, ip);
    return { status: 'claimed', hostName: row?.hostName ?? null };
  }

  /**
   * Creates the device and hands out its token. The row lock makes sure only one poll can
   * collect the token, even if two arrive at the same moment.
   */
  private completePairing(codeId: string): Promise<PairingStatus> {
    return this.dataSource.transaction(async (manager) => {
      const code = await manager.findOne(PairingCodeEntity, {
        where: { id: codeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!code || code.deviceId || !code.claimedByUser) {
        throw new GoneException('This pairing code was already used');
      }
      if (code.expiresAt <= new Date()) return { status: 'expired' as const };

      const deviceToken = this.tokens.generate();
      const device = await manager.save(
        manager.create(DeviceEntity, {
          userId: code.claimedByUser,
          name: code.hostName,
          os: code.hostOs,
          role: 'host',
          tokenHash: this.tokens.hash(deviceToken),
        }),
      );
      await manager.update(PairingCodeEntity, { id: code.id }, { deviceId: device.id });
      return { status: 'paired' as const, deviceId: device.id, deviceToken };
    });
  }

  private codeNotFound(): NotFoundException {
    return new NotFoundException('Pairing code not found or expired');
  }
}
