export { AuthState, AuthStateChange } from "./auth-state.js";

export interface AuthToken {
	exp?: number,
	iss?: string,
	sub?: string,
	aud?: string | string[];
	nbf?: number,
	iat?: number,
	jti?: string,
	[key: string]: any
}

export type SignedAuthToken = string;

export function extractAuthTokenData(signedAuthToken: SignedAuthToken): AuthToken | string | null {
	if (typeof signedAuthToken !== 'string') return null;

	let tokenParts = signedAuthToken.split('.');
	let encodedTokenData = tokenParts[1];

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