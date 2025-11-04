export { AuthState, AuthStateChange } from './auth-state.js';

export interface AuthToken {
	[key: string]: any,
	aud?: string | string[],
	exp?: number,
	iat?: number,
	iss?: string,
	jti?: string,
	nbf?: number,
	sub?: string
}

export type SignedAuthToken = string;

export function extractAuthTokenData(signedAuthToken: SignedAuthToken): AuthToken | null | string {
	if (typeof signedAuthToken !== 'string') return null;

	const tokenParts = signedAuthToken.split('.');
	const encodedTokenData = tokenParts[1];

	if (encodedTokenData != null) {
		let tokenData = encodedTokenData;

		try {
			tokenData = Buffer.from(tokenData, 'base64').toString('utf8');
			return JSON.parse(tokenData);
		} catch (e) {
			return tokenData;
		}
	}

	return null;
}
