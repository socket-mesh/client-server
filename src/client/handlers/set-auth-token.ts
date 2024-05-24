import { SignedAuthToken } from "@socket-mesh/auth";
import { RequestHandlerArgs } from "../../request-handler.js";

export async function setAuthTokenHandler({ transport, options }: RequestHandlerArgs<SignedAuthToken>): Promise<void> {
	await transport.setAuthorization(options);
}