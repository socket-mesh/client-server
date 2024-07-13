import cloneDeep from 'clone-deep';
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import { InvalidArgumentsError } from '@socket-mesh/errors';

const DEFAULT_EXPIRY = 86400;

export interface AuthTokenOptions extends jwt.SignOptions {
	rejectOnFailedDelivery?: boolean;
}

export interface AuthOptions {
	// The algorithm to use to sign and verify JWT tokens.
	authAlgorithm?: jwt.Algorithm,

	// The key which SocketMesh will use to encrypt/decrypt authTokens,
	// defaults to a 256 bits cryptographically random hex
	// string. The default JWT algorithm used is 'HS256'.
	// If you want to use RSA or ECDSA, you should provide an
	// authPrivateKey and authPublicKey instead of authKey.
	//
	// If using an RSA or ECDSA algorithm to sign the
	// authToken, you will need to provide an authPrivateKey
	// and authPublicKey in PEM format (string or Buffer).
	authKey?: jwt.Secret | { private: jwt.Secret, public: jwt.Secret }

	// The default expiry for auth tokens in seconds
	defaultExpiry?: number,

	verifyAlgorithms?: jwt.Algorithm[]
}

export interface AuthEngine extends AuthOptions {
	signToken(token: object, signOptions?: jwt.SignOptions): Promise<string>,

	verifyToken(signedToken: string, verifyOptions?: jwt.VerifyOptions): Promise<jwt.JwtPayload>
}

export function isAuthEngine(auth: AuthEngine | AuthOptions): auth is AuthEngine {
	return (typeof auth === 'object' && 'verifyToken' in auth && 'signToken' in auth);
}

function generateAuthKey(): string {
	return crypto.randomBytes(32).toString('hex');
}

export function defaultAuthEngine(options?: AuthOptions): AuthEngine {
	return Object.assign<AuthOptions, AuthEngine>(
		options,
		{
			signToken(token: object, signOptions?: jwt.SignOptions): Promise<string> {
				signOptions = Object.assign({}, signOptions || {});
		
				if (signOptions.algorithm != null) {
					delete signOptions.algorithm;
		
					throw new InvalidArgumentsError(
						'Cannot change auth token algorithm at runtime - It must be specified as a config option on launch'
					);
				}
		
				signOptions.mutatePayload = true;
		
				// We cannot have the exp claim on the token and the expiresIn option
				// set at the same time or else auth.signToken will throw an error.
				const expiresIn = signOptions.expiresIn || this.defaultExpiry || DEFAULT_EXPIRY;
		
				token = cloneDeep(token);
		
				if (token) {
					if (!('exp' in token) || token.exp == null) {
						signOptions.expiresIn = expiresIn;
					} else {
						delete signOptions.expiresIn;
					}
				} else {
					signOptions.expiresIn = expiresIn;
				}
		
				// Always use the default algorithm since it cannot be changed at runtime.
				if (this.authAlgorithm != null) {
					signOptions.algorithm = this.authAlgorithm;
				}

				let privateKey: jwt.Secret;

				if (typeof this.authKey === 'object' && 'private' in this.authKey) {
					privateKey = this.authKey.private;
				} else {
					if (!this.authKey == null) {
						this.authKey = generateAuthKey();
					}
		
					privateKey = this.authKey;
				}
		
				return new Promise<string>((resolve, reject) => {
					jwt.sign(token, privateKey, signOptions, (err, signedToken) => {
						if (err) {
							reject(err);
							return;
						}
						resolve(signedToken);
					});
				});
			},

			verifyToken(signedToken: string, verifyOptions?: jwt.VerifyOptions): Promise<jwt.JwtPayload> {
				const jwtOptions = Object.assign({}, verifyOptions || {});

				if (typeof signedToken === 'string' || signedToken == null) {
					let publicKey: jwt.Secret;

					if (typeof options.authKey === 'object' && 'public' in options.authKey) {
						publicKey = options.authKey.public;
					} else {
						if (!options.authKey == null) {
							options.authKey = generateAuthKey();
						}
			
						publicKey = options.authKey;
					}
							
					return new Promise((resolve, reject) => {
						const cb: jwt.VerifyCallback<jwt.JwtPayload> = (err, token) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(token);
						};

						jwt.verify(signedToken || '', publicKey, jwtOptions, cb); 
					});
				}
		
				return Promise.reject(
					new InvalidArgumentsError('Invalid token format - Token must be a string')
				);
			}
		}
	);
}