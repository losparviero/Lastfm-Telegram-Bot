require("dotenv").config();
const LastFmNode = require("lastfmapi");
const { Bot, HttpError, GrammyError } = require("grammy");
const https = require("https");

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

// Auth

const lastfm = new LastFmNode({
  api_key: process.env.API_KEY,
  secret: process.env.SECRET,
});

// Commands

bot.command("start", async (ctx) => {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  const body = {
    userId: ctx.from.id,
  };
  const req = https.request(
    "https://users-weld.vercel.app/user",
    options,
    (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          if (data.includes("User not found")) {
            console.log("User not found");
          } else {
            console.log("User found");
          }
        } else {
          console.log("Contacting API failed");
        }
      });
    }
  );
  req.on("error", (error) => {
    console.error(error);
    console.log("Contacting API failed");
  });
  req.write(JSON.stringify(body));
  req.end();
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
                resolve(nowPlaying);
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
      (async () => {
        try {
          /*const nowPlaying = await getNowPlaying();
          await ctx.reply(
            `Now Playing: ${nowPlaying.name} by ${nowPlaying.artist["#text"]}`
          );*/
          const lastPlayed = await getLastPlayed();
          await ctx.reply(
            `<b>🎶 Here are <a href="https://last.fm/user/${ctx.msg.text}">${
              ctx.msg.text
            }'s</a> recent listens:
            \n${lastPlayed.join("\n")}</b>`,
            { parse_mode: "HTML" }
          );
        } catch (err) {
          console.error("Error:", err.message);
        }
      })();
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
