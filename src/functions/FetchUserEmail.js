const { app } = require('@azure/functions');
const { Firestore } = require('@google-cloud/firestore');

// Load service account key from environment variable or local file
const firebaseBase64Key = process.env.FIREBASE_BASE64_KEY;

let serviceAccount;
try {
    if (!firebaseBase64Key) {
        throw new Error("FIREBASE_BASE64_KEY environment variable is missing.");
    }

    const decodedKey = Buffer.from(firebaseBase64Key, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(decodedKey);

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("Decoded FIREBASE_BASE64_KEY does not contain valid JSON structure.");
    }
} catch (error) {
    console.error("Failed to decode and parse FIREBASE_BASE64_KEY:", error);
    throw new Error("Failed to decode and parse FIREBASE_BASE64_KEY. Ensure it's correctly base64-encoded.");
}

// Initialize Firebase Firestore with decoded credentials
const firestore = new Firestore({
    projectId: serviceAccount.project_id,
    credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key
    }
});

app.http('FetchUserEmail', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const { userId } = await request.json();
            context.log("Received userId:", userId);

            if (!userId) {
                return { status: 400, body: JSON.stringify({ message: "Missing userId" }) };
            }

            // Fetch the user document from Firestore
            const userDoc = await firestore.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                return { status: 404, body: JSON.stringify({ message: `User with userId ${userId} not found.` }) };
            }

            const userEmail = userDoc.data().email;
            if (!userEmail) {
                return { status: 404, body: JSON.stringify({ message: `Email not found for userId ${userId}.` }) };
            }

            return { status: 200, body: JSON.stringify({ email: userEmail }) };
        } catch (error) {
            context.log("Error in FetchUserEmail function:", error);
            return { status: 500, body: JSON.stringify({ message: `Error: ${error.message}` }) };
        }
    }
});
