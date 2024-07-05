import { RequestHandlerArgs } from "../core/request-handler.js";

export async function removeAuthTokenHandler(
	{ transport }: RequestHandlerArgs<void>
): Promise<void> {
	await transport.changeToUnauthenticatedState();
}