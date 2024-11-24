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

            context.log("Creating new user in Firestore.");
            const userDoc = { email: email, role: role };
            await usersRef.doc().set(userDoc);

            context.log("User registered successfully.");
            return { status: 200, body: JSON.stringify({ success: true, message: "User registered successfully" }) };
        } catch (error) {
            context.log("Error in RegisterUser function:", error);
            return { status: 500, body: JSON.stringify({ success: false, message: "Internal server error" }) };
        }
    }
});
