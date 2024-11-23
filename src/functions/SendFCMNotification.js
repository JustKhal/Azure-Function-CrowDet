const { GoogleAuth } = require('google-auth-library');

// Load service account key from environment variable or local file
const serviceAccountKey = JSON.parse(Buffer.from(process.env.FIREBASE_BASE64_KEY, 'base64').toString('utf-8'));

// Function to get an OAuth 2.0 token for Google API authentication
async function getAccessToken() {
    const auth = new GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();
    console.log("Access Token retrieved successfully:", token); // Log Access Token
    return token.token;
}

// Dynamic import of `node-fetch` for compatibility with ES module syntax
async function fetchWithDynamicImport(url, options) {
    const fetch = (await import('node-fetch')).default;
    return fetch(url, options);
}

// Function to send a push notification via FCM
async function SendFCMNotification(registrationToken, notification, dataPayload) {
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccountKey.project_id}/messages:send`;

    // Ensure title and body are strings, not objects
    const payload = {
        message: {
            token: registrationToken,
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: dataPayload  // Adding data payload as an additional field
        }
    };

    try {
        // Get the access token
        const accessToken = await getAccessToken();
        console.log("Access Token retrieved successfully.");

        // Log details for debugging purposes
        console.log("FCM URL:", fcmUrl);
        console.log("Registration Token:", registrationToken);
        console.log("Payload:", JSON.stringify(payload));

        // Send the notification request to FCM using the dynamically imported `fetch`
        const response = await fetchWithDynamicImport(fcmUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Failed to send FCM notification:", errorData);

            if (errorData.error) {
                if (errorData.error.code === 404) {
                    throw new Error("FCM token not found or invalid.");
                } else if (errorData.error.message.includes("registration token")) {
                    throw new Error("FCM registration token is invalid or expired.");
                } else {
                    throw new Error(`FCM Error: ${errorData.error.message}`);
                }
            } else {
                throw new Error("Unexpected FCM error occurred.");
            }
        }

        const responseData = await response.json();
        console.log("FCM Notification sent successfully:", responseData);
        return responseData;

    } catch (error) {
        console.error("Error during FCM notification:", error);

        // Add logic to re-trigger token update or notify the user if necessary
        if (error.message.includes("FCM token")) {
            console.error("The FCM token seems to be invalid or expired. Consider updating the token.");
        }

        throw error; // This will bubble up the error to the calling function
    }
}

module.exports = { SendFCMNotification };
