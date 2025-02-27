import assert from 'node:assert';
import { beforeEach, afterEach, describe, it, mock } from "node:test";
import { ClientSocket, ClientSocketOptions, LocalStorageAuthEngine, OfflinePlugin } from '../src/index.js';
import { AuthStateChangeEvent, CloseEvent, DisconnectEvent, SocketStatus, RequestHandlerArgs, wait } from '@socket-mesh/core';
import { Server, ServerRequestHandlerArgs, listen } from '@socket-mesh/server';
import localStorage from '@socket-mesh/local-storage';
import jwt from "jsonwebtoken";

// Add to the global scope like in browser.
global.localStorage = localStorage;

const PORT_NUMBER = 8009;
const TOKEN_EXPIRY_IN_SECONDS = 60 * 60 * 24 * 366 * 5000;
const authTokenName = 'socketmesh.authToken';

const validSignedAuthTokenBob = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImJvYiIsImV4cCI6MzE2Mzc1ODk3ODIxNTQ4NywiaWF0IjoxNTAyNzQ3NzQ2fQ.GLf_jqi_qUSCRahxe2D2I9kD8iVIs0d4xTbiZMRiQq4';
const validSignedAuthTokenKate = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImthdGUiLCJleHAiOjMxNjM3NTg5NzgyMTU0ODcsImlhdCI6MTUwMjc0Nzc5NX0.Yfb63XvDt9Wk0wHSDJ3t7Qb1F0oUVUaM5_JKxIE2kyw';
const invalidSignedAuthToken = 'fakebGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakec2VybmFtZSI6ImJvYiIsImlhdCI6MTUwMjYyNTIxMywiZXhwIjoxNTAyNzExNjEzfQ.fakemYcOOjM9bzmS4UYRvlWSk_lm3WGHvclmFjLbyOk';
const SERVER_AUTH_KEY = 'testkey';

interface LoginRequest {
	username: string
}

type MyChannels = {
	foo: string | { abc: number },
	bar: string | { def: number },
	priv: string,
	priv2: string
}

type ServerIncomingMap = {
	login: (req: LoginRequest) => void,
	performTask: (num: number) => void,
	setAuthKey: (secret: jwt.Secret) => void,
}

const allowedUsers: { [name: string]: true } = {
	bob: true,
	kate: true,
	alice: true
};

let client: ClientSocket<ServerIncomingMap, MyChannels>;
let server: Server<ServerIncomingMap, MyChannels>;

let performTaskTriggered: boolean;

