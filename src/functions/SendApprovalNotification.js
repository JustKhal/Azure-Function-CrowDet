const { app } = require('@azure/functions');
const { Firestore } = require('@google-cloud/firestore');
const { SendFCMNotification } = require('./SendFCMNotification.js');

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

// Helper function to parse request body if needed
async function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body);
  } else if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let done, value;

    while ({ done, value } = await reader.read(), !done) {
      result += decoder.decode(value);
    }
    return JSON.parse(result);
  } else {
    return request.body;
  }
}

// Azure Function handler
app.http('SendApprovalNotification', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    let requestBody;

    try {
      requestBody = await parseRequestBody(request);
      context.log("Received request body:", requestBody);
    } catch (error) {
      context.log("Error parsing request body:", error);
      return { status: 400, body: "Invalid JSON format in request body." };
    }

    const { userId, apkFileName, groupId, status } = requestBody;

    // Check for missing parameters
    if (!userId || !apkFileName || !groupId || !status) {
      context.log("Missing required parameters:", { userId, apkFileName, groupId, status });
      return { status: 400, body: "Missing required parameters: userId, apkFileName, groupId, or status." };
    }

    try {
      // Step 1: Fetch leaderId and FCM token from the group document using groupId
      const groupDoc = await firestore.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        context.log(`Group with ID ${groupId} not found.`);
        return { status: 404, body: "Group not found." };
      }

      const leaderId = groupDoc.data().leaderId;
      if (!leaderId) {
        context.log(`No leader found for group with ID ${groupId}.`);
        return { status: 404, body: "Leader not found for group." };
      }

      // Step 2: Fetch the leader's FCM token from the users collection
      const leaderDoc = await firestore.collection("users").doc(leaderId).get();
      if (!leaderDoc.exists || !leaderDoc.data().fcmToken) {
        context.log(`Leader with ID ${leaderId} does not have a valid FCM token.`);
        return { status: 404, body: "Leader FCM token not found." };
      }

      const leaderFcmToken = leaderDoc.data().fcmToken;
      context.log("Leader FCM Token:", leaderFcmToken);

      // Step 3: Fetch the requesting user's email from the users collection
      const userDoc = await firestore.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        context.log(`User with ID ${userId} not found.`);
        return { status: 404, body: "User not found." };
      }

      const userEmail = userDoc.data().email || userId; // Use email if available, fallback to userId

      // Step 4: Check for pending approval requests in installRequests collection
      context.log("Checking Firestore for pending approval requests...");
      const approvalRequestSnapshot = await firestore.collection("installRequests")
        .where("apkFileName", "==", apkFileName)
        .where("groupId", "==", groupId)
        .where("userId", "==", userId)
        .where("status", "==", status)
        .get();

      if (approvalRequestSnapshot.empty) {
        context.log("No pending approval requests found.");
        return { status: 404, body: "No pending approval requests found." };
      }

      // Step 5: Send FCM notification to the leader with the user's email
      const installRequestId = approvalRequestSnapshot.docs[0].id;
      context.log("Sending notification via FCM to Leader's Token...");
      const response = await SendFCMNotification(
        leaderFcmToken,
        {
          title: "Approval Request",
          body: `User ${userEmail} has requested to install ${apkFileName}.`
        },
        {
          navigateTo: "AdminApprovalScreen",
          installRequestId: installRequestId.toString()
        }
      );
      context.log("Notification sent successfully:", response, "installRequestID:", installRequestId);

      return { status: 200, body: "Notification sent successfully." };
    } catch (error) {
      context.log("Error during notification process:", error);
      return { status: 500, body: "Error sending notification: " + error.message };
    }
  }
});
