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

app.http('CreateGroupInvitation', {
    methods: ['POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        let requestBody;

        try {
            requestBody = await request.json();
            const { leaderId, memberEmail, groupId, groupName } = requestBody;

            if (!leaderId || !memberEmail || !groupId || !groupName) {
                context.log("Missing required parameters");
                return {
                    status: 400,
                    body: JSON.stringify({ status: "error", message: "Missing required parameters" })
                };
            }

            // Check if the email connected to a user
            const userSnapshot = await firestore.collection('users')
                .where('email', '==', memberEmail)
                .get();

            if (userSnapshot.empty) {
                context.log(`No user found with email: ${memberEmail}`);
                return {
                    status: 404,
                    body: JSON.stringify({ status: "error", message: "User not found" })
                };
            }

            const userId = userSnapshot.docs[0].id;

            // Check if the leader is authorized for the group
            const groupDoc = await firestore.collection('groups').doc(groupId).get();
            if (!groupDoc.exists || groupDoc.data().leaderId !== leaderId) {
                context.log(`Leader ${leaderId} is not authorized for group ${groupId}`);
                return {
                    status: 403,
                    body: JSON.stringify({ status: "error", message: "Unauthorized" })
                };
            }

            // Check if the user is already in the group
            const groupMembers = groupDoc.data().memberIds || [];
            if (groupMembers.includes(userId)) {
                context.log(`User is already a member of the group: ${groupId}`);
                return {
                    status: 409,
                    body: JSON.stringify({ status: "error", message: "User is already a member of this group" })
                };
            }

            // Check if an invitation already exists for this user in this group
            const existingInvitationSnapshot = await firestore.collection('invitations')
                .where('userId', '==', userId)
                .where('groupId', '==', groupId)
                .where('groupName', '==', groupName)
                .where('status', '==', 'pending')
                .get();

            if (!existingInvitationSnapshot.empty) {
                context.log("An invitation already exists for this user in this group");
                return { status: 409,
                  body: JSON.stringify({ status: "error", message: "An invitation has already been sent to this user." }) };
            }

            const invitation = {
                userId: userId,
                groupId: groupId,
                groupName: groupName,
                status: 'pending'
            };

            await firestore.collection('invitations').add(invitation);

            return {
                status: 200,
                body: JSON.stringify({ status: "success", message: "Invitation created successfully" })
            };
        } catch (error) {
            context.log("Error during invitation process:", error);
            return {
                status: 500,
                body: JSON.stringify({ status: "error", message: `Error: ${error.message}` })
            };
        }
    }
});
