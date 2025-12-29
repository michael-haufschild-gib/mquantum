---
description: Comprehensive React 19 OWASP security vulnerability audit. Deep scan for XSS, injection, supply chain, data exposure, auth, and configuration vulnerabilities.
---

You are performing a comprehensive security audit of this React codebase. Your mission is to find ALL security vulnerabilities. This is a DEEP audit - scan every file, check every pattern, report every finding.

=== OPERATING RULES ===

1. Scan EVERY source file. No sampling. No skipping.
2. Every finding needs: file path, line numbers, actual code evidence.
3. Every finding needs: severity (CRITICAL/HIGH/MEDIUM/LOW), attack scenario, and code fix.
4. When in doubt, report it. Missing a vulnerability is worse than a false positive.

=== PHASE 1: DEPENDENCY VERSION AUDIT ===

Read package.json and any lock files. Flag these as CRITICAL:

**React packages at risky versions:**
- react, react-dom < 19.0.3
- react 19.1.x < 19.1.4
- react 19.2.x < 19.2.3
- Any react-server-dom-* package

**Next.js at risky versions:**
- next < 15.3.6

**Known malicious packages (report if present):**
- reeact-login-page, react-1ogin-page, @reect-login-page/*
- sty1ed-react-modal
- typescriptjs, nodemonjs, zustand.js, react-router-dom.js
- dizcordjs, deezcord.js, dezcord.js
- etherdjs, ethesjs, ethetsjs
- vite-plugin-react-extend
- legacyreact-aws-s3-typescript

=== PHASE 2: XSS VULNERABILITIES ===

**Pattern: dangerouslySetInnerHTML**
Search: `dangerouslySetInnerHTML`

For each occurrence, trace the data source. VULNERABLE if:
- Data comes from user input, URL params, or API without sanitization
- No DOMPurify.sanitize() or equivalent wrapping the value

```jsx
// VULNERABLE
<div dangerouslySetInnerHTML={{ __html: userContent }} />
<div dangerouslySetInnerHTML={{ __html: apiData.html }} />

// SAFE
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
```

**Pattern: javascript: URL injection**
Search: `href={`, `href="javascript`, `src={`

VULNERABLE if user input can reach href/src without protocol validation:
```jsx
// VULNERABLE
<a href={userUrl}>Link</a>
<a href={searchParams.get('redirect')}>Go</a>

// SAFE - validates protocol
const safe = /^https?:\/\//.test(url) ? url : '#';
<a href={safe}>Link</a>
```

**Pattern: Direct DOM manipulation**
Search: `.innerHTML`, `.outerHTML`, `document.write`, `ref.current.innerHTML`

VULNERABLE - any direct innerHTML assignment bypasses React's escaping:
```jsx
// VULNERABLE
ref.current.innerHTML = content;
document.getElementById('x').innerHTML = data;
```

**Pattern: Code execution from strings**
Search: `eval(`, `new Function(`, `setTimeout(` with string arg, `setInterval(` with string arg

VULNERABLE if any user data could reach these:
```jsx
// VULNERABLE
eval(userExpression);
setTimeout(userCallback, 1000); // string callback
```

=== PHASE 3: INJECTION VULNERABILITIES ===

**Pattern: Prototype pollution**
Search: `__proto__`, `constructor.prototype`, object spreads with external data

VULNERABLE when merging user-controlled objects:
```jsx
// VULNERABLE
const config = { ...defaults, ...JSON.parse(userInput) };
Object.assign(target, userObject);
```

**Pattern: Server Action without validation**
Search: `'use server'`, `"use server"`

For each Server Action, check if inputs are validated. VULNERABLE if:
- Form data used directly without schema validation (Zod, Valibot, etc.)
- User input concatenated into SQL, shell commands, or file paths

```jsx
// VULNERABLE
'use server'
async function update(formData) {
  const name = formData.get('name');
  await db.query(`UPDATE users SET name = '${name}'`); // SQL injection
}

// SAFE
'use server'
async function update(formData) {
  const { name } = schema.parse(Object.fromEntries(formData));
  await db.query('UPDATE users SET name = $1', [name]);
}
```

**Pattern: Command injection**
Search: `child_process`, `exec(`, `execSync(`, `spawn(`, `shell: true`

VULNERABLE if user input reaches command arguments.

=== PHASE 4: SENSITIVE DATA EXPOSURE ===

**Pattern: Secrets in client code**
Search: `REACT_APP_`, `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, `apiKey`, `api_key`, `secret`, `password`, `token`, `private_key`, `credential`

VULNERABLE if actual secrets (not public IDs) are in client-accessible code:
```jsx
// VULNERABLE - private key in client
const API_KEY = 'sk-live-abc123';
const secret = process.env.REACT_APP_STRIPE_SECRET;

// OK - public publishable key
const publicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE;
```

**Pattern: Tokens in browser storage**
Search: `localStorage.setItem`, `sessionStorage.setItem`, `localStorage.getItem`

VULNERABLE - tokens in storage are stealable via XSS:
```jsx
// VULNERABLE
localStorage.setItem('token', jwt);
localStorage.setItem('user', JSON.stringify({ ssn: data }));

// SAFE - use httpOnly cookies instead, or memory-only for access tokens
```

**Pattern: Source maps in production**
Search config files for: `devtool:`, `sourcemap`, `GENERATE_SOURCEMAP`

VULNERABLE if source maps enabled in production config.

=== PHASE 5: AUTHENTICATION & AUTHORIZATION ===

**Pattern: Missing CSRF protection**
Search: `<form`, `method="POST"`, `method="PUT"`, `method="DELETE"`, state-changing fetch calls

VULNERABLE if no CSRF token in state-changing requests.

**Pattern: Frontend-only authorization**
Search: `isAdmin`, `role ===`, `user.role`, `canEdit`, `canDelete`, `authorized`

VULNERABLE if authorization check exists only in frontend without backend enforcement:
```jsx
// VULNERABLE - attacker can call API directly
{user.isAdmin && <button onClick={() => deleteUser(id)}>Delete</button>}

// Backend MUST also verify: if (!user.isAdmin) throw new Error('Unauthorized');
```

**Pattern: JWT in localStorage**
Search: `jwt`, `accessToken`, `refreshToken`, `Bearer`

Flag if tokens stored in localStorage/sessionStorage (XSS-stealable).

=== PHASE 6: NETWORK & CONFIGURATION ===

**Pattern: CORS misconfiguration**
Search: `Access-Control-Allow-Origin`, `cors(`, `credentials: true`

CRITICAL if `Access-Control-Allow-Origin: *` combined with `credentials: true`.

**Pattern: Missing Content Security Policy**
Search config files for CSP headers.

VULNERABLE if:
- No CSP configured
- CSP includes `'unsafe-inline'` or `'unsafe-eval'` in script-src

**Pattern: Missing clickjacking protection**
Search for: `X-Frame-Options`, `frame-ancestors`

VULNERABLE if neither header is set.

**Pattern: Open redirect**
Search: `window.location`, `location.href`, `router.push(`, `redirect(`, `navigate(`

VULNERABLE if redirect destination comes from user input without allowlist:
```jsx
// VULNERABLE
const returnUrl = searchParams.get('return');
router.push(returnUrl);

// SAFE
const allowed = ['/dashboard', '/profile'];
if (allowed.includes(returnUrl)) router.push(returnUrl);
```

**Pattern: SSRF**
Search: `fetch(`, `axios(`, server-side code with user-controlled URLs

VULNERABLE if URL is user-controllable without allowlist validation.

=== PHASE 7: SSR-SPECIFIC VULNERABILITIES ===

**Pattern: JSON injection in hydration**
Search: `__NEXT_DATA__`, `window.__PRELOADED_STATE__`, `<script>` tags with JSON

VULNERABLE if `<` not escaped in embedded JSON:
```jsx
// VULNERABLE - script breakout possible
<script>window.__STATE__ = {JSON.stringify(state)}</script>

// SAFE
<script>window.__STATE__ = {JSON.stringify(state).replace(/</g, '\\u003c')}</script>
```

=== PHASE 8: INFORMATION DISCLOSURE ===

**Pattern: Stack traces exposed**
Search: `catch`, `.stack`, `.message`, error boundaries

VULNERABLE if error details shown to users:
```jsx
// VULNERABLE
catch (e) { return <div>Error: {e.stack}</div> }

// SAFE
catch (e) { console.error(e); return <div>Something went wrong</div> }
```

**Pattern: Debug code in production**
Search: `console.log`, `debugger;`, `// TODO`, `// HACK`

Flag sensitive data being logged or debug statements left in.

=== OUTPUT ===

Write findings to `docs/security-audit-report.md` in this format:

```markdown
# Security Audit Report

## Summary
- **Overall Risk:** CRITICAL|HIGH|MEDIUM|LOW
- **Critical:** X findings
- **High:** X findings
- **Medium:** X findings
- **Low:** X findings

## Critical Findings

### [CRITICAL] Title
**File:** path/to/file.tsx:45-52
**Category:** XSS|Injection|DataExposure|Auth|Config|SSR

**Vulnerable Code:**
\`\`\`jsx
// actual code from the file
\`\`\`

**Attack Scenario:** How this could be exploited

**Fix:**
\`\`\`jsx
// corrected code
\`\`\`

---

## High Findings
...

## Medium Findings
...

## Low Findings
...

## Recommendations
1. Immediate actions (before next deploy)
2. Short-term fixes
3. Long-term improvements
```

=== EXECUTION ===

1. Catalog all source files first
2. Work through each phase - DO NOT SKIP
3. Search the ENTIRE codebase for each pattern
4. Report EVERY finding with evidence
5. Compile final report
