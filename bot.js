require("dotenv").config();
const { Bot, HttpError, GrammyError } = require("grammy");
const through = require("through2");
const LastfmExportStream = require("lastfmexportstream");

// Auth

const API_KEY = process.env.API_KEY;

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply("*Welcome!* ✨\n_Send a Last.fm username._", {
      parse_mode: "Markdown",
    })
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
      await ctx.reply(
        `<b>🎶 Here are <a href="https://last.fm/user/${ctx.msg.text}">${ctx.msg.text}</a> recent listens:</b>`,
        {
          parse_mode: "HTML",
        }
      );
      const stream = new LastfmExportStream({
        apiKey: API_KEY,
        user: ctx.msg.text,
        reverse: true,
      });
      const passThroughStream = new require("stream").Transform({
        objectMode: true,
      });

      passThroughStream._transform = async function (track, enc, callback) {
        console.log(track.title);
        await ctx.reply(`<b>${track.title} - ${track.title}</b>`, {
          parse_mode: "HTML",
        });
        callback();
      };

      passThroughStream.on("finish", () => {
        console.log("Finished");
      });

      stream.pipe(passThroughStream, { end: false });

      setTimeout(() => {
        passThroughStream.end();
      }, 3000);
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

bot.start();
