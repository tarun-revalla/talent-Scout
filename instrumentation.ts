// Runs once on server startup (Next.js instrumentation hook).
export async function register() {
  // Only the Node.js server runtime can open SMTP/IMAP sockets (not Edge).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    // Match the worker: prefer IPv4 so outbound SMTP to Gmail establishes on
    // Railway, where IPv6 egress hangs until the connection times out.
    dns.setDefaultResultOrder("ipv4first");
  }
}
