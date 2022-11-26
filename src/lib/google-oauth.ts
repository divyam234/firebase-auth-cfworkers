import {
  decodeProtectedHeader,
  importPKCS8,
  importX509,
  JWTPayload,
  jwtVerify,
  SignJWT,
} from 'jose';
import axios from 'redaxios';

/**
 * Get an OAuth 2.0 token from google authentication apis using
 * a service account
 * @param serviceAccountEmail Email of the service account
 * @param privateKey Private key of the service account
 * @param scope scope to request
 * @returns OAuth 2.0 token
 */
export async function getAuthToken(
  serviceAccountEmail: string,
  privateKey: string,
  scope: string
): Promise<string> {
  const ecPrivateKey = await importPKCS8(privateKey, 'RS256');

  const jwt = await new SignJWT({ scope: scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(serviceAccountEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(ecPrivateKey);

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const payload = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await axios.post('https://oauth2.googleapis.com/token', payload, {
    headers,
  });
  return res.data.access_token;
}

/**
 * Verifies an Identity Platform ID token.
 * If the token is valid, the promise is fulfilled with the token's decoded claims; otherwise, the promise is rejected.
 * @param idToken An Identity Platform ID token
 */
export async function verifyIdToken(idToken: string): Promise<JWTPayload> {
  //Fetch public keys
  //TODO: Public keys should be cached until they expire
  const res = await axios(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  const data = res.data;

  //Get the correct publicKey from the key id
  const header = decodeProtectedHeader(idToken);
  const certificate = data[header.kid];
  const publicKey = await importX509(certificate, 'RS256');

  //Verify JWT with public key
  const { payload } = await jwtVerify(idToken, publicKey);
  return payload;
}
