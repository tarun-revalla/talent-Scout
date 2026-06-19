import { ImapFlow } from "imapflow";

async function main() {
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
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const result = await client.search({ seen: false }, { uid: true });
    const uids: number[] = Array.isArray(result) ? result : [];
    console.log(`unseen: ${uids.length}`);
    if (uids.length > 0) {
      const list = uids.map(String).join(",");
      await client.messageFlagsAdd(list, ["\\Seen"], { uid: true });
      console.log(`marked ${uids.length} messages as seen`);
    }
  } finally {
    lock.release();
  }
  await client.logout();
  console.log("done.");
}

void main();
