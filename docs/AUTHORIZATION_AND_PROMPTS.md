# Authorization and prompt engineering

## API authorization

`src/auth/authorization.js` exports `createAuthorization()`, which provides bearer-token authentication and role/permission middleware compatible with Express-style request handlers. Authentication fails closed when credentials are missing or invalid. Configure a JSON array of tokens and roles in the environment; never put real tokens in source control:

```dotenv
AGENT_API_TOKENS=[{"token":"replace-with-a-random-secret-at-least-16-chars","role":"admin"}]
```

```js
const { createAuthorization } = require('../src/auth/authorization');
const auth = createAuthorization(); // Reads AGENT_API_TOKENS and throws if it is missing or invalid.

app.get('/status', auth.authenticate, auth.authorizePermission('read'), statusHandler);
app.post('/tasks', auth.authenticate, auth.authorize('developer', 'admin'), taskHandler);
```

Supported roles: `reader` (read), `developer` (read/write), `admin` (read/write/admin). Assign roles only in server-side token configuration; never accept a role from request data. Store the environment variable in your deployment secret manager. This middleware does not implement token issuance, rotation, or persistent user sessions.

## AI prompt engineering

`src/prompts/prompt-builder.js` exports `buildPrompt(task, input)` and `generateWithPrompt(client, task, input, options)`. Supported tasks are `analyze`, `generate`, `review`, `security-audit`, and `tests`. Input fields are validated, serialized as JSON, and explicitly identified as untrusted data in the prompt. The helper accepts any model client with a `generateContent(prompt, options)` method, including the repository's Gemini client.

```js
const GeminiClient = require('../src/models/gemini');
const { generateWithPrompt } = require('../src/prompts/prompt-builder');

const model = new GeminiClient();
const result = await generateWithPrompt(model, 'security-audit', {
  code: sourceText,
  language: 'javascript',
});
console.log(result.text);
```

Prompt instructions reduce ambiguity but are not a security boundary: validate model output and require human review before applying generated changes or performing privileged actions.

## Tests

Run the built-in Node.js tests without additional dependencies:

```bash
node --test
```
