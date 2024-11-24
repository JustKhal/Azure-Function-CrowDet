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

app.http('LoginUser', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log("LoginUser function triggered.");
        try {
            const { email, password } = await request.json();
            context.log("Received request body:", { email, password: password ? "******" : "null" });

            if (!email || !password) {
                context.log("Validation failed: Missing email or password.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Missing email or password" }) };
            }

            // Validate email format
            const emailRegex = /^[\w.%+-]+@gmail\.com$/;
            if (!emailRegex.test(email)) {
                context.log("Validation failed: Invalid email format.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Invalid email format" }) };
            }

            if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
                context.log("Validation failed: Password does not meet criteria.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Password must be at least 8 characters long and contain both letters and numbers" }) };
            }

            // Check if user exists in Firestore
            const userSnapshot = await firestore.collection('users').where('email', '==', email).get();
            if (userSnapshot.empty) {
                context.log("Validation failed: User not found in Firestore.");
                return { status: 404, body: JSON.stringify({ success: false, message: "User not found" }) };
            }

            context.log("Validation passed: User found in Firestore.");
            const response = { success: true, message: "Email and Password already followed the policy" };
            context.log("Response:", response);
            return { status: 200, body: JSON.stringify(response) };
        } catch (error) {
            context.log("Error in LoginUser function:", error);
            return { status: 500, body: JSON.stringify({ success: false, message: "Internal server error" }) };
        }
    }
});