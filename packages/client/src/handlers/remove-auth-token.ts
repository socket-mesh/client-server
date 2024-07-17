import { RequestHandlerArgs } from "@socket-mesh/core";

export async function removeAuthTokenHandler(
	{ transport }: RequestHandlerArgs<void>
): Promise<void> {
	await transport.changeToUnauthenticatedState();
}