require("dotenv").config();
const LastFmNode = require("lastfmapi");
const { Bot, webhookCallback, HttpError, GrammyError } = require("grammy");
const https = require("https");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// Auth

const lastfm = new LastFmNode({
  api_key: process.env.API_KEY,
  secret: process.env.SECRET,
});

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply(
      "*Welcome!* ✨\n_Send a Last.fm username to get recent plays.\nYou can also use inline by @recentplaybot <username>._",
      {
        parse_mode: "Markdown",
      }
    )
    .then(console.log(`New user added:`, ctx.from))
    .catch((error) => console.error(error));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot sends the recent listens for a Last.fm profile.\nSend a username to try it out!_",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.from.id))
    .catch((error) => console.error(error));
});

// Messages

bot.on("msg", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.msg.text}`
  );

  // Logic

  if (!/^[a-zA-Z0-9_-]+$/.test(ctx.msg.text)) {
    await ctx.reply("*Send a valid Last.fm username.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  } else {
    try {
      const username = ctx.msg.text;
      async function getNowPlaying() {
        return new Promise((resolve, reject) => {
          lastfm.user.getRecentTracks(
            {
              user: username,
              limit: 1,
              nowplaying: true,
            },
            (err, data) => {
              if (err) {
                reject(err);
              } else {
                const nowPlaying = data.track[0];
                if (nowPlaying["@attr"] && nowPlaying["@attr"].nowplaying) {
                  resolve(nowPlaying);
                } else {
                  resolve(null);
                }
              }
            }
          );
        });
      }
      async function getLastPlayed() {
        return new Promise((resolve, reject) => {
          lastfm.user.getRecentTracks(
            {
              user: username,
              limit: 5,
            },
            (err, data) => {
              if (err) {
                reject(err);
              } else {
                const tracks = data.track.map(
                  (track) => `${track.name} by ${track.artist["#text"]}`
                );
                resolve(tracks);
              }
            }
          );
        });
      }
      const nowPlaying = await getNowPlaying();
      if (!nowPlaying) {
      } else {
        await ctx.reply(
          `<b>🎧 Currently listening to: ${nowPlaying.name} by ${nowPlaying.artist["#text"]}</b>`,
          { parse_mode: "HTML" }
        );
      }
      const lastPlayed = await getLastPlayed();
      await ctx
        .reply(
          `<b>🎶 Here are <a href="https://last.fm/user/${ctx.msg.text}">${
            ctx.msg.text
          }'s</a> recent listens:
            \n${lastPlayed.join("\n")}</b>`,
          { parse_mode: "HTML" }
        )
        .then(
          console.log(
            `Recent played list for ${ctx.msg.text} sent successfully to ${ctx.from.id}`
          )
        );
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.message.includes("Forbidden: bot was blocked by the user")) {
          console.log("Bot was blocked by the user");
        } else if (error.message.includes("Call to 'sendMessage' failed!")) {
          console.log("Error sending message.", error);
          await ctx.reply(`*Error contacting Last.fm.*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        } else {
          await ctx.reply(`*An error occurred: ${error.message}*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        }
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log(`An error occured:`, error);
        await ctx.reply(
          `*An error occurred. Are you sure you sent a valid Last.fm username?*\n_Error: ${error.message}_`,
          { parse_mode: "Markdown", reply_to_message_id: ctx.msg.message_id }
        );
        return;
      }
    }
  }
});

// Inline

const { promisify } = require("util");
const getRecentTracks = promisify(
  lastfm.user.getRecentTracks.bind(lastfm.user)
);
let counter = 1;

bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query;
  const username = query;

  // Get recent tracks from Last.fm API
  try {
    const recentTracks = await getRecentTracks({
      user: username,
      limit: 5,
    });

    const results = [];

    for (const track of recentTracks.track) {
      const artist = track.artist["#text"];
      const title = track.name;
      const album = track.album["#text"];
      const url = track.url;

      const message = `<a href = "${url}">${title}</a> by ${artist}\n<i>Album: ${album}</i>`;

      results.push({
        type: "article",
        id: counter,
        title: title,
        description: artist,
        input_message_content: {
          message_text: message,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        },
      });

      counter++;
    }
    await ctx.answerInlineQuery(results);
  } catch (err) {
    console.error(err);
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

export default webhookCallback(bot, "http");
