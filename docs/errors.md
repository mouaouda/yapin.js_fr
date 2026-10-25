# Errors

## Where errors go

yapin.js never lets an error in your code crash the bot:

| Where it happened | Where it goes |
| --- | --- |
| An event listener (sync or async) | `error` |
| A command | `commandError`, or `error` if nothing listens. See [Commands](commands.md#errors). |
| A button handler | `error` |
| A module's listener, button or unload hook | `error`, tagged with the module |
| A `send` / `reply` / `edit` / `react` you didn't await | `error` |
| Something you awaited | Thrown to you, as usual |

Without an `error` listener, errors are logged with where they came from:

```
[yapin] [module fun /joke] Error: boom
    at …
```

Errors yapin.js reports carry `module`, `command` and/or `where`:

```js
client.on(Events.Error, (error) => {
  report(error, { module: error.module, command: error.command, where: error.where });
});
```

## Error classes

| Class | When |
| --- | --- |
| `YapinAPIError` | The API refused a request. Has `status`, `message`, `method`, `path`, `body` and `retryAfter`. See [REST](rest.md#errors). |
| `RateLimitError` | A `YapinAPIError` for a 429 that couldn't be waited out. `global` is true for the bot-wide limit. |
| `YapinError` | yapin.js itself: a bad token, a validation failure, an expired interaction, a module that won't load. `code` is one of `ErrorCodes`. |
| `UserError` | Thrown in commands to tell the person something (`ctx.error('…')`) |
| `ArgumentError` | A bad or missing command argument. Has `option`, `value` and `reason`. |
| `PreconditionError` | A failed command check. `precondition` is `serverOnly`, `dmOnly`, `ownerOnly`, `roles`, `permissions`, `check` or `cooldown`. |
| `CooldownError` | A command used too soon. `remaining` is in ms. |

```js
import { YapinAPIError, YapinError, ErrorCodes } from 'yapin.js';

try {
  await client.login();
} catch (error) {
  if (error.code === ErrorCodes.TokenInvalid) console.error('Make a new token in Settings → Developer');
  else throw error;
}
```

## ErrorCodes

| Code | |
| --- | --- |
| `TokenMissing` | No token passed and no `YAPIN_TOKEN` set |
| `TokenInvalid` | The token isn't a bot token, or Yapin’ rejected it |
| `AlreadyLoggedIn` | `login()` called twice |
| `RequestTimeout` | A request took longer than `rest.timeout` |
| `NetworkError` | The request never got an answer |
| `ValidationError` | A builder or payload broke a limit. The message says which. |
| `InvalidPayload` | Something that can't be sent, like an ephemeral Components V2 reply |
| `InteractionExpired` | Answering a click after 15 minutes |
| `InteractionTooManyResponses` | More than 10 answers to one click |
| `ModuleLoadFailed`, `ModuleNotFound` | Module and command file loading |
| `CommandConflict` | The same command name, or an alias, twice |
| `CommandLimit` | Over 100 registered commands |
| `VoiceUnavailable` | `@livekit/rtc-node` or ffmpeg is missing |
| `OAuth2Error` | Login with Yapin’ failed |

## Crashing on purpose

To keep Node's default behaviour of crashing on errors (say, under a process manager that restarts), rethrow:

```js
client.on(Events.Error, (error) => {
  console.error(error);
  process.exit(1);
});
```
