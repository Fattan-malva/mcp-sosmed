export class IGError extends Error {
  constructor(message, { status = 500, code = 'IG_ERROR', meta } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

export class AuthError extends IGError {
  constructor(message, options = {}) {
    super(message, { status: 401, code: 'IG_AUTH_REQUIRED', ...options });
  }
}

export class NotFoundError extends IGError {
  constructor(message, options = {}) {
    super(message, { status: 404, code: 'IG_NOT_FOUND', ...options });
  }
}

export class RateLimitError extends IGError {
  constructor(message, options = {}) {
    super(message, { status: 429, code: 'IG_RATE_LIMITED', ...options });
  }
}
