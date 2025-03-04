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
    private_key: serviceAccount.private_key,
  },
});

app.http('FetchGroupMembers', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    try {
      const { groupId } = await request.json();
      context.log("Received groupId:", groupId);

      if (!groupId) {
        context.log("Error: Missing groupId");
        return { status: 400, body: JSON.stringify({ message: 'Missing groupId' }) };
      }

      const groupDoc = await firestore.collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        context.log("Group not found for groupId:", groupId);
        return { status: 404, body: JSON.stringify({ message: 'Group not found' }) };
      }

      const memberIds = groupDoc.data().memberIds || [];
      context.log("Fetched member IDs:", memberIds);

      if (memberIds.length === 0) {
        context.log("Returning empty members array");
        return { status: 200, body: JSON.stringify({ members: [] }) };
      }

      const memberPromises = memberIds.map(async (id) => {
        const userDoc = await firestore.collection('users').doc(id).get();
        if (!userDoc.exists) return null;

        const userData = { id: userDoc.id, ...userDoc.data() };

        // Fetch installation requests for this user
        const requestsSnapshot = await firestore
          .collection('installRequests')
          .where('userId', '==', id)
          .where('status', '==', 'pending')
          .get();

        const installRequests = requestsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        return { ...userData, installRequests };
      });

      const members = (await Promise.all(memberPromises)).filter(Boolean);
      context.log("Returning members with installRequests:", JSON.stringify({ members }));
      context.log("Final response members:", JSON.stringify(members, null, 2));

      return { status: 200, body: JSON.stringify({ members }) };
    } catch (error) {
      context.log('Error fetching members:', error);
      return { status: 500, body: JSON.stringify({ message: `Error: ${error.message}` }) };
    }
  },
});
