import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';
import axios from 'redaxios';

import { Cache } from './cache/cache';
import { getAuthToken, verifyIdToken } from './google-oauth';
import { DecodedIdToken, User } from './models';

export type FirebaseConfig = {
  readonly projectId: string;
  readonly apiKey: string;
  readonly serviceAccountEmail: string;
  readonly privateKey: string;
  readonly cache?: Cache;
};

/**
 * Interact with Firebase REST Api and Google Identity Toolkit Api.
 * Made to work with CloudFire Workers
 */
export class FirebaseAuth {
  private BASE_URL = 'https://identitytoolkit.googleapis.com/v1/';

  constructor(public readonly config: FirebaseConfig) {}

  /**
   * Cache the result of an async function
   * @param action Function with result to be stored
   * @param key Where to find/store the value from/to the cache
   * @param expiration Cache expiration in seconds
   * @returns Cached result
   */
  private async withCache<T>(
    action: () => Promise<T>,
    key: string,
    expiration: number
  ): Promise<T> {
    if (!this.config.cache) return await action();

    let result = (await this.config.cache.get(key)) as T;
    if (!result) {
      result = await action();
      await this.config.cache.put(key, result, { expirationTtl: expiration });
    }

    return result;
  }

  /**
   * Cache Result Of Token Response
   * @returns Returns Cached result
   */

  async getToken(): Promise<string> {
    return await this.withCache(
      () =>
        getAuthToken(
          this.config.serviceAccountEmail,
          this.config.privateKey,
          'https://www.googleapis.com/auth/identitytoolkit'
        ),
      'google-oauth',
      3600
    );
  }

  /**
   * Send a post request to the identity toolkit api
   * @param formData POST form data
   * @param endpoint endpoint of the identity toolkit googleapis
   * @returns HTTP Response
   */
  private async sendFirebaseAuthPostRequest(
    formData: Record<string, string>,
    endpoint: string
  ): Promise<Record<string, unknown>> {
    const URI =
      this.BASE_URL + `accounts:${endpoint}?key=${this.config.apiKey}`;

    const res = await axios.post(URI, formData);
    if (res.status != 200) throw Error(res.data);
    return res.data;
  }

  /**
   * Retrieve user info from a Firebase ID token
   * @param idToken A valid Firebase ID token
   * @returns User info linked to this ID token
   */
  public async lookupUser(idToken: string): Promise<User> {
    const data = await this.sendFirebaseAuthPostRequest(
      { idToken: idToken },
      'lookup'
    );

    return data.users[0] as User;
  }

  /**
   * Sign in Firebase user with email and password
   * @param email Email of the Firebase user
   * @param password Password of the Firebase user
   * @returns The decoded JWT token payload and the signed in user info
   */
  async signInWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<{ token: DecodedIdToken; user: User }> {
    const data = await this.sendFirebaseAuthPostRequest(
      {
        email: email,
        password: password,
        returnSecureToken: 'true',
      },
      'signInWithPassword'
    );

    const token = data as DecodedIdToken;
    const user = await this.lookupUser(token.idToken);

    return { token, user };
  }

  /**
   * Change a user's password
   * @param idToken	A Firebase Auth ID token for the user.
   * @param newPassword	User's new password.
   * @returns The decoded JWT token payload
   */
  async changePassword(
    idToken: string,
    newPassword: string
  ): Promise<DecodedIdToken> {
    const data = await this.sendFirebaseAuthPostRequest(
      {
        idToken: idToken,
        password: newPassword,
        returnSecureToken: 'true',
      },
      'update'
    );

    const token = data as DecodedIdToken;

    return token;
  }

  /**
   * Delete a current user
   * @param idToken	A Firebase Auth ID token for the user.
   */
  async deleteAccount(idToken: string) {
    await this.sendFirebaseAuthPostRequest(
      {
        idToken: idToken,
      },
      'delete'
    );
  }

  /**
   * Sign up Firebase user with email and password
   * @param email Email of the Firebase user
   * @param password Password of the Firebase user
   * @returns The decoded JWT token payload and the signed in user info
   */
  async signUpWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<{ token: DecodedIdToken; user: User }> {
    const data = await this.sendFirebaseAuthPostRequest(
      {
        email: email,
        password: password,
        returnSecureToken: 'true',
      },
      'signUp'
    );

    const token = data as DecodedIdToken;
    const user = await this.lookupUser(token.idToken);

    return { token, user };
  }

