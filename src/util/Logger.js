const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * The default logger: `[yapin] message`, filtered by level. Pass your own (anything with
 * debug/info/warn/error, like pino or console) as `new Client({ logger })`, or `logger: false`.
 */
export class Logger {
  constructor({ level = 'info', prefix = '[yapin]', sink = console } = {}) {
    this.level = level;
    this.prefix = prefix;
    this.sink = sink;
  }

  enabled(level) {
    return LEVELS[level] >= (LEVELS[this.level] ?? LEVELS.info);
  }

  child(name) {
    return new Logger({ level: this.level, prefix: `${this.prefix} [${name}]`, sink: this.sink });
  }

  debug(...args) {
    if (this.enabled('debug')) this.sink.debug(this.prefix, ...args);
  }

  info(...args) {
    if (this.enabled('info')) this.sink.log(this.prefix, ...args);
  }

  warn(...args) {
    if (this.enabled('warn')) this.sink.warn(this.prefix, ...args);
  }

  error(...args) {
    if (this.enabled('error')) this.sink.error(this.prefix, ...args);
  }
}

export const silentLogger = Object.freeze({
  debug() {}, info() {}, warn() {}, error() {}, child() { return silentLogger; },
});

export function resolveLogger(option) {
  if (option === false || option === null) return silentLogger;
  if (option === undefined || option === true) return new Logger();
  if (typeof option === 'string') return new Logger({ level: option });
  if (typeof option.error === 'function') {
    if (typeof option.child !== 'function') option.child = () => option;
    return option;
  }
  return new Logger(option);
}
