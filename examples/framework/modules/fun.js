import { ActionRowBuilder, ButtonBuilder, Module } from 'yapin.js';

const JOKES = [
  'I know a UDP joke, but you might not get it.',
  'There are 10 kinds of people: those who read binary and those who don’t.',
  'A SQL query walks into a bar, sees two tables and asks: may I join you?',
];

export default class Fun extends Module {
  commands = [
    {
      name: 'joke',
      description: 'Tell a joke',
      run: (ctx) => ctx.reply({ content: this.pick(), components: [this.again()] }),
    },
    {
      name: '8ball',
      description: 'Ask the magic 8-ball',
      options: [{ name: 'question', rest: true, required: true }],
      run: (ctx) => ctx.reply(`🎱 ${['Yes.', 'No.', 'Ask again later.', 'Definitely.', 'Doubtful.'][Math.floor(Math.random() * 5)]}`),
    },
  ];

  buttons = {
    'joke:again': (i) => i.update({ content: this.pick(), components: [this.again()] }),
  };

  pick() {
    return JOKES[Math.floor(Math.random() * JOKES.length)];
  }

  again() {
    return new ActionRowBuilder(ButtonBuilder.secondary('Another one', 'joke:again').setEmoji('😂'));
  }
}
