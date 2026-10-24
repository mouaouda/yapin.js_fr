export const ErrorCodes = Object.freeze({
  TokenMissing: 'TokenMissing',
  TokenInvalid: 'TokenInvalid',
  NotReady: 'NotReady',
  AlreadyLoggedIn: 'AlreadyLoggedIn',
  RequestTimeout: 'RequestTimeout',
  NetworkError: 'NetworkError',
  InvalidPayload: 'InvalidPayload',
  ValidationError: 'ValidationError',
  InteractionExpired: 'InteractionExpired',
  InteractionTooManyResponses: 'InteractionTooManyResponses',
  CollectorTimeout: 'CollectorTimeout',
  ModuleLoadFailed: 'ModuleLoadFailed',
  ModuleNotFound: 'ModuleNotFound',
  CommandConflict: 'CommandConflict',
  CommandLimit: 'CommandLimit',
  VoiceUnavailable: 'VoiceUnavailable',
  WebhookSignatureInvalid: 'WebhookSignatureInvalid',
  OAuth2Error: 'OAuth2Error',
  NotInServer: 'NotInServer',
});

/** Errors raised by yapin.js itself (not by the API). `code` is one of ErrorCodes. */
export class YapinError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'YapinError';
    this.code = code;
  }
}

/** The API said no. `status` is the HTTP status, `message` is Yapin’s own explanation. */
export class YapinAPIError extends Error {
  constructor({ status, method, path, url, body, retryAfter = null }) {
    const reason = body?.error ?? body?.message ?? `${method} ${path} failed with ${status}`;
    super(reason);
    this.name = 'YapinAPIError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.url = url;
    this.body = body;
    this.retryAfter = retryAfter;
    if (body?.code !== undefined) this.code = body.code;
  }

  get isRateLimit() {
    return this.status === 429;
  }

  get isMissingPermissions() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

export class RateLimitError extends YapinAPIError {
  constructor(options) {
    super({ ...options, status: 429 });
    this.name = 'RateLimitError';
    /** True when it's the bot-wide message limit ("… overall"), not one server's. */
    this.global = /overall/i.test(this.message);
  }
}

/**
 * Thrown from a command to tell the person what went wrong. The command handler replies with the
 * message and emits `commandDenied` instead of logging a stack trace.
 */
export class UserError extends Error {
  constructor(message, { identifier = 'UserError', context, silent = false } = {}) {
    super(message);
    this.name = 'UserError';
    this.identifier = identifier;
    this.context = context;
    /** No reply is sent for a silent error. */
    this.silent = silent;
  }
}

/** An argument was missing or couldn't be read. */
export class ArgumentError extends UserError {
  constructor(message, { option, value, reason = 'invalid', ...rest } = {}) {
    super(message, { identifier: 'ArgumentError', ...rest });
    this.name = 'ArgumentError';
    this.option = option;
    this.value = value;
    this.reason = reason;
  }
}

/** A check (serverOnly, ownerOnly, roles, permissions, a custom check) stopped the command. */
export class PreconditionError extends UserError {
  constructor(message, { precondition, ...rest } = {}) {
    super(message, { identifier: 'PreconditionError', ...rest });
    this.name = 'PreconditionError';
    this.precondition = precondition;
  }
}

export class CooldownError extends PreconditionError {
  constructor(message, { remaining, ...rest } = {}) {
    super(message, { precondition: 'cooldown', ...rest });
    this.name = 'CooldownError';
    this.identifier = 'CooldownError';
    /** Milliseconds left. */
    this.remaining = remaining;
  }
}

/** Marks an error with where it happened (a module, a command, an event) for clearer logs. */
export function tagError(error, tags) {
  const err = error instanceof Error ? error : new Error(String(error));
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || err[key] !== undefined) continue;
    try {
      err[key] = value;
    } catch {
      // frozen error object
    }
  }
  return err;
}
