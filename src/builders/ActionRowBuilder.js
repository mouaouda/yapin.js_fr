import { Limits } from '../util/Constants.js';
import { toJSON } from '../util/util.js';
import { ButtonBuilder } from './ButtonBuilder.js';
import { checkCount, fail, isValidationEnabled } from './validation.js';

/**
 * A row of up to 5 buttons. Goes under a normal message (up to 5 rows) and inside Components V2 layouts.
 *
 *   new ActionRowBuilder().addComponents(ButtonBuilder.success('Yes', 'vote:yes'), ButtonBuilder.danger('No', 'vote:no'))
 *   new ActionRowBuilder(ButtonBuilder.primary('Go', 'go'))   // components can go straight in
 */
export class ActionRowBuilder {
  constructor(...components) {
    const [first] = components;
    // `new ActionRowBuilder({ components: [...] })`, the discord.js / API data form.
    const isData = components.length === 1 && first && Array.isArray(first.components);
    this.components = isData ? first.components.map((c) => (c instanceof ButtonBuilder ? c : new ButtonBuilder(c))) : components.flat();
    checkCount(this.components.length, Limits.ButtonsPerRow, 'buttons in a row');
  }

  static from(other) {
    return new ActionRowBuilder(typeof other?.toJSON === 'function' ? other.toJSON() : other);
  }

  addComponents(...components) {
    this.components.push(...components.flat());
    checkCount(this.components.length, Limits.ButtonsPerRow, 'buttons in a row');
    return this;
  }

  setComponents(...components) {
    this.components = components.flat();
    checkCount(this.components.length, Limits.ButtonsPerRow, 'buttons in a row');
    return this;
  }

  toJSON() {
    if (isValidationEnabled() && this.components.length === 0) fail('An action row needs at least one button');
    return { type: 'row', components: this.components.map(toJSON) };
  }
}