  /**
   * Sets additional developer claims on an existing user identified by the
   * provided `uid`, typically used to define user roles and levels of
   * access. These claims should propagate to all devices where the user is
   * already signed in (after token expiration or when token refresh is forced)
   * and the next time the user signs in.
   *
   * See {@link https://firebase.google.com/docs/auth/admin/custom-claims |
   * Defining user roles and access levels}
   * for code samples and detailed documentation.
   *
   * @param uid - The `uid` of the user to edit.
   * @param customUserClaims - The developer claims to set. If null is
   *   passed, existing custom claims are deleted. Passing a custom claims payload
   *   larger than 1000 bytes will throw an error. Custom claims are added to the
   *   user's ID token which is transmitted on every authenticated request.
   *   For profile non-access related user attributes, use database or other
   *   separate storage systems.
   * @returns A promise that resolves when the operation completes
   *   successfully.
   */
  public async setCustomUserClaims(
    uid: string,
    customUserClaims: Record<string, unknown> | null
  ): Promise<Record<string, unknown>> {
    if (customUserClaims === null) {
      customUserClaims = {};
    }

    const token = await this.getToken();

    const payload = {
      localId: uid,
      customAttributes: JSON.stringify(customUserClaims),
    };

    const headers = { Authorization: 'Bearer ' + token };

    const path = `projects/${this.config.projectId}/accounts:update`;

    const res = await axios.post(this.BASE_URL + path, payload, { headers });
    if (res.status != 200) throw Error(res.data);

    return res.data;
  }

  /**
   * Creates a session cookie for the given Identity Platform ID token.
   * The session cookie is used by the client to preserve the user's login state.
   * @param idToken A valid Identity Platform ID token
   * @param expiresIn The number of seconds until the session cookie expires.
   * Specify a duration in seconds, between five minutes and fourteen days, inclusively.
   * @returns The session cookie that has been created
   */
  async createSessionCookie(
    idToken: string,
    expiresIn: number = 60 * 60 * 24 * 14 //14 days
  ): Promise<string> {
    //Create the OAuth 2.0 token
    //OAuth token is cached until expiration (1h)
    const token = await this.getToken();

    //Post params and header authorization

    const payload = { idToken: idToken, validDuration: expiresIn + '' };
    const headers = { Authorization: 'Bearer ' + token };

    const path = `projects/${this.config.projectId}:createSessionCookie`;
    const res = await axios.post(this.BASE_URL + path, payload, { headers });
    if (res.status != 200) throw Error(res.data);

    //Get session cookie
    return res.data.sessionCookie as string;
  }

  /**
   * Verify if the provided session cookie is valid.
   * @param sessionCookie JWT session cookie generated from createSessionCookie
   * @returns The decoded JWT payload
   */
  async verifySessionCookie(sessionCookie: string): Promise<DecodedIdToken> {
    //Fetch google public key
    const res = await axios(
      'https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys'
    );

    const header = decodeProtectedHeader(sessionCookie);
    const data = res.data;
    if (!data[header.kid]) throw Error('Cannot find public key');

    //Get certificate from JWT key id
    const certificate = data[header.kid];
    const publicKey = await importX509(certificate, 'RS256');

    //Verify the sessionCookie with the publicKey
    const { payload } = await jwtVerify(sessionCookie, publicKey, {
      issuer: `https://session.firebase.google.com/${this.config.projectId}`,
      audience: this.config.projectId,
    });

    return payload as any as DecodedIdToken;
  }

  /**
   * Verifies a Firebase ID token (JWT).
   * If the token is valid, the promise is fulfilled with the token's decoded claims; otherwise, the promise is rejected.
   * @param idToken An Identity Platform ID token
   * @param customData Public Key Data
   */
  async verifyIdToken(
    idToken: string,
    customData: Record<string, unknown> = {}
  ): Promise<DecodedIdToken> {
    return (await verifyIdToken(idToken, customData)) as any as DecodedIdToken;
  }
}
