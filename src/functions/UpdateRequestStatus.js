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

app.http('UpdateRequestStatus', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    const { requestId, newStatus, userId } = await request.json();
    context.log(`Updating request status for ${requestId} by ${userId} to ${newStatus}`);

    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== 'leader') {
        return { status: 403, body: 'User is not authorized as a leader.' };
      }

      await firestore.collection('installRequests').doc(requestId).update({ status: newStatus });
      return { status: 200, body: 'Request status updated successfully' };
    } catch (error) {
      context.log('Error updating request status:', error);
      return { status: 500, body: 'Error updating request status' };
    }
  }
});
