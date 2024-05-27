import cloneDeep from 'clone-deep';
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import { InvalidArgumentsError } from '@socket-mesh/errors';

export interface AuthTokenOptions {
	rejectOnFailedDelivery?: boolean;
}

export interface AuthEngine {
	readonly rejectOnFailedDelivery: boolean;

	signatureKey: jwt.Secret;
	verificationKey: jwt.Secret;

	verifyToken(signedToken: string, options?: jwt.VerifyOptions): Promise<jwt.JwtPayload>;

	signToken(token: object, options?: jwt.SignOptions): Promise<string>;
}

export function isAuthEngine(auth: AuthEngine | AuthEngineOptions): auth is AuthEngine {
	return (typeof auth === 'object' && 'verifyToken' in auth && 'signToken' in auth);
}

export interface AuthEngineOptions {
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

	rejectOnFailedDelivery?: boolean,

	verifyAlgorithms?: jwt.Algorithm[]
}

export class DefaultAuthEngine implements AuthEngine {
	private readonly _signOptions: jwt.SignOptions;
	private readonly _verificationOptions: jwt.VerifyOptions;

	public readonly rejectOnFailedDelivery: boolean;
	public signatureKey: jwt.Secret;
	public verificationKey: jwt.Secret;

	constructor({ authAlgorithm, authKey, defaultExpiry, rejectOnFailedDelivery, verifyAlgorithms }: AuthEngineOptions = {}) {
		this.rejectOnFailedDelivery = !!rejectOnFailedDelivery;
		this._signOptions = {};
		this._verificationOptions = {};

		if (authAlgorithm != null) {
			this._signOptions.algorithm = authAlgorithm;
		}

		if (defaultExpiry) {
			this._signOptions.expiresIn = defaultExpiry;
		}

		if (verifyAlgorithms != null) {
			this._verificationOptions.algorithms = verifyAlgorithms;
		} else if (authAlgorithm != null) {
			this._verificationOptions.algorithms = [authAlgorithm];
		}

		if (typeof authKey === 'object' && 'private' in authKey) {
			this.signatureKey = authKey.private;
			this.verificationKey = authKey.public;
		} else {
			if (!authKey == null) {
				authKey = crypto.randomBytes(32).toString('hex');
			}

			this.signatureKey = authKey;
			this.verificationKey = authKey;
		}
	}

	verifyToken(signedToken: string, options?: jwt.VerifyOptions): Promise<jwt.JwtPayload> {
		const jwtOptions = Object.assign({}, options || {});

		if (typeof signedToken === 'string' || signedToken == null) {
			return new Promise((resolve, reject) => {
				const cb: jwt.VerifyCallback<jwt.JwtPayload> = (err, token) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(token);
				};
				
				jwt.verify(signedToken || '', this.verificationKey, jwtOptions, cb); 
			});
		}

		return Promise.reject(
			new InvalidArgumentsError('Invalid token format - Token must be a string')
		);
	}

	signToken(token: object, options?: jwt.SignOptions): Promise<string> {
		options = Object.assign({}, options || {});

		if (options.algorithm != null) {
			delete options.algorithm;

			throw new InvalidArgumentsError(
				'Cannot change auth token algorithm at runtime - It must be specified as a config option on launch'
			);
		}

		options.mutatePayload = true;

		// We cannot have the exp claim on the token and the expiresIn option
		// set at the same time or else auth.signToken will throw an error.
		const expiresIn = options.expiresIn || this._signOptions.expiresIn;

		token = cloneDeep(token);

		if (token) {
			if ('exp' in token && token.exp == null) {
				options.expiresIn = expiresIn;
			} else {
				delete options.expiresIn;
			}
		} else {
			options.expiresIn = expiresIn;
		}

		// Always use the default algorithm since it cannot be changed at runtime.
		if (this._signOptions.algorithm != null) {
			options.algorithm = this._signOptions.algorithm;
		}

		return new Promise<string>((resolve, reject) => {
			jwt.sign(token, this.signatureKey, options, (err, signedToken) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(signedToken);
			});
		});
	}
}