// Vercel Cron Job endpoint for checking wallet portfolio
// This endpoint is called by Vercel Cron Jobs every 5 minutes

export default async function handler(req: any, res: any) {
  // Verify this is a cron request (optional but recommended)
  // Vercel adds a 'x-vercel-cron' header for cron jobs
  const isCronRequest = req.headers["x-vercel-cron"] === "1";
  const authHeader = req.headers.authorization;
  
  // If CRON_SECRET is set, require authentication (unless it's a verified Vercel cron)
  if (
    process.env.CRON_SECRET &&
    !isCronRequest &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Dynamically import to avoid issues in serverless environment
    const { checkWalletAndSendReport } = await import("../../server/wallet-monitor");
    await checkWalletAndSendReport();
    res.status(200).json({ success: true, message: "Wallet check completed" });
  } catch (error) {
    console.error("Error in wallet cron job:", error);
    res.status(500).json({
      error: "Failed to check wallet",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
