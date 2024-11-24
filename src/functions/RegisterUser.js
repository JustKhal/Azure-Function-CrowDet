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
        try {
            const { email, password, role } = await request.json();

            // Basic validation
            if (!email || !password || !role) {
                return { status: 400, body: { success: false, message: "Missing required fields" } };
            }

            if (!/^[\w.%+-]+@gmail\.com$/.test(email)) {
                return { status: 400, body: { success: false, message: "Only gmail.com addresses are allowed" } };
            }

            if (password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
                return { status: 400, body: { success: false, message: "Password must be at least 8 characters long and contain both letters and numbers" } };
            }

            if (!['leader', 'member'].includes(role)) {
                return { status: 400, body: { success: false, message: "Invalid role provided" } };
            }

            // Check if email is already registered
            const usersRef = firestore.collection('users');
            const snapshot = await usersRef.where('email', '==', email).get();
            if (!snapshot.empty) {
                return { status: 400, body: { success: false, message: "Email is already registered" } };
            }

            // Proceed with user creation
            const userDoc = {
                email: email,
                role: role
            };
            const newUserRef = usersRef.doc(); // Generate a new document ID
            await newUserRef.set(userDoc);

            return { status: 200, body: { success: true, message: "User registered successfully" } };
        } catch (error) {
            context.log("Error in RegisterUser function:", error);
            return { status: 500, body: { success: false, message: "Internal server error" } };
        }
    }
});
