/**
 * Send a test message to Slack
 */
export async function sendSlackTestMessage(): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  console.log(`[SLACK TEST] Checking SLACK_WEBHOOK_URL: ${slackWebhookUrl ? "✅ Configured" : "❌ Not configured"}`);
  
  if (!slackWebhookUrl) {
    console.warn("[SLACK TEST] ⚠️ SLACK_WEBHOOK_URL not configured, skipping test message");
    throw new Error("SLACK_WEBHOOK_URL environment variable is not set");
  }
  
  // Validate webhook URL format
  if (!slackWebhookUrl.startsWith("https://hooks.slack.com/services/")) {
    console.warn(`[SLACK TEST] ⚠️ Invalid webhook URL format. Expected to start with 'https://hooks.slack.com/services/'`);
    console.warn(`[SLACK TEST] Current URL: ${slackWebhookUrl.substring(0, 50)}...`);
    throw new Error("Invalid Slack webhook URL format. Must start with 'https://hooks.slack.com/services/'");
  }
  
  console.log(`[SLACK TEST] Preparing test message payload...`);

  const timestamp = new Date().toISOString();
  const dateTime = new Date().toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const payload = {
    text: "✅ Deployment Test - 42 Bot Wallet Tracker",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ Deployment Successful",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*42 Bot Wallet Tracker* has been successfully deployed!",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Deployment Time:*\n${dateTime} UTC`,
          },
          {
            type: "mrkdwn",
            text: `*Status:*\n✅ Online`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "The wallet monitoring service is now active and will send reports every 5 minutes.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Monitored Wallet:*\n`0x303E912232a80607D08705cc679F7DbfBb9FC6b2`",
        },
      },
    ],
  };

  try {
    console.log(`[SLACK TEST] Sending request to Slack webhook...`);
    console.log(`[SLACK TEST] Webhook URL: ${slackWebhookUrl.substring(0, 30)}...`);
    
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`[SLACK TEST] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SLACK TEST] ❌ Slack API error response: ${errorText}`);
      throw new Error(
        `Slack API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseText = await response.text();
    
    // Slack webhooks return "ok" on success
    if (responseText.trim() === "ok") {
      console.log(`[SLACK TEST] ✅ Successfully sent deployment test message to Slack`);
    } else {
      console.warn(`[SLACK TEST] ⚠️ Unexpected response from Slack: ${responseText}`);
      console.log(`[SLACK TEST] ✅ Message sent (response: ${responseText})`);
    }
  } catch (error) {
    console.error("[SLACK TEST] ❌ Failed to send Slack test message:", error);
    if (error instanceof Error) {
      console.error("[SLACK TEST] Error message:", error.message);
      console.error("[SLACK TEST] Error stack:", error.stack);
    }
    throw error;
  }
}
