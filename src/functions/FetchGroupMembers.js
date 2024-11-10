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

app.http('FetchGroupMembers', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const { groupId } = await request.json();
            if (!groupId) {
                return { status: 400, body: 'Missing groupId' };
            }

            // Fetch group document
            const groupDoc = await firestore.collection('groups').doc(groupId).get();
            if (!groupDoc.exists) {
                return { status: 404, body: 'Group not found' };
            }

            const memberIds = groupDoc.data().memberIds || [];
            if (memberIds.length === 0) {
                return { status: 200, body: [] }; // No members
            }

            // Fetch member details
            const memberPromises = memberIds.map(id => firestore.collection('users').doc(id).get());
            const memberDocs = await Promise.all(memberPromises);

            const members = memberDocs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return { status: 200, body: members };
        } catch (error) {
            context.log('Error fetching members:', error);
            return { status: 500, body: `Error: ${error.message}` };
        }
    }
});
