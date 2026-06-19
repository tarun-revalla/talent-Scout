import { ImapFlow } from "imapflow";

async function main() {
  console.log("creating client...");
  const client = new ImapFlow({
    host: process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  console.log("connecting...");
  try {
    await client.connect();
    console.log("connected. opening INBOX...");
    const lock = await client.getMailboxLock("INBOX");
    try {
      console.log("INBOX opened. fetching UNSEEN...");
      let n = 0;
      for await (const msg of client.fetch({ seen: false }, { envelope: true, uid: true })) {
        n++;
        console.log(`UNSEEN #${n} uid=${msg.uid} subject=${msg.envelope?.subject}`);
      }
      console.log(`done. found ${n} unseen messages.`);
    } finally {
      lock.release();
    }
    await client.logout();
    console.log("logged out cleanly.");
  } catch (err) {
    console.error("IMAP failed:", err);
  }
  console.log("now sleeping 10s...");
  process.on("beforeExit", (code) => console.log(`!! beforeExit code=${code}`));
  await new Promise((r) => setTimeout(r, 10000));
  console.log("script end after sleep.");
}

void main();
