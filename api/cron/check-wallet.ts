// Vercel Cron Job endpoint for checking wallet portfolio
// This endpoint is called by Vercel Cron Jobs every 5 minutes

export default async function handler(req: any, res: any) {
  console.log("[CRON WALLET] ===== Wallet Check Cron Job Started =====");
  console.log(`[CRON WALLET] Environment: ${process.env.VERCEL ? "Vercel" : "Local"}`);
  console.log(`[CRON WALLET] SLACK_WEBHOOK_URL configured: ${!!process.env.SLACK_WEBHOOK_URL}`);
  
  // Verify this is a cron request (optional but recommended)
  // Vercel adds a 'x-vercel-cron' header for cron jobs
  const isCronRequest = req.headers["x-vercel-cron"] === "1";
  const authHeader = req.headers.authorization;
  
  console.log(`[CRON WALLET] Is cron request: ${isCronRequest}`);
  
  // If CRON_SECRET is set, require authentication (unless it's a verified Vercel cron)
  if (
    process.env.CRON_SECRET &&
    !isCronRequest &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    console.log("[CRON WALLET] ❌ Unauthorized request");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("[CRON WALLET] Importing wallet monitor module...");
    // Dynamically import to avoid issues in serverless environment
    const { checkWalletAndSendReport } = await import("../../server/wallet-monitor");
    console.log("[CRON WALLET] Calling checkWalletAndSendReport...");
    await checkWalletAndSendReport();
    console.log("[CRON WALLET] ✅ Wallet check completed successfully");
    res.status(200).json({ success: true, message: "Wallet check completed" });
  } catch (error) {
    console.error("[CRON WALLET] ❌ Error in wallet cron job:", error);
    if (error instanceof Error) {
      console.error("[CRON WALLET] Error message:", error.message);
      console.error("[CRON WALLET] Error stack:", error.stack);
    }
    res.status(500).json({
      error: "Failed to check wallet",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
  
  console.log("[CRON WALLET] ===== Wallet Check Cron Job Finished =====");
}
