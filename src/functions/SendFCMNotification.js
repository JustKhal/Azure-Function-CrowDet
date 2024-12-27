const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccountKey = JSON.parse(
    Buffer.from(process.env.FIREBASE_BASE64_KEY, "base64").toString("utf-8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey),
  });
}

/**
 * Function to send a push notification via Firebase Admin SDK
 * @param {string} registrationToken - The recipient's FCM registration token
 * @param {object} notification - The notification object containing title and body
 * @param {object} dataPayload - Additional data payload to send with the notification
 */
async function SendFCMNotification(registrationToken, notification, dataPayload) {
  try {
    // Construct the message payload
    const message = {
      token: registrationToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: dataPayload,
    };

    // Send the message using Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log("FCM Notification sent successfully:", response);
    return response;
  } catch (error) {
    console.error("Error during FCM notification:", error);

    // Handle specific errors and log for debugging
    if (error.code === "messaging/invalid-recipient") {
      console.error("Invalid recipient token. Ensure the token is valid.");
    } else if (error.code === "messaging/registration-token-not-registered") {
      console.error("The registration token is no longer valid and should be updated.");
    }

    throw error; // Bubble up other errors
  }
}

module.exports = { SendFCMNotification };
