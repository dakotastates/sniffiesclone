import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationModule } from './location/location.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, LocationModule],
})
export class AppModule {}
