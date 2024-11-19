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

app.http('FetchGroupRequests', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log('Received request to FetchGroupRequests');

    let userId;
    try {
      const requestBody = await request.json();
      userId = requestBody.userId;
      context.log('User ID from request:', userId);
      context.log('Request body received:', JSON.stringify(requestBody)); // Log the request payload
    } catch (error) {
      context.log('Failed to parse request body:', error);
      return { status: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    if (!userId) {
      context.log('User ID is missing in the request');
      return { status: 400, body: JSON.stringify({ error: 'User ID is required' }) };
    }

    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        context.log('User not found:', userId);
        return { status: 404, body: JSON.stringify({ error: 'User not found' }) };
      }

      const userData = userDoc.data();
      if (!userData || userData.role !== 'leader') {
        context.log('User is not authorized as a leader:', userId);
        return { status: 403, body: JSON.stringify({ error: 'User is not authorized as a leader.' }) };
      }

      const groups = userData.groups || [];
      const requests = [];

      for (const groupId of groups) {
        const groupDoc = await firestore.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) {
            context.log('Group not found for groupId:', groupId);
            continue; // Skip to the next group if this one is missing
        }

        const groupName = groupDoc.data().groupName || 'Unknown Group';
        context.log(`Processing group: ${groupName} (ID: ${groupId})`);

        const requestSnapshot = await firestore.collection('installRequests')
            .where('status', '==', 'pending')
            .where('groupId', '==', groupId)
            .get();

        for (const doc of requestSnapshot.docs) {
            const requestData = doc.data();

            // Fetch the user email from Firestore
            const requestUserDoc = await firestore.collection('users').doc(requestData.userId).get();
            const userEmail = requestUserDoc.exists ? requestUserDoc.data().email : 'Unknown User';

            requests.push({
                id: doc.id,
                groupId,
                groupName,
                userEmail, // Include fetched email
                apkFileName: requestData.apkFileName,
            });
            context.log(`Added request for group: ${groupName}, user: ${userEmail}`);
        }
    }

    context.log(`Returning ${requests.length} requests`);
    return { status: 200, body: JSON.stringify({ body: requests }) };
} catch (error) {
    context.log('Error fetching group requests:', error);
    return { status: 500, body: JSON.stringify({ error: 'Error fetching group requests' }) };
}
}
});
