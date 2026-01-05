// Vercel deployment webhook handler
// This can be called by Vercel webhooks or manually to send a test message
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: any, res: any) {
  try {
    const { sendSlackTestMessage } = await import("../../server/slack-test");
    await sendSlackTestMessage();
    res.status(200).json({ success: true, message: "Deployment test message sent to Slack" });
  } catch (error) {
    console.error("Error in deploy hook:", error);
    res.status(500).json({
      error: "Failed to send deployment test message",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
