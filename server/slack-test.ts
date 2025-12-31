/**
 * Send a test message to Slack
 */
export async function sendSlackTestMessage(): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!slackWebhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not configured, skipping test message");
    return;
  }

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
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Slack API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    console.log("Successfully sent deployment test message to Slack");
  } catch (error) {
    console.error("Failed to send Slack test message:", error);
    throw error;
  }
}