async function loginHandler({ transport, options }: RequestHandlerArgs<LoginRequest>): Promise<void> {
	if (!allowedUsers[options.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	const authToken = {
		username: options.username,
		exp: Math.round(Date.now() / 1000) + TOKEN_EXPIRY_IN_SECONDS
	};

	transport.setAuthorization(authToken);
}

async function performTaskHandler({ options }: RequestHandlerArgs<number>): Promise<void> {
	performTaskTriggered = true;
	await wait(options);
}

async function setAuthKeyHandler({ socket, options: secret }: ServerRequestHandlerArgs<jwt.Secret>): Promise<void> {
	socket.server!.auth.authKey = secret;
}

const clientOptions: ClientSocketOptions<ServerIncomingMap> = {
	authEngine: { authTokenName },
	address: `ws://127.0.0.1:${PORT_NUMBER}`,
	ackTimeoutMs: 200
}

describe('Integration tests', function () {
	beforeEach(async function () {
		server = listen<ServerIncomingMap, MyChannels>(
			PORT_NUMBER,
			{
				authEngine: { authKey: SERVER_AUTH_KEY },
				ackTimeoutMs: 200,
				handlers: {
					login: loginHandler,
					performTask: performTaskHandler,
					setAuthKey: setAuthKeyHandler
				}
			}
		);

		performTaskTriggered = false;

		await server.listen('ready').once(100);
	});

	afterEach(async function () {
		const cleanupTasks: Promise<DisconnectEvent | void>[] = [];

		global.localStorage.removeItem(authTokenName);
		
		if (client) {
			if (client.status !== 'closed') {
				cleanupTasks.push(
					Promise.race([
						client.listen('disconnect').once(),
						client.listen('connectAbort').once()
					])
				);
			}

			client.disconnect();
		}

		cleanupTasks.push(
			(async () => {
				server.httpServer.close();
				await server.close();
			})()
		);

		await Promise.all(cleanupTasks);
	});

	describe('Creation', function () {
		it('Should automatically connect socket on creation by default', async function () {
			client = new ClientSocket(clientOptions);

			assert.strictEqual<SocketStatus>(client.status, 'connecting');
		});

		it('Should not automatically connect socket if autoConnect is set to false', async function () {
			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>(
					{
						autoConnect: false
					},
					clientOptions
				)
			);

			assert.strictEqual<SocketStatus>(client.status, 'closed');
		});
	});

	describe('Errors', function () {
		it('Should be able to emit the error event locally on the socket', (context, done) => {
			client = new ClientSocket(clientOptions);

			(async () => {
				for await (let { error } of client.listen('error')) {
					try {
						assert.notEqual(error, null);
						assert.strictEqual(error.name, 'CustomError');
					} catch (err) {
						throw err;
					} finally {
						done();
					}
				}
			})();

			(async () => {
				for await (let status of client.listen('connect')) {
					let error = new Error('Custom error');
					error.name = 'CustomError';
					client.emit('error', {error});
				}
			})();
		});
	});

	describe('Authentication', function () {
		it('Should not send back error if JWT is not provided in handshake', async function () {
			client = new ClientSocket(clientOptions);

			const event = await client.listen('connect').once(100);

			assert.strictEqual(event.authError, undefined);
		});

		it('Should be authenticated on connect if previous JWT token is present', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);

			const event = await client.listen('connect').once(100);

			assert.strictEqual(client.signedAuthToken, validSignedAuthTokenBob);
			assert.strictEqual(client.authToken.username, 'bob');
			assert.strictEqual(event.authError, undefined);
		});

		it('Should send back error if JWT is invalid during handshake', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);

			let event = await client.listen('connect').once(100);
			assert.notEqual(event, null);
			assert.strictEqual(event.isAuthenticated, true);
			assert.strictEqual(event.authError, undefined);

			assert.notEqual(client.signedAuthToken, null);
			assert.notEqual(client.authToken, null);

			// Change the setAuthKey to invalidate the current token.
			await client.invoke('setAuthKey', 'differentAuthKey');

			client.disconnect();
			client.connect();

			event = await client.listen('connect').once(100);

			assert.strictEqual(event.isAuthenticated, false);
			assert.notEqual(event.authError, null);
			assert.strictEqual(event.authError!.name, 'AuthTokenInvalidError');

			// When authentication fails, the auth token properties on the client
			// socket should be set to null; that way it's not going to keep
			// throwing the same error every time the socket tries to connect.
			assert.strictEqual(client.signedAuthToken, null);
			assert.strictEqual(client.authToken, null);

			// Set authKey back to what it was.
			await client.invoke('setAuthKey', SERVER_AUTH_KEY);
		});

		it('Should allow switching between users', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);
			let authenticateTriggered = false;
			let authStateChangeTriggered = false;

			await client.listen('connect').once(100);

			assert.strictEqual(client.signedAuthToken, validSignedAuthTokenBob);
			assert.strictEqual(client.authToken.username, 'bob');

			(async () => {
				await client.listen('authenticate').once();
				authenticateTriggered = true;
				assert.notEqual(client.authToken, null);
				assert.strictEqual(client.authToken.username, 'alice');
			})();

			(async () => {
				await client.listen('authStateChange').once();
				authStateChangeTriggered = true;
			})();

			await client.invoke('login', { username: 'alice' });

			await wait(100);
			assert.strictEqual(authenticateTriggered, true);
			assert.strictEqual(authStateChangeTriggered, true);
		});

		it('If token engine signing is synchronous, authentication can be captured using the authenticate event', async function () {
//				authSignAsync: false
			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			await Promise.all([
				client.invoke('login', { username: 'bob' }),
				client.listen('authenticate').once(100)
			]);

			//assert.strictEqual(client.authState, AuthState.AUTHENTICATED);
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken.username, 'bob');
		});

		it('If token engine signing is asynchronous, authentication can be captured using the authenticate event', async function () {
			// authSignAsync: true
			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			await Promise.all([
				client.invoke('login', {username: 'bob'}),
				client.listen('authenticate').once(100)
			]);

			//assert.strictEqual(client.authState, AuthState.AUTHENTICATED);
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken.username, 'bob');
		});

		it('If token verification is synchronous, authentication can be captured using the authenticate event', async function () {
			client = new ClientSocket(clientOptions);
			// authVerifyAsync: false
	
			await client.listen('connect').once();
	
			await Promise.all([
				(async () => {
					await Promise.all([
						client.invoke('login', {username: 'bob'}),
						client.listen('authenticate').once()
					]);
					client.disconnect();
				})(),
				(async () => {
					await client.listen('authenticate').once();
					await client.listen('disconnect').once();
					
					client.connect();
					
					const event = await client.listen('connect').once();
	
					assert.strictEqual(event.isAuthenticated, true);
					assert.notEqual(client.authToken, null);
					assert.strictEqual(client.authToken.username, 'bob');
				})()
			]);
		});

		it('Should start out in pending authState and switch to unauthenticated if no token exists', async function () {
			client = new ClientSocket(clientOptions);

			//assert.strictEqual(client.authState, AuthState.UNAUTHENTICATED);
			assert.equal(client.signedAuthToken, null);

			(async () => {
				await client.listen('authStateChange').once();

				throw new Error('authState should not change after connecting without a token');
			})();

			await wait(1000);
		});

		it('Should deal with auth engine errors related to saveToken function', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			const authEngine = new LocalStorageAuthEngine();

			mock.method(
				authEngine,
				'saveToken', 
				() => {
					let err = new Error('Failed to save token');
					err.name = 'FailedToSaveTokenError';
					return Promise.reject(err);
				}
			);

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>({}, clientOptions, { authEngine })
			);

			let caughtError: Error;

			(async () => {
				for await (let {error} of client.listen('error')) {
					caughtError = error;
				}
			})();

			await client.listen('connect').once();
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken.username, 'bob');

			await client.authenticate(validSignedAuthTokenKate);

			// The error here comes from the client auth engine and does not prevent the
			// authentication from taking place, it only prevents the token from being
			// stored correctly on the client.
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken.username, 'kate');
			assert.notEqual(caughtError!, null);
			assert.strictEqual(caughtError!.name, 'FailedToSaveTokenError');
		});

		it('Should gracefully handle authenticate abortion due to disconnection', async function () {
			client = new ClientSocket(clientOptions);
			await client.listen('connect').once();

			const authenticatePromise = client.authenticate(validSignedAuthTokenBob);
			client.disconnect();

			try {
				await authenticatePromise;
			} catch (err) {
				assert.notEqual(err, null);
				assert.strictEqual(err.name, 'BadConnectionError');
				assert.equal(client.signedAuthToken, null);
			}
		});

		it('Should go through the correct sequence of authentication state changes when dealing with disconnections; part 1', async function () {
			client = new ClientSocket(clientOptions);
	
			const expectedAuthStateChanges = [
				'false->true'
			];
			const authStateChanges: string[] = [];
	
			(async () => {
				for await (let state of client.listen('authStateChange')) {
					authStateChanges.push(`${state.wasAuthenticated}->${state.isAuthenticated}`);
				}
			})();
	
			assert.equal(client.signedAuthToken, null);
	
			await client.listen('connect').once();
	
			assert.equal(client.signedAuthToken, null);
	
			(async () => {
				await Promise.all([
					client.invoke('login', {username: 'bob'}),
					client.listen('authenticate').once()
				]);
				client.disconnect();
			})();
	
			assert.equal(client.signedAuthToken, null);

			const { signedAuthToken, authToken } = await client.listen('authenticate').once();

			assert.notEqual(signedAuthToken, null);
			assert.notEqual(authToken, null);
	
			assert.notEqual(client.signedAuthToken, null);

			await client.listen('disconnect').once();
	
			// In case of disconnection, the socket maintains the last known auth state.
			assert.notEqual(client.signedAuthToken, null);

			await client.authenticate(signedAuthToken);

			assert.notEqual(client.signedAuthToken, null);			
			assert.strictEqual(JSON.stringify(authStateChanges), JSON.stringify(expectedAuthStateChanges));
			client.closeListeners('authStateChange');
		});

		it('Should go through the correct sequence of authentication state changes when dealing with disconnections; part 2', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);
	
			const expectedAuthStateChanges = [
				'false->true',
				'true->false',
				'false->true',
				'true->false'
			];
			const authStateChanges: string[] = [];

			(async () => {
				for await (let status of client.listen('authStateChange')) {
					authStateChanges.push(`${status.wasAuthenticated}->${status.isAuthenticated}`);
				}
			})();

			assert.equal(client.signedAuthToken, null);

			await client.listen('connect').once();

			assert.notEqual(client.signedAuthToken, null);

			await client.deauthenticate();
			assert.equal(client.signedAuthToken, null);

			let authenticatePromise = client.authenticate(validSignedAuthTokenBob);
			assert.equal(client.signedAuthToken, null);

			await authenticatePromise;

			assert.notEqual(client.signedAuthToken, null);

			client.disconnect();

			assert.notEqual(client.signedAuthToken, null);
			await client.deauthenticate();
			assert.equal(client.signedAuthToken, null);

			assert.strictEqual(JSON.stringify(authStateChanges), JSON.stringify(expectedAuthStateChanges));
		});

		it('Should go through the correct sequence of authentication state changes when dealing with disconnections; part 3', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);

			const expectedAuthStateChanges = [
				'false->true',
				'true->false'
			];
			const authStateChanges: string[] = [];

			(async () => {
				for await (let status of client.listen('authStateChange')) {
					authStateChanges.push(`${status.wasAuthenticated}->${status.isAuthenticated}`);
				}
			})();

			assert.equal(client.signedAuthToken, null);

			await client.listen('connect').once();

			assert.notEqual(client.signedAuthToken, null);
			const authenticatePromise = client.authenticate(invalidSignedAuthToken);
			assert.notEqual(client.signedAuthToken, null);

			try {
				await authenticatePromise;
			} catch (err) {
				assert.notEqual(err, null);
				assert.strictEqual(err.name, 'AuthTokenInvalidError');
				assert.equal(client.signedAuthToken, null);
				assert.strictEqual(JSON.stringify(authStateChanges), JSON.stringify(expectedAuthStateChanges));
			}
		});

		it('Should go through the correct sequence of authentication state changes when authenticating as a user while already authenticated as another user', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(clientOptions);

			const expectedAuthStateChanges = [
				'false->true', 'true->true'
			];
			const authStateChanges: string[] = [];

			(async () => {
				for await (let status of client.listen('authStateChange')) {
					authStateChanges.push(`${status.wasAuthenticated}->${status.isAuthenticated}`);
				}
			})();

			const expectedAuthTokenChanges = [
				validSignedAuthTokenBob,
				validSignedAuthTokenKate
			];
			const authTokenChanges: string[] = [];

			(async () => {
				for await (let event of client.listen('authenticate')) {
					authTokenChanges.push(client.signedAuthToken);
				}
			})();

			(async () => {
				for await (let event of client.listen('deauthenticate')) {
					authTokenChanges.push(client.signedAuthToken);
				}
			})();

			assert.equal(client.signedAuthToken, null);

			await client.listen('connect').once();

			assert.notEqual(client.signedAuthToken, null);
			assert.strictEqual(client.authToken.username, 'bob');
			const authenticatePromise = client.authenticate(validSignedAuthTokenKate);

			assert.notEqual(client.signedAuthToken, null);

			await authenticatePromise;

			assert.notEqual(client.signedAuthToken, null);
			assert.strictEqual(client.authToken.username, 'kate');
			assert.strictEqual(JSON.stringify(authStateChanges), JSON.stringify(expectedAuthStateChanges));
			assert.strictEqual(JSON.stringify(authTokenChanges), JSON.stringify(expectedAuthTokenChanges));
		});

		it('Should wait for socket to be authenticated before subscribing to waitForAuth channel', async function () {
			client = new ClientSocket(clientOptions);

			let privateChannel = client.channels.subscribe('priv', { waitForAuth: true });
			assert.strictEqual(privateChannel.state, 'pending');

			await client.listen('connect').once(100);
			assert.strictEqual(privateChannel.state, 'pending');

			let isAuthenticated = false;

			(async () => {
				await client.invoke('login', {username: 'bob'});

				isAuthenticated = !!client.signedAuthToken;
			})();

			await client.channels.listen('subscribe').once(100);
			assert.strictEqual(privateChannel.state, 'subscribed');

			client.disconnect();
			assert.strictEqual(privateChannel.state, 'pending');

			client.authenticate(validSignedAuthTokenBob);
			await client.channels.listen('subscribe').once(100);
			assert.strictEqual(privateChannel.state, 'subscribed');

			assert.strictEqual(isAuthenticated, true);
		});

		it('Subscriptions (including those with waitForAuth option) should have priority over the authenticate action', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>(
					{},
					clientOptions,
					{
						plugins: [new OfflinePlugin()]
					}
				)
			);

			const expectedAuthStateChanges = [
				'false->true',
				'true->false'
			];
			let initialSignedAuthToken: string | null;
			const authStateChanges: string[] = [];

			(async () => {
				for await (let status of client.listen('authStateChange')) {
					authStateChanges.push(`${status.wasAuthenticated}->${status.isAuthenticated}`);
				}
			})();

			(async () => {
				let error: Error | null = null;
				try {
					await client.authenticate(invalidSignedAuthToken);
				} catch (err) {
					error = err;
				}
				assert.notEqual(error, null);
				assert.strictEqual(error!.name, 'AuthTokenInvalidError');
			})();

			const privateChannel = client.channels.subscribe('priv', { waitForAuth: true });
			assert.strictEqual(privateChannel.state, 'pending');

			(async () => {
				const event = await client.listen('connect').once();
				initialSignedAuthToken = client.signedAuthToken;
				assert.strictEqual(event.isAuthenticated, true);
				assert.strictEqual(privateChannel.state, 'pending');

				await Promise.race([
					(async () => {
						const fail = await privateChannel.listen('subscribeFail').once();
						// This shouldn't happen because the subscription should be
						// processed before the authenticate() call with the invalid token fails.
						throw new Error('Failed to subscribe to channel: ' + fail.error.message);
					})(),
					(async () => {
						await privateChannel.listen('subscribe').once();
						assert.strictEqual(privateChannel.state, 'subscribed');
					})()
				]);
			})();

			(async () => {
				// The subscription already went through so it should still be subscribed.
				const { signedAuthToken, authToken } = await client.listen('deauthenticate').once();
				// The subscription already went through so it should still be subscribed.
				assert.strictEqual(privateChannel.state, 'subscribed');
				assert.strictEqual(!!client.signedAuthToken, false);
				assert.strictEqual(client.authToken, null);

				assert.notEqual(authToken, null);
				assert.strictEqual(authToken!.username, 'bob');
				assert.strictEqual(signedAuthToken, initialSignedAuthToken!);

				const privateChannel2 = client.channels.subscribe('priv2', { waitForAuth: true });

				await privateChannel2.listen('subscribe').once();

				// This line should not execute.
				throw new Error('Should not subscribe because the socket is not authenticated');
			})();

			await wait(1000);
			client.closeListeners('authStateChange');
			assert.strictEqual(JSON.stringify(authStateChanges), JSON.stringify(expectedAuthStateChanges));
		});

		it('Should trigger the close event if the socket disconnects in the middle of the handshake phase', async function () {
			client = new ClientSocket(clientOptions);
			let aborted = false;
			let diconnected = false;
			let closed = false;

			(async () => {
				await client.listen('connectAbort').once();
				aborted = true;
			})();

			(async () => {
				await client.listen('disconnect').once();
				diconnected = true;
			})();

			(async () => {
				await client.listen('close').once();
				closed = true;
			})();

			client.disconnect();

			await wait(0);

			assert.strictEqual(aborted, true);
			assert.strictEqual(diconnected, false);
			assert.strictEqual(closed, true);
		});

		it('Should trigger the close event if the socket disconnects after the handshake phase', async function () {
			client = new ClientSocket(clientOptions);
			let aborted = false;
			let diconnected = false;
			let closed = false;

			(async () => {
				await client.listen('connectAbort').once();
				aborted = true;
			})();

			(async () => {
				await client.listen('disconnect').once();
				diconnected = true;
			})();

			(async () => {
				await client.listen('close').once();
				closed = true;
			})();

			(async () => {
				for await (let event of client.listen('connect')) {
					client.disconnect();
				}
			})();

			await wait(50);

			assert.strictEqual(aborted, false);
			assert.strictEqual(diconnected, true);
			assert.strictEqual(closed, true);
		});
	});

	describe('Transmitting remote events', function () {
		it('Should not throw error on socket if ackTimeout elapses before response to event is sent back', async function () {
			client = new ClientSocket(clientOptions);

			let caughtError: Error | null = null;
			let clientError: Error | null = null;

			(async () => {
				for await (let {error} of client.listen('error')) {
					clientError = error;
				}
			})();

			let responseError: Error | null = null;

			for await (let event of client.listen('connect')) {
				try {
					await client.invoke('performTask', 1000);
				} catch (err) {
					responseError = err;
				}
				await wait(250);
				try {
					client.disconnect();
				} catch (err) {
					caughtError = err;
				}
				break;
			}

			assert.notEqual(responseError, null);
			assert.strictEqual(clientError, null);
			assert.strictEqual(caughtError, null);
		});
	});

	describe('Pub/sub', function () {
		let publisherClient: ClientSocket<ServerIncomingMap, MyChannels>;
		let lastServerMessage: string | null = null;

		beforeEach(async function () {
			publisherClient = new ClientSocket(clientOptions);

//			server.removePlugin(PluginType.MIDDLEWARE_INBOUND);
//			server.setPlugin(PluginType.MIDDLEWARE_INBOUND, async (pluginStream) => {
//				for await (let action of pluginStream) {
//					if (action.type === 'publishIn') {
//						lastServerMessage = (action as ActionPublishIn).data;
//					}
//					action.allow();
//				}
//			});
		});

		afterEach(async function () {
			publisherClient.disconnect();
		});

		it('Should receive transmitted publish messages if subscribed to channel', async function () {
			client = new ClientSocket(clientOptions);

			const channel = client.channels.subscribe('foo');
			await channel.listen('subscribe').once();

			(async () => {
				await wait(10);
				publisherClient.channels.transmitPublish('foo', 'hello');
				await wait(20);
				publisherClient.channels.transmitPublish('foo', 'world');
				publisherClient.channels.transmitPublish('foo', { abc: 123 });
				await wait(10);
				channel.close();
			})();

			const receivedMessages: (string | { abc: number })[] = [];

			for await (let message of channel) {
				receivedMessages.push(message);
			}

			assert.strictEqual(receivedMessages.length, 3);
			assert.strictEqual(receivedMessages[0], 'hello');
			assert.strictEqual(receivedMessages[1], 'world');
			assert.strictEqual(JSON.stringify(receivedMessages[2]), JSON.stringify({abc: 123}));
		});

		it('Should receive invoked publish messages if subscribed to channel', async function () {
			client = new ClientSocket(clientOptions);

			const channel = client.channels.subscribe('bar');
			await channel.listen('subscribe').once();

			(async () => {
				await wait(10);
				await publisherClient.channels.transmitPublish('bar', 'hi');
				// assert.strictEqual(lastServerMessage, 'hi');
				await wait(20);
				await publisherClient.channels.transmitPublish('bar', 'world');
				// assert.strictEqual(lastServerMessage, 'world');
				await publisherClient.channels.transmitPublish('bar', { def: 123 });
				// assert.strictEqual(JSON.stringify(clientReceivedMessages[2]), JSON.stringify({def: 123}));
				await wait(10);
				channel.close();
			})();

			let clientReceivedMessages: (string | { def: number })[] = [];

			for await (let message of channel) {
				clientReceivedMessages.push(message);
			}

			assert.strictEqual(clientReceivedMessages.length, 3);
			assert.strictEqual(clientReceivedMessages[0], 'hi');
			assert.strictEqual(clientReceivedMessages[1], 'world');
			assert.strictEqual(JSON.stringify(clientReceivedMessages[2]), JSON.stringify({ def: 123 }));
		});
	});

	describe('Reconnecting socket', function () {
		it('Should disconnect socket with code 1000 and reconnect', async function () {
			client = new ClientSocket(clientOptions);

			await client.listen('connect').once();

			let disconnectCode;
			let disconnectReason;

			(async () => {
				for await (let event of client.listen('disconnect')) {
					disconnectCode = event.code;
					disconnectReason = event.reason;
				}
			})();

			client.reconnect();
			await client.listen('connect').once();

			assert.strictEqual(disconnectCode, 1000);
			assert.strictEqual(disconnectReason, undefined);
		});

		it('Should disconnect socket with custom code and data when socket.reconnect() is called with arguments', async function () {
			client = new ClientSocket(clientOptions);

			await client.listen('connect').once();

			let disconnectCode;
			let disconnectReason;

			(async () => {
				let event = await client.listen('disconnect').once();
				disconnectCode = event.code;
				disconnectReason = event.reason;
			})();

			client.reconnect(1000, 'About to reconnect');
			await client.listen('connect').once();

			assert.strictEqual(disconnectCode, 1000);
			assert.strictEqual(disconnectReason, 'About to reconnect');
		});
	});

  describe('Connecting an already connected socket', function () {
    it('Should not disconnect socket if no options are provided', async function () {
      client = new ClientSocket(clientOptions);

      await client.listen('connect').once();

      let disconnectCode: number;
      let disconnectReason: string | undefined;

      (async () => {
        for await (let event of client.listen('disconnect')) {
          disconnectCode = event.code;
          disconnectReason = event.reason;
        }
      })();

      client.connect();

      assert.equal(disconnectCode!, null);
      assert.equal(disconnectReason, null);
    });

    it('Should disconnect socket with code 1000 and connect again if new options are provided', async function () {
      client = new ClientSocket(clientOptions);

      await client.listen('connect').once();

      let disconnectCode: number;
      let disconnectReason: string | undefined;

      (async () => {
        for await (let event of client.listen('disconnect')) {
          disconnectCode = event.code;
          disconnectReason = event.reason;
        }
      })();

      client.connect(clientOptions);
      await client.listen('connect').once();

      assert.equal(disconnectCode!, 1000);
      assert.equal(disconnectReason, 'Socket was disconnected by the client to initiate a new connection');
    });
  });

	describe('Events', function () {
		it('Should trigger unsubscribe event on channel before disconnect event', async function () {
			client = new ClientSocket(clientOptions);
			let hasUnsubscribed = false;

			let fooChannel = client.channels.subscribe('foo');

			(async () => {
				for await (let event of fooChannel.listen('subscribe')) {
					await wait(100);
					client.disconnect();
				}
			})();

			(async () => {
				for await (let event of fooChannel.listen('unsubscribe')) {
					hasUnsubscribed = true;
				}
			})();

			await client.listen('disconnect').once();
			assert.strictEqual(hasUnsubscribed, true);
		});

		it('Should not invoke subscribeFail event if connection is aborted', async function () {
			client = new ClientSocket(clientOptions);
			let hasSubscribeFailed = false;
			let gotBadConnectionError = false;
			let wasConnected = false;

			(async () => {
				for await (let event of client.listen('connect')) {
					wasConnected = true;
					(async () => {
						try {
							await client.invoke('performTask', 123);
						} catch (err) {
							if (err.name === 'BadConnectionError') {
								gotBadConnectionError = true;
							}
						}
					})();

					let fooChannel = client.channels.subscribe('foo');
					(async () => {
						for await (let event of fooChannel.listen('subscribeFail')) {
							hasSubscribeFailed = true;
						}
					})();

					(async () => {
						await wait(0);
						client.disconnect();
					})();
				}
			})();

			await client.listen('close').once();
			await wait(100);
			assert.strictEqual(wasConnected, true);
			assert.strictEqual(gotBadConnectionError, true);
			assert.strictEqual(hasSubscribeFailed, false);
		});

		it('Should resolve invoke Promise with BadConnectionError before triggering the disconnect event', async function () {
			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>(
					{},
					clientOptions,
					{
						plugins: [new OfflinePlugin()],
						ackTimeoutMs: 2000
					}
				)
			);

			const messageList: any[] = [];
			let clientStatus = client.status;

			(async () => {
				for await (let event of client.listen('disconnect')) {
					messageList.push({
						type: 'disconnect',
						code: event.code,
						reason: event.reason
					});
				}

				for await (let event of client.listen('error')) {
					messageList.push({
						type: 'error',
						error: event.error
					});
				}
			})();

			(async () => {
				try {
					await client.invoke('performTask', 10);
				} catch (err) {
					clientStatus = client.status;
					messageList.push({
						type: 'error',
						error: err
					});
				}
			})();
			await client.listen('connect').once();
			client.disconnect();
			await wait(200);
			assert.strictEqual(messageList.length, 2);
			assert.strictEqual(clientStatus, 'closed');
			assert.strictEqual(messageList[0].error.name, 'BadConnectionError');
			assert.strictEqual(messageList[0].type, 'error');
			assert.strictEqual(messageList[1].type, 'disconnect');
		});

		it('Should reconnect if transmit is called on a disconnected socket', async function () {
			client = new ClientSocket(clientOptions);

			let clientError: Error | null = null;

			(async () => {
				for await (let {error} of client.listen('error')) {
					clientError = error;
				}
			})();

			const eventList: string[] = [];

			(async () => {
				for await (let event of client.listen('connecting')) {
					eventList.push('connecting');
				}
			})();

			(async () => {
				for await (let event of client.listen('connect')) {
					eventList.push('connect');
				}
			})();

			(async () => {
				for await (let event of client.listen('disconnect')) {
					eventList.push('disconnect');
				}
			})();

			(async () => {
				for await (let event of client.listen('close')) {
					eventList.push('close');
				}
			})();

			(async () => {
				for await (let event of client.listen('connectAbort')) {
					eventList.push('connectAbort');
				}
			})();

			(async () => {
				await client.listen('connect').once();
				client.disconnect();
				client.transmit('performTask', 123);
			})();

			await wait(100);

			const expectedEventList = ['connect', 'close', 'disconnect', 'connecting', 'connect'];

			assert.strictEqual(clientError, null);
			assert.strictEqual(JSON.stringify(eventList), JSON.stringify(expectedEventList));
			assert.strictEqual(performTaskTriggered, true);
		});

		it('Should correctly handle multiple successive connect and disconnect calls', async function () {
			client = new ClientSocket(clientOptions);

			let eventList: any[] = [];

			let clientError: Error;

			(async () => {
				for await (let {error} of client.listen('error')) {
					clientError = error;
				}
			})();

			(async () => {
				for await (let event of client.listen('connecting')) {
					eventList.push({
						event: 'connecting'
					});
				}
			})();

			(async () => {
				for await (let event of client.listen('connect')) {
					eventList.push({
						event: 'connect'
					});
				}
			})();

			(async () => {
				for await (let event of client.listen('connectAbort')) {
					eventList.push({
						event: 'connectAbort',
						code: event.code,
						reason: event.reason
					});
				}
			})();

			(async () => {
				for await (let event of client.listen('disconnect')) {
					eventList.push({
						event: 'disconnect',
						code: event.code,
						reason: event.reason
					});
				}
			})();

			(async () => {
				for await (let event of client.listen('close')) {
					eventList.push({
						event: 'close',
						code: event.code,
						reason: event.reason
					});
				}
			})();

			const onceDisconnect = client.listen('close').once();
			client.disconnect(1000, 'One');
			await onceDisconnect;

			client.listen('connect').once();
			client.connect();
			client.disconnect(4444, 'Two');

			const onceConnect = client.listen('connect').once();

			client.connect();
			await onceConnect;

			client.disconnect(4455, 'Three');
			await wait(100);

			const expectedEventList = [
				{
					event: 'connectAbort',
					code: 1000,
					reason: 'One'
				},
				{
					event: 'close',
					code: 1000,
					reason: 'One'
				},
				{
					event: 'connecting'
				},
				{
					event: 'close',
					code: 4444,
					reason: 'Two'
				},
				{
					event: 'connectAbort',
					code: 4444,
					reason: 'Two'
				},
				{
					event: 'connecting'
				},
				{
					event: 'connect'
				},
				{
					event: 'close',
					code: 4455,
					reason: 'Three'
				},
				{
					event: 'disconnect',
					code: 4455,
					reason: 'Three'
				}
			];
			assert.strictEqual(JSON.stringify(eventList), JSON.stringify(expectedEventList));
		});

		it('Should support event listener timeout using once(timeout) method', async function () {
			client = new ClientSocket(clientOptions);

			let event: AuthStateChangeEvent | null = null;
			let error: Error | null = null;

			try {
				// Since the authStateChange event will not trigger, this should timeout.
				event = await client.listen('authStateChange').once(100);
			} catch (err) {
				error = err;
			}

			assert.strictEqual(event, null);
			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'TimeoutError');
		});
	});

	describe('Ping/pong', function () {
		it('Should close if ping is not received before timeout', async function () {
			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>(
					{
						connectTimeoutMs: 500
					},
					clientOptions
				)
			);

			assert.strictEqual(client.pingTimeoutMs, 500);

			(async () => {
				for await (let event of client.listen('connect')) {
					assert.strictEqual(client.pingTimeoutMs, server.pingTimeoutMs);
					// Hack to make the client ping independent from the server ping.
					client.pingTimeoutMs = 500;
				}
			})();

			let closeEvent: CloseEvent | null = null;
			let disconnectEvent: DisconnectEvent | null = null;
			let clientError: Error | null = null;

			(async () => {
				for await (let { error } of client.listen('error')) {
					clientError = error;
				}
			})();

			(async () => {
				for await (let event of client.listen('close')) {
					closeEvent = event;
				}
			})();

			(async () => {
				for await (let event of client.listen('disconnect')) {
					disconnectEvent = event;
				}
			})();

			await wait(1000);

			assert.strictEqual(disconnectEvent!.code, 4000);
			assert.strictEqual(disconnectEvent!.reason, 'Server ping timed out');
			assert.strictEqual(closeEvent!.code, 4000);
			assert.strictEqual(closeEvent!.reason, 'Server ping timed out');
			assert.notEqual(clientError, null);
			assert.strictEqual(clientError!.name, 'SocketProtocolError');
		});

		it('Should not close if ping is not received before timeout when pingTimeoutDisabled is true', async function () {
			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<ServerIncomingMap>,
					ClientSocketOptions<ServerIncomingMap>
				>(
					{
						connectTimeoutMs: 500,
						isPingTimeoutDisabled: true
					},
					clientOptions
				)
			);

			assert.strictEqual(client.pingTimeoutMs, 500);

			let closeEvent: CloseEvent | null = null;
			let disconnectEvent: DisconnectEvent | null = null;
			let clientError: Error | null = null;

			(async () => {
				for await (let { error } of client.listen('error')) {
					clientError = error;
				}
			})();

			(async () => {
				for await (let event of client.listen('close')) {
					closeEvent = event;
				}
			})();

			(async () => {
				for await (let event of client.listen('disconnect')) {
					disconnectEvent = event;
				}
			})();

			await wait(1000);
			assert.strictEqual(clientError, null);
			assert.strictEqual(disconnectEvent, null);
			assert.strictEqual(closeEvent, null);
		});
	});

	describe('Consumable streams', function () {
		it('Should be able to get the stats list of consumers and check if consumers exist on specific channels', async function () {
			client = new ClientSocket(clientOptions);

			const fooChannel = client.channels.channel('foo');

			(async () => {
				for await (let data of fooChannel.listen('subscribe')) {}
			})();
			(async () => {
				for await (let data of fooChannel.listen('subscribe')) {}
			})();
			(async () => {
				for await (let data of fooChannel.listen('subscribeFail')) {}
			})();
			(async () => {
				for await (let data of fooChannel.listen('customEvent')) {}
			})();

			(async () => {
				for await (let data of client.channels.channel('bar').listen('subscribe')) {}
			})();

			const fooStatsList = client.channels.listeners.getConsumerStats('foo');
			const barStatsList = client.channels.listeners.getConsumerStats('bar');

			assert.strictEqual(fooStatsList.length, 4);
			assert.strictEqual(fooStatsList[0].id, 1);
			assert.strictEqual(fooStatsList[0].stream, 'foo/subscribe');
			assert.strictEqual(fooStatsList[1].id, 2);
			assert.strictEqual(fooStatsList[2].id, 3);
			assert.strictEqual(fooStatsList[3].id, 4);
			assert.strictEqual(fooStatsList[3].stream, 'foo/customEvent');

			assert.strictEqual(barStatsList.length, 1);
			assert.strictEqual(barStatsList[0].id, 5);
			assert.strictEqual(barStatsList[0].stream, 'bar/subscribe');

			assert.strictEqual(client.channels.listeners.hasConsumer('foo', 1), true);
			assert.strictEqual(client.channels.listeners.hasConsumer('foo', 4), true);
			assert.strictEqual(client.channels.listeners.hasConsumer('foo', 5), false);
			assert.strictEqual(client.channels.listeners.hasConsumer('bar', 5), true);
		});

		it('Should be able to check the listener backpressure for specific channels', async function () {
			client = new ClientSocket(clientOptions);

			const fooChannel = client.channels.channel('foo');
			const barChannel = client.channels.channel('bar');
			const fooBackpressures: number[] = [];
			const barBackpressures: number[] = [];

			await Promise.all([
				(async () => {
					for await (let data of fooChannel.listen('customEvent')) {
						fooBackpressures.push(client.channels.listeners.getBackpressure('foo'));
						await wait(50);
					}
				})(),
				(async () => {
					for await (let data of barChannel.listen('customEvent')) {
						barBackpressures.push(client.channels.listeners.getBackpressure('bar'));
						await wait(20);
					}
				})(),
				(async () => {
					for (let i = 0; i < 20; i++) {
						(fooChannel as any)._eventDemux.write('foo/customEvent', `message${i}`);
					}
					barChannel.emit('customEvent', `hi0`);
					barChannel.emit('customEvent', `hi1`);
					barChannel.emit('anotherEvent', `hi2`);
					barChannel.closeEvent('customEvent');
					barChannel.closeEvent('anotherEvent');
					fooChannel.closeEvent('customEvent');
				})()
			]);

			assert.strictEqual(fooBackpressures.length, 20);
			assert.strictEqual(fooBackpressures[0], 20);
			assert.strictEqual(fooBackpressures[1], 19);
			assert.strictEqual(fooBackpressures[19], 1);

			assert.strictEqual(barBackpressures.length, 2);
			assert.strictEqual(barBackpressures[0], 2);
			assert.strictEqual(barBackpressures[1], 1);

			assert.strictEqual(client.channels.listeners.getBackpressure('foo'), 0);
			assert.strictEqual(client.channels.listeners.getBackpressure('bar'), 0);
		});

		it('Should be able to kill and close channels and backpressure should update accordingly', async function () {
			client = new ClientSocket(clientOptions);

			await client.listen('connect').once();

			const fooChannel = client.channels.channel('foo');
			const barChannel = client.channels.subscribe('bar');

			await barChannel.listen('subscribe').once(100);

			const fooEvents: string[] = [];
			const barEvents: string[] = [];
			const barMessages: (string | { def: number })[] = [];
			const barBackpressures: number[] = [];
			const allBackpressures: number[] = [];

			await Promise.all([
				(async () => {
					for await (let data of barChannel) {
						await wait(10);
						assert.strictEqual(client.channels.getBackpressure('bar'), barChannel.getBackpressure());
						barBackpressures.push(client.channels.getBackpressure('bar'));
						allBackpressures.push(client.channels.getBackpressure());
						barMessages.push(data);
					}
				})(),
				(async () => {
					for await (let data of fooChannel.listen<string>('customEvent')) {
						fooEvents.push(data);
						await wait(50);
					}
				})(),
				(async () => {
					for await (let data of barChannel.listen<string>('customEvent')) {
						barEvents.push(data);
						await wait(20);
					}
				})(),
				(async () => {
					for (let i = 0; i < 20; i++) {
						fooChannel.emit('customEvent', `message${i}`);
					}
					for (let i = 0; i < 50; i++) {
						barChannel.transmitPublish(`hello${i}`);
					}

					barChannel.emit('customEvent', `hi0`);
					barChannel.emit('customEvent', `hi1`);
					barChannel.emit('customEvent', `hi2`);
					barChannel.emit('customEvent', `hi3`);
					barChannel.emit('customEvent', `hi4`);
					assert.strictEqual(client.channels.getBackpressure('bar'), 5);
					fooChannel.closeEvent('customEvent');
					client.channels.kill('foo');


					await wait(1000);
					assert.strictEqual(client.channels.getBackpressure('bar'), 0);
					client.channels.close('bar');
					assert.strictEqual(client.channels.getBackpressure('bar'), 1);
				})()
			]);

			assert.strictEqual(fooEvents.length, 0);

			assert.strictEqual(barEvents.length, 5);
			assert.strictEqual(barEvents[0], 'hi0');
			assert.strictEqual(barEvents[1], 'hi1');
			assert.strictEqual(barEvents[4], 'hi4');

			assert.strictEqual(barMessages.length, 50);
			assert.strictEqual(barMessages[0], 'hello0');
			assert.strictEqual(barMessages[49], 'hello49');

			assert.strictEqual(client.channels.listeners.getBackpressure('foo'), 0);
			assert.strictEqual(client.channels.listeners.getConsumerStats('bar').length, 0);
			assert.strictEqual(client.channels.listeners.getBackpressure('bar'), 0);

			assert.strictEqual(barBackpressures.length, 50);
			assert.strictEqual(barBackpressures[0], 49);
			assert.strictEqual(barBackpressures[49], 0);

			assert.strictEqual(allBackpressures.length, 50);
			assert.strictEqual(allBackpressures[0], 49);
			assert.strictEqual(allBackpressures[49], 0);
		});
	});
});