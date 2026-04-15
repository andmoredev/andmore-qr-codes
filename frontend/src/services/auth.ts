import {
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { config } from '../config';

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
});

export interface AuthTokens {
  idToken: string;
  accessToken: string;
}

export function signIn(email: string, password: string): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const auth = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(auth, {
      onSuccess(session) {
        resolve({
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
        });
      },
      onFailure(err) {
        reject(err);
      },
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}

export function getCurrentSession(): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) return reject(new Error('No user'));
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) return reject(err ?? new Error('No session'));
      resolve(session);
    });
  });
}

export async function getIdToken(): Promise<string> {
  const session = await getCurrentSession();
  return session.getIdToken().getJwtToken();
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await getCurrentSession();
    return session.isValid();
  } catch {
    return false;
  }
}

export async function getUserEmail(): Promise<string> {
  const session = await getCurrentSession();
  return session.getIdToken().payload.email as string;
}
