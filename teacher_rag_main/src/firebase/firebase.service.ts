import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase credentials not set — Google sign-in is disabled (email/password still works)');
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.logger.log('Firebase Admin SDK initialized');
    }
  }

  /**
   * Verifies a Firebase ID token sent from the client after Google Sign-In.
   * Returns the decoded token which contains uid, email, name, picture, etc.
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (admin.apps.length === 0) {
      throw new Error('Google sign-in is not configured on this server');
    }
    return admin.auth().verifyIdToken(idToken);
  }
}
