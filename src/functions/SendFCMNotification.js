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

    // Get the access token
    const accessToken = await getAccessToken();

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
        throw new Error(`Failed to send FCM notification: ${errorData.error.message}`);
    }

    return await response.json(); // Return response for logging or debugging
}

module.exports = { SendFCMNotification };
