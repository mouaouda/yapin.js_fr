// A Components V2 layout: a card with sections, a gallery and buttons, updated in place on click.
import {
  ActionRowBuilder,
  ButtonBuilder,
  Client,
  ContainerBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  SeparatorBuilder,
} from 'yapin.js';

const client = new Client();

const GAMES = {
  mc: { name: 'Minecraft', blurb: 'Survival, new world', votes: 0 },
  au: { name: 'Among Us', blurb: 'Up to 10 players', votes: 0 },
};

function card() {
  const container = new ContainerBuilder()
    .setAccentColor('Blurple')
    .addTextDisplayComponents('## 🎮 Game night\nVote for what we play on Friday.');
  for (const [id, game] of Object.entries(GAMES)) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(`**${game.name}** · ${game.votes} vote${game.votes === 1 ? '' : 's'}\n${game.blurb}`)
        .setButtonAccessory(ButtonBuilder.primary('Vote', `night:${id}`)),
    );
  }
  return container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing('large'))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems('https://i.imgur.com/a.png', 'https://i.imgur.com/b.png'))
    .addActionRowComponents(new ActionRowBuilder(ButtonBuilder.link('House rules', 'https://example.com/rules')));
}

client.command('gamenight', 'Post the game night vote', (ctx) => ctx.send({ components: [card()] }));

client.button('night:{game}', (i) => {
  const game = GAMES[i.params.game];
  if (!game) return i.ack();
  game.votes++;
  return i.update({ components: [card()] });
});

await client.login();
