<h1 align="center">Firebase Auth</h1>
<p align="center">
 Firebase/Admin Auth Javascript Library for Cloudflare Workers
</p>
<br>

<p align="center">
  <a href="https://github.com/divyam234/firebase-auth-cfworkers/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/divyam234/firebase-auth-cfworkers"/></a>
  <img src="https://github.com/divyam234/firebase-auth-cfworkers/actions/workflows/node_ci.yaml/badge.svg" alt="GitHub CI"/>
  <a href="https://www.npmjs.com/package/firebase-auth-cfworkers"><img alt="NPM" src="https://badge.fury.io/js/firebase-auth-cfworkers.svg"/></a>
  <a href="https://www.npmjs.com/package/firebase-auth-cfworkers"><img src="https://img.shields.io/npm/dt/firebase-auth-cfworkers.svg" alt="NPM Downloads"/></a>
  <a href="https://github.com/divyam234><img alt="Github" src="https://img.shields.io/static/v1?label=GitHub&message=divyam234&color=005cb2"/></a>
</p>

# Supported operations:

- [x] createSessionCookie()
- [x] verifySessionCookie()
- [x] signInWithEmailAndPassword()
- [x] signUpWithEmailAndPassword()
- [x] changePassword()
- [x] lookupUser()
- [x] setCustomUserClaims()

# Install

```bash
npm i firebase-auth-cfworkers
```

# Usage

Firebase tries to use the same method names and return values as the official Firebase/Admin SDK. Sometimes, the method signature are slightly different.

**Create FirebaseAuth**

```ts
import { FirebaseAuth } from 'firebase-auth-cfworkers';

const auth = new FirebaseAuth({
  apiKey: 'Firebase api key',
  projectId: 'Firebase project id',
  privateKey: 'Firebase private key or service account private key',
  serviceAccountEmail: 'Firebase service account email',
});
```

**Sign-in with email/pass**

```ts
//Sign in with username and password
const { token, user } = await auth.signInWithEmailAndPassword(
  'my@email.com',
  'supersecurepassword'
);

const userEmail = user.email;
const refreshToken = token.refreshToken;
```

**Sign-up with email/pass**

```ts
//Sign up with username and password
const { token, user } = await auth.signUpWithEmailAndPassword(
  'my@email.com',
  'supersecurepassword'
);

const userEmail = user.email;
const refreshToken = token.refreshToken;
```

**Set Custom User Claims**

```ts
//Set Custom User Claims
const res = await auth.setCustomUserClaims(uid,
  {'admin':true}
);
```

**Create session cookies**

```ts
//Create a new session cookie from the user idToken
const { token, user } = await auth.signInWithEmailAndPassword(
  'my@email.com',
  'supersecurepassword'
);

const sessionCookie = await auth.createSessionCookie(token.idToken);
```

**Verify session cookies**

```ts
auth
  .verifySessionCookie(sessionCookie)
  .then((token) => useToken(token))
  .catch((e) => console.log('Invalid session cookie'));
```

**Cache OAuth tokens with CloudflareKv KV**

```ts
import { FirebaseAuth, CloudflareKv } from 'firebase-auth-cfworkers';

const auth = new FirebaseAuth({
  apiKey: 'Firebase api key',
  projectId: 'Firebase project id',
  privateKey: 'Firebase private key or service account private key',
  serviceAccountEmail: 'Firebase service account email',
  cache: new CloudflareKv(NAMESPACE),
});
```

