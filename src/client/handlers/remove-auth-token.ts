import { RequestHandlerArgs } from "../../request-handler.js";

export async function removeAuthTokenHandler(
	{ transport }: RequestHandlerArgs<void, {}>
): Promise<void> {
	await transport.deauthenticate();
}