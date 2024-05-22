import { listen } from "./dist/index.js";
import { ClientSocket } from "./dist/client/client-socket.js";

function wait(duration) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, duration);
	});
}

const server = listen(
	8080,
	{
		handlers: {
			hello: async () => {
				await wait(1000);
				return 'world';
			}
		}
	}
);

server.on('listening', () => {
	console.log('listening');

	const client = new ClientSocket(
		{
			address: 'ws://127.0.0.1:8080',
			ackTimeoutMs: 1100,
			autoReconnect: true
		}
	);

	client.on('open', (socket) => {
		console.log('client.open', socket.id);

		setTimeout(async () => {
//			console.log('disconnect', !!socket.socket);
			try {
				const result = await socket.invoke('hello');

				console.log('hello', result);					
			} catch (error) {
				console.log('hello', error);
			}
//			socket.disconnect();
		}, 3000)
	});

	client.on('close', (socket) => {
		console.log('client.close', socket.id);
	});

	client.on('error', (socket, err) => {
		console.log('client.error', err);
	})

	client.on('message', (socket, data, isBinary) => {
		console.log('client.message', data.toString());
	});

	client.on('ping', (socket) => {
		console.log('client.ping', socket.id);
	});

	client.on('pong', () => {
		console.log('client.pong', socket.id);
	});
})

server.on('close', () => {
	console.log('server.close');
})

server.on('pong', (socket) => {
	console.log('server.pong', socket.id);
})

server.on('message', (socket, data) => {
	console.log('server.message', data.toString());
});

