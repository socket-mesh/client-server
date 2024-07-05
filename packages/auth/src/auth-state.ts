export enum AuthState {
	AUTHENTICATED = 'authenticated',
	UNAUTHENTICATED = 'unauthenticated'
}

export interface AuthStateChange {
	oldAuthState : AuthState,
	newAuthState : AuthState
}