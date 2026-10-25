const MODULE = Symbol.for('yapin.js.module');

/**
 * A module groups commands, buttons and event listeners, usually one file per feature
 * (modules/fun.js, modules/moderation.js). discord.py and the yapper SDK call these cogs.
 *
 *   import { Module } from 'yapin.js';
 *
 *   export default class Fun extends Module {
 *     commands = [
 *       { name: 'joke', description: 'Tell a joke', run: (ctx) => ctx.reply('I know a UDP joke…') },
 *     ];
 *     buttons = { 'joke:again': (i) => i.update({ content: this.randomJoke() }) };
 *     events = { serverMemberAdd: (member) => this.logger.info(member.displayName, 'joined') };
 *
 *     check(ctx) { return true; }   // optional: false or a reason string stops this module's commands
 *     load() {}                     // optional: after everything above is registered
 *     unload() {}                   // optional: on unload / reload (timers made with this.setInterval clear themselves)
 *   }
 *
 * Inside: `this.client`, `this.logger`, `this.name`, and the ModuleContext helpers
 * (`this.command()`, `this.on()`, `this.button()`, `this.setInterval()`, …).
 */
export class Module {
  static [MODULE] = true;

  constructor(context) {
    Object.defineProperty(this, 'context', { value: context, enumerable: false });
  }

  get client() {
    return this.context.client;
  }

  get logger() {
    return this.context.logger;
  }

  command(definition) {
    return this.context.command(definition);
  }

  on(event, listener) {
    return this.context.on(event, listener);
  }

  once(event, listener) {
    return this.context.once(event, listener);
  }

  button(pattern, handler) {
    return this.context.button(pattern, handler);
  }

  setTimeout(fn, ms) {
    return this.context.setTimeout(fn, ms);
  }

  setInterval(fn, ms) {
    return this.context.setInterval(fn, ms);
  }

  onUnload(fn) {
    return this.context.onUnload(fn);
  }
}

/** A class extending Module (any copy of yapin.js), not Module itself. */
export function isModuleClass(value) {
  return typeof value === 'function' && value[MODULE] === true && !Object.hasOwn(value, MODULE);
}

/**
 * The object form of a module, for those who prefer it to a class:
 *
 *   export default defineModule({
 *     name: 'moderation',
 *     commands: [kick, ban],
 *     events: { messageCreate(message) { … } },
 *     buttons: { 'appeal:{id}': (i) => … },
 *     setup(ctx) { ctx.setInterval(cleanup, 60_000); },
 *     teardown(ctx) {},
 *   });
 */
export function defineModule(definition) {
  return Object.assign(definition, { [MODULE]: 'definition' });
}

export function isModuleDefinition(value) {
  return Boolean(value) && typeof value === 'object' && value[MODULE] === 'definition';
}
