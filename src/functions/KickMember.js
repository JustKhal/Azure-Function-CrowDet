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

app.http('KickMember', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const { leaderId, memberEmail, groupId } = await request.json();

            if (!leaderId || !memberEmail || !groupId) {
                return { status: 400, body: JSON.stringify({ status: "error", message: "Missing required parameters." }) };
            }

            // Check if the current user is the Leader of the group
            const groupDoc = await firestore.collection('groups').doc(groupId).get();
            if (!groupDoc.exists || groupDoc.data().leaderId !== leaderId) {
                return { status: 403, body: JSON.stringify({ status: "error", message: "Unauthorized" }) };
            }

            // Fetch the user ID for the given email
            const userSnapshot = await firestore.collection('users')
                .where('email', '==', memberEmail)
                .get();

            if (userSnapshot.empty) {
                return { status: 404, body: JSON.stringify({ status: "error", message: "User not found" }) };
            }

            const userId = userSnapshot.docs[0].id;
            const userRef = firestore.collection('users').doc(userId);

            // Start a batch for atomic updates
            const batch = firestore.batch();

            // Remove the user from the group members
            const groupRef = firestore.collection('groups').doc(groupId);
            batch.update(groupRef, {
                memberIds: Firestore.FieldValue.arrayRemove(userId)
            });

            // Remove the groupId from the user's document
            batch.update(userRef, {
                groups: Firestore.FieldValue.arrayRemove(groupId)
            });

            // Delete all installation requests associated with the user for this group
            const installRequestsSnapshot = await firestore.collection('installRequests')
                .where('userId', '==', userId)
                .where('groupId', '==', groupId)
                .get();

            installRequestsSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Commit the batch operation
            await batch.commit();

            return { status: 200, body: JSON.stringify({ status: "success", message: "Member, group ID, and associated installation requests removed successfully." }) };
        } catch (error) {
            context.log("Error in KickMember function:", error);
            return { status: 500, body: JSON.stringify({ status: "error", message: `Error: ${error.message}` }) };
        }
    }
});
