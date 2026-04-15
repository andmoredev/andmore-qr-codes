export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  cognito: {
    userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
    clientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
    userPoolUrl: import.meta.env.VITE_USER_POOL_URL ?? '',
    region: import.meta.env.VITE_AWS_REGION ?? 'us-east-1',
  },
} as const;
