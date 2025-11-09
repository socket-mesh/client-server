import { SignedAuthToken } from '@socket-mesh/auth';
import { RequestHandlerArgs } from '@socket-mesh/core';

export async function setAuthTokenHandler({ options, transport }: RequestHandlerArgs<SignedAuthToken>): Promise<void> {
	await transport.setAuthorization(options);
}
