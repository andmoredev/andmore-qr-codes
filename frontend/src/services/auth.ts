import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from '../config';

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
});

export interface UserInfo {
  email: string;
  sub: string;
  emailVerified: boolean;
}

export class AuthService {
  getCurrentUser(): CognitoUser | null {
    return userPool.getCurrentUser();
  }

  async getCurrentSession(): Promise<CognitoUserSession | null> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return null;

    return new Promise((resolve, reject) => {
      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err) { reject(err); return; }
        resolve(session && session.isValid() ? session : null);
      });
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: email, Pool: userPool });
      const auth = new AuthenticationDetails({ Username: email, Password: password });

      user.authenticateUser(auth, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(err),
        newPasswordRequired: () => reject(new Error('New password required. Please contact support.')),
      });
    });
  }

  signOut(): void {
    this.getCurrentUser()?.signOut();
  }

  async getIdToken(): Promise<string | null> {
    try {
      const session = await this.getCurrentSession();
      return session?.getIdToken().getJwtToken() ?? null;
    } catch {
      return null;
    }
  }

  async getUserInfo(): Promise<UserInfo | null> {
    try {
      const session = await this.getCurrentSession();
      if (!session) return null;
      const payload = session.getIdToken().payload;
      return {
        email: payload.email as string,
        sub: payload.sub as string,
        emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
      };
    } catch {
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session !== null && session.isValid();
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();
