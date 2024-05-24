import { SignedAuthToken } from "@socket-mesh/auth"

// Typescript automatically adds an index signature to type definitions (vs interfaces). 
// If you add an index signature to an interface it has effects on IntelliSense.
export type ClientPrivateMap = {
	'#setAuthToken': (token: SignedAuthToken) => void,
	'#removeAuthToken': () => void
}