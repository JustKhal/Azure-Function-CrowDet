const { app } = require("@azure/functions");
const { Firestore } = require("@google-cloud/firestore");

// Load service account key from environment variable or local file
const firebaseBase64Key = process.env.FIREBASE_BASE64_KEY;

let serviceAccount;
try {
    if (!firebaseBase64Key) {
        throw new Error("FIREBASE_BASE64_KEY environment variable is missing.");
    }

    const decodedKey = Buffer.from(firebaseBase64Key, "base64").toString("utf-8");
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

app.http("DeleteGroup", {
    methods: ["POST"],
    authLevel: "function",
    handler: async (request, context) => {
        try {
            const { leaderId, groupId } = await request.json();

            if (!leaderId || !groupId) {
                return { status: 400, body: JSON.stringify({ status: "error", message: "Missing required parameters." }) };
            }

            // Validate that the leaderId matches the leaderId of the group
            const groupDoc = await firestore.collection("groups").doc(groupId).get();
            if (!groupDoc.exists || groupDoc.data().leaderId !== leaderId) {
                return { status: 403, body: JSON.stringify({ status: "error", message: "Unauthorized" }) };
            }

            // Start a batch for atomic operations
            const batch = firestore.batch();

            // Delete the group document
            const groupRef = firestore.collection("groups").doc(groupId);
            batch.delete(groupRef);

            // Delete all related installation requests
            const installRequestsSnapshot = await firestore
                .collection("installRequests")
                .where("groupId", "==", groupId)
                .get();

            installRequestsSnapshot.forEach((doc) => {
                batch.delete(doc.ref);
            });

            // Commit the batch operation
            await batch.commit();

            return { status: 200, body: JSON.stringify({ status: "success", message: "Group and related data deleted successfully." }) };
        } catch (error) {
            context.log("Error in DeleteGroup function:", error);
            return { status: 500, body: JSON.stringify({ status: "error", message: `Error: ${error.message}` }) };
        }
    }
});
