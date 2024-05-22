import { SignedAuthToken } from "@socket-mesh/auth"

export interface ClientPrivateMap {
	'#setAuthToken': (token: SignedAuthToken) => void,
	'#removeAuthToken': () => void
}