const { app } = require('@azure/functions');
const { Firestore } = require('@google-cloud/firestore');
const admin = require('firebase-admin');

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

// Initialize Firebase Admin and Firestore
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const firestore = new Firestore({
    projectId: serviceAccount.project_id,
    credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key
    }
});

app.http('RegisterUser', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log("RegisterUser function triggered.");
        try {
            const { email, password, role } = await request.json();
            context.log("Received request body:", { email, role, password: password ? "******" : "null" });

            if (!email || !password || !role) {
                context.log("Validation failed: Missing required fields.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Missing required fields" }) };
            }

            if (!/^[\w.%+-]+@gmail\.com$/.test(email)) {
                context.log("Validation failed: Invalid email format.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Only gmail.com addresses are allowed" }) };
            }

            if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
                context.log("Validation failed: Password does not meet criteria.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Password must be at least 8 characters long and contain both letters and numbers" }) };
            }

            if (!['leader', 'member'].includes(role)) {
                context.log("Validation failed: Invalid role provided.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Invalid role provided" }) };
            }

            // Check if email is already registered
            const usersRef = firestore.collection('users');
            const snapshot = await usersRef.where('email', '==', email).get();
            if (!snapshot.empty) {
                context.log("Validation failed: Email is already registered.");
                return { status: 400, body: JSON.stringify({ success: false, message: "Email is already registered" }) };
            }

            // Create user in Firebase Authentication
            context.log("Creating user in Firebase Authentication.");
            const userRecord = await admin.auth().createUser({
                email: email,
                password: password,
                emailVerified: false // Require email verification
            });

            context.log("User created in Firebase Authentication:", userRecord.uid);

            // Save user role in Firestore
            context.log("Saving user in Firestore.");
            await usersRef.doc(userRecord.uid).set({
                email: email,
                role: role
            });

            context.log("User registered successfully in Firestore.");
            return { status: 200, body: JSON.stringify({ success: true, message: "User registered successfully" }) };
        } catch (error) {
            context.log("Error in RegisterUser function:", error);
            if (error.code === 'auth/email-already-exists') {
                return { status: 400, body: JSON.stringify({ success: false, message: "Email is already registered in Authentication." }) };
            }
            return { status: 500, body: JSON.stringify({ success: false, message: "Internal server error" }) };
        }
    }
});
