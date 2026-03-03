import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '@prisma/client'

function roundTo(num: number, decimals: number) {
  const p = 10 ** decimals
  return Math.round(num * p) / p
}

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMyLocation(userId: string, lat: number, lng: number) {
    // Privacy: ~1km precision (2 decimals). You can tweak later.
    const latApprox = roundTo(lat, 2)
    const lngApprox = roundTo(lng, 2)

    // Use raw SQL because `point` is PostGIS geography (Unsupported in Prisma)
    await this.prisma.$executeRaw`
      INSERT INTO "UserLocation" ("userId", "latApprox", "lngApprox", "point")
      VALUES (
        ${userId},
        ${latApprox},
        ${lngApprox},
        ST_SetSRID(ST_MakePoint(${lngApprox}, ${latApprox}), 4326)::geography
      )
      ON CONFLICT ("userId") DO UPDATE
      SET
        "latApprox" = EXCLUDED."latApprox",
        "lngApprox" = EXCLUDED."lngApprox",
        "point" = EXCLUDED."point",
        "updatedAt" = NOW();
    `

    return { ok: true, latApprox, lngApprox }
  }

  async nearby(lat: number, lng: number, radiusKm: number, excludeUserId?: string) {
    const latApprox = roundTo(lat, 2)
    const lngApprox = roundTo(lng, 2)
    const radiusMeters = Math.max(0.1, radiusKm) * 1000

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        displayName: string
        avatarUrl: string | null
        bio: string | null
        latApprox: number
        lngApprox: number
        updatedAt: Date
      }>
    >(Prisma.sql`
      SELECT
        u.id,
        u."displayName",
        u."avatarUrl",
        u.bio,
        ul."latApprox",
        ul."lngApprox",
        ul."updatedAt"
      FROM "UserLocation" ul
      JOIN "User" u ON u.id = ul."userId"
      WHERE
        ST_DWithin(
          ul."point",
          ST_SetSRID(ST_MakePoint(${lngApprox}, ${latApprox}), 4326)::geography,
          ${radiusMeters}
        )
        ${excludeUserId ? Prisma.sql`AND u.id <> ${excludeUserId}` : Prisma.empty}
      ORDER BY ul."updatedAt" DESC
      LIMIT 500;
    `)

    return rows
  }
}