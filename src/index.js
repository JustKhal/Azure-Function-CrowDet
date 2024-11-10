const { app } = require('@azure/functions');
require('./functions/SendApprovalNotification'); // Path adjusted if needed
require('./functions/SendFCMNotification');
require('./functions/FetchGroupMembers');
require('./functions/CreateGroupInvitation');
app.setup({
    enableHttpStream: true,
});
